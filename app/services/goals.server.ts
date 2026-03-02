/**
 * Goals Service
 *
 * Manages the goal engine lifecycle:
 * - CRUD operations for goals
 * - AI inference for goal prompts and category
 * - Generates goal executions by analyzing shop data with AI
 * - Executes background actions for goal executions
 * - Handles goal execution dismissal
 */

import { generateText, stepCountIs } from "ai";
import { openai } from "@ai-sdk/openai";
import prisma from "../db.server";
import { mcpManager } from "../mcp/mcpManager.server";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const ANALYSIS_TIMEOUT_MS = 60_000;
const ANALYSIS_STEP_TIMEOUT_MS = 15_000;
const EXECUTION_TIMEOUT_MS = 60_000;
const EXECUTION_STEP_TIMEOUT_MS = 20_000;
const MAX_TOOL_STEPS = 3;
const BATCH_CONCURRENCY = 3;
const MAX_RETRIES = 2;
const RETRY_BASE_MS = 1_000;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface GoalExecutionFilters {
  status?: string;
  category?: string;
  priority?: string;
}

interface AIVerdictResponse {
  applicable: boolean;
  title: string;
  description: string;
  metadata?: Record<string, unknown>;
}

interface GoalAnalysisResult {
  goalId: string;
  ruleKey: string;
  executionId?: string;
  status: "created" | "not_applicable" | "error";
  error?: string;
}

export interface GoalInferenceResult {
  category: string;
  analysisPrompt: string;
  actionPrompt: string;
  requiredServers: string[];
}

export interface CreateGoalInput {
  title: string;
  description: string;
  priority?: string;
  cronIntervalMins?: number;
  category?: string;
  analysisPrompt?: string;
  actionPrompt?: string;
  requiredServers?: string[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function extractJSON(raw: string): unknown {
  if (!raw || raw.trim().length === 0) return null;

  const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const toParse = fenceMatch ? fenceMatch[1]!.trim() : raw.trim();

  try {
    return JSON.parse(toParse);
  } catch {
    const braceStart = toParse.indexOf("{");
    const braceEnd = toParse.lastIndexOf("}");
    if (braceStart !== -1 && braceEnd > braceStart) {
      try {
        return JSON.parse(toParse.slice(braceStart, braceEnd + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

function isVerdictResponse(obj: unknown): obj is AIVerdictResponse {
  if (!obj || typeof obj !== "object") return false;
  const o = obj as Record<string, unknown>;
  return typeof o.applicable === "boolean" && typeof o.title === "string";
}

async function withRetry<T>(
  fn: () => Promise<T>,
  label: string,
  maxRetries = MAX_RETRIES,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < maxRetries) {
        const delayMs = RETRY_BASE_MS * 2 ** attempt;
        console.warn(
          `[Goals] Retry ${attempt + 1}/${maxRetries} for "${label}" after ${delayMs}ms`,
        );
        await sleep(delayMs);
      }
    }
  }
  throw lastError;
}

async function batchProcess<T, R>(
  items: T[],
  concurrency: number,
  handler: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency);
    const batchResults = await Promise.allSettled(batch.map(handler));

    for (const result of batchResults) {
      if (result.status === "fulfilled") {
        results.push(result.value);
      } else {
        console.error("[Goals] Batch item failed:", result.reason);
      }
    }
  }
  return results;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 64);
}

const ANALYSIS_SYSTEM_PROMPT = `You are an AI assistant analyzing a Shopify merchant's data to determine if a goal action is applicable.

You have access to tools from connected data sources. Use them to gather information.

SHOPIFY TOOL GUIDANCE:
- For reading Shopify data, ALWAYS use the shopify_query tool. It handles GraphQL Relay patterns automatically.
  Example: resource="products", fields=["id","title","status","totalInventory"], limit=5
  Example: resource="orders", fields=["id","name","createdAt","totalPriceSet.shopMoney.amount"], filter="fulfillment_status:shipped", limit=10
- Date filters MUST use ISO 8601: created_at:>=2026-01-01T00:00:00Z
- Do NOT use relative dates like "7 days ago" or "last week" — compute the ISO date instead.
- Use shopify_graphql only for mutations or queries shopify_query cannot express.
- NEVER guess Shopify field names. The tools will reject invalid fields with suggestions.

IMPORTANT — tool-call discipline:
- NEVER repeat a tool call you already made. If you already queried a resource, use the results you have.
- If a tool call fails or times out, do NOT retry the same call. Mark the data as unavailable and make your verdict based on what you have.
- If you cannot gather enough data to make a determination, return applicable: false.

After your analysis, respond with ONLY a JSON object (no markdown fences, no extra text):

{
  "applicable": <boolean — true if the goal action is relevant>,
  "title": "<clear, actionable title>",
  "description": "<why this matters and what the merchant should do>",
  "metadata": { <optional additional context or data points> }
}

Rules:
- "applicable" must be a boolean. Set to true only if the data supports the action.
- Keep "title" under 80 characters.
- Keep "description" under 300 characters.
- "metadata" is optional; omit or set to {} if nothing extra.
- Do NOT wrap the JSON in markdown code fences.`;

// ---------------------------------------------------------------------------
// Goal CRUD
// ---------------------------------------------------------------------------

export async function getGoalsForShop(shop: string) {
  return prisma.goal.findMany({
    where: { shop },
    orderBy: { createdAt: "desc" },
  });
}

export async function getGoalById(id: string) {
  return prisma.goal.findUnique({ where: { id } });
}

export async function createGoal(shop: string, input: CreateGoalInput) {
  const ruleKey = slugify(input.title) + "_" + Date.now().toString(36);

  return prisma.goal.create({
    data: {
      shop,
      ruleKey,
      title: input.title,
      description: input.description,
      category: input.category ?? "general",
      priority: input.priority ?? "medium",
      requiredServers: JSON.stringify(input.requiredServers ?? []),
      analysisPrompt: input.analysisPrompt ?? "",
      actionPrompt: input.actionPrompt ?? "",
      cronIntervalMins: input.cronIntervalMins ?? 240,
    },
  });
}

export async function updateGoal(
  id: string,
  data: Partial<Omit<CreateGoalInput, "requiredServers"> & { requiredServers?: string[]; enabled?: boolean }>,
) {
  const updateData: Record<string, unknown> = {};

  if (data.title !== undefined) updateData.title = data.title;
  if (data.description !== undefined) updateData.description = data.description;
  if (data.category !== undefined) updateData.category = data.category;
  if (data.priority !== undefined) updateData.priority = data.priority;
  if (data.analysisPrompt !== undefined) updateData.analysisPrompt = data.analysisPrompt;
  if (data.actionPrompt !== undefined) updateData.actionPrompt = data.actionPrompt;
  if (data.cronIntervalMins !== undefined) updateData.cronIntervalMins = data.cronIntervalMins;
  if (data.enabled !== undefined) updateData.enabled = data.enabled;
  if (data.requiredServers !== undefined) updateData.requiredServers = JSON.stringify(data.requiredServers);

  return prisma.goal.update({ where: { id }, data: updateData });
}

export async function deleteGoal(id: string) {
  await prisma.goalExecution.deleteMany({ where: { goalId: id } });
  return prisma.goal.delete({ where: { id } });
}

// ---------------------------------------------------------------------------
// AI Goal Inference
// ---------------------------------------------------------------------------

const VALID_CATEGORIES = ["catalog", "reporting", "customer", "marketing", "operations", "inventory", "sync", "general"];

export async function inferGoalDetails(
  shop: string,
  title: string,
  description: string,
): Promise<GoalInferenceResult> {
  await mcpManager.ensureInitialized(shop);
  const { servers } = mcpManager.getFullStatus();
  const connectedServers = servers
    .filter((s) => s.connected)
    .map((s) => s.name);

  const response = await generateText({
    model: openai("gpt-4o-mini"),
    system: `You are an AI assistant that helps configure automated goals for a Shopify merchant.

Given a goal title and description, generate the technical configuration needed to run it.

The merchant has these MCP servers connected: ${connectedServers.join(", ") || "none"}

Respond with ONLY a JSON object (no markdown fences):

{
  "category": "<one of: inventory, customer, reporting, sync, marketing, general>",
  "analysisPrompt": "<prompt that an AI agent will use to check if this goal action is currently applicable, using the connected tools>",
  "actionPrompt": "<prompt that an AI agent will use to execute the goal action using the connected tools>",
  "requiredServers": ["<list of required MCP server names from the connected list>"]
}

Guidelines for prompts:
- analysisPrompt: Should instruct the AI to check preconditions. Reference specific tool names and parameters.
- actionPrompt: Should instruct the AI to perform the actual action. Be specific about what data to read/write.
- requiredServers: Only include servers from the connected list that are needed for this goal.
- category must be one of: inventory, customer, reporting, sync, marketing, general`,
    prompt: `Goal Title: ${title}\nGoal Description: ${description}`,
    timeout: { totalMs: 30_000, stepMs: 15_000 },
  });

  const parsed = extractJSON(response.text) as Record<string, unknown> | null;

  if (!parsed) {
    throw new Error("Failed to parse AI inference response");
  }

  const category = VALID_CATEGORIES.includes(parsed.category as string)
    ? (parsed.category as string)
    : "general";

  return {
    category,
    analysisPrompt: (parsed.analysisPrompt as string) || "",
    actionPrompt: (parsed.actionPrompt as string) || "",
    requiredServers: Array.isArray(parsed.requiredServers) ? parsed.requiredServers as string[] : [],
  };
}

// ---------------------------------------------------------------------------
// Goal Execution Queries
// ---------------------------------------------------------------------------

const PRIORITY_ORDER: Record<string, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

export async function getGoalExecutionsForShop(
  shop: string,
  filters?: GoalExecutionFilters,
  pagination?: { limit: number; offset: number },
) {
  const where: {
    shop: string;
    status?: string;
    category?: string;
    priority?: string;
  } = { shop };

  if (filters?.status) where.status = filters.status;
  if (filters?.category) where.category = filters.category;
  if (filters?.priority) where.priority = filters.priority;

  const now = new Date();
  const results = await prisma.goalExecution.findMany({
    where: {
      ...where,
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
    orderBy: [{ createdAt: "desc" }],
  });

  results.sort((a, b) => {
    const pa = PRIORITY_ORDER[a.priority] ?? 99;
    const pb = PRIORITY_ORDER[b.priority] ?? 99;
    if (pa !== pb) return pa - pb;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  const total = results.length;
  if (pagination) {
    return {
      data: results.slice(pagination.offset, pagination.offset + pagination.limit),
      total,
    };
  }
  return { data: results, total };
}

// ---------------------------------------------------------------------------
// Goal Analysis (generates GoalExecutions)
// ---------------------------------------------------------------------------

export async function analyzeGoals(shop: string) {
  console.info(`[Goals] Starting analysis for shop: ${shop}`);

  await mcpManager.ensureInitialized(shop);

  const { servers: connectedServers } = mcpManager.getFullStatus();
  const connectedServerNames = new Set(
    connectedServers.filter((s) => s.connected).map((s) => s.name),
  );

  console.info(
    `[Goals] Connected servers: ${Array.from(connectedServerNames).join(", ")}`,
  );

  const goals = await prisma.goal.findMany({
    where: { shop, enabled: true },
  });

  console.info(`[Goals] Found ${goals.length} enabled goals`);

  const applicableGoals = goals.filter((goal) => {
    const requiredServers = JSON.parse(goal.requiredServers) as string[];
    if (requiredServers.length === 0) return true;

    const allConnected = requiredServers.every((s) =>
      connectedServerNames.has(s),
    );

    if (!allConnected) {
      console.info(
        `[Goals] Skipping goal "${goal.ruleKey}" — missing servers: ${requiredServers.filter((s) => !connectedServerNames.has(s)).join(", ")}`,
      );
    }

    return allConnected;
  });

  console.info(
    `[Goals] ${applicableGoals.length} goals have all required servers connected`,
  );

  const tools = await mcpManager.getToolsForAI();
  const hasTools = Object.keys(tools).length > 0;

  const results = await batchProcess<(typeof applicableGoals)[number], GoalAnalysisResult>(
    applicableGoals,
    BATCH_CONCURRENCY,
    (goal) => analyzeGoal(goal, shop, tools, hasTools),
  );

  console.info(
    `[Goals] Analysis complete. Processed ${results.length}/${applicableGoals.length} goals.`,
  );

  return {
    shop,
    processedGoals: results.length,
    results,
  };
}

async function analyzeGoal(
  goal: {
    id: string;
    ruleKey: string;
    requiredServers: string;
    analysisPrompt: string;
    category: string;
    priority: string;
    actionPrompt: string;
    cronIntervalMins: number;
  },
  shop: string,
  tools: Record<string, unknown>,
  hasTools: boolean,
): Promise<GoalAnalysisResult> {
  try {
    const verdict = await withRetry(async () => {
      console.info(`[Goals] Analyzing goal: ${goal.ruleKey}`);

      const response = await generateText({
        model: openai("gpt-4o-mini"),
        system: ANALYSIS_SYSTEM_PROMPT,
        prompt: goal.analysisPrompt,
        ...(hasTools
          ? {
              tools: tools as Parameters<typeof generateText>[0]["tools"],
              stopWhen: stepCountIs(MAX_TOOL_STEPS),
            }
          : {}),
        timeout: {
          totalMs: ANALYSIS_TIMEOUT_MS,
          stepMs: ANALYSIS_STEP_TIMEOUT_MS,
        },
      });

      const parsed = extractJSON(response.text);
      if (!isVerdictResponse(parsed)) {
        throw new Error(
          `Invalid verdict JSON — raw: ${response.text.slice(0, 200)}`,
        );
      }

      return parsed;
    }, goal.ruleKey);

    console.info(
      `[Goals] Goal "${goal.ruleKey}" verdict: ${verdict.applicable ? "applicable" : "not applicable"}`,
    );

    if (!verdict.applicable) {
      return { goalId: goal.id, ruleKey: goal.ruleKey, status: "not_applicable" };
    }

    const requiredServers = JSON.parse(goal.requiredServers) as string[];

    const existing = await prisma.goalExecution.findFirst({
      where: { shop, goalId: goal.id },
    });

    if (existing && ["executed", "dismissed", "completed"].includes(existing.status)) {
      console.info(
        `[Goals] Skipping goal "${goal.ruleKey}" — execution already ${existing.status}`,
      );
      return { goalId: goal.id, ruleKey: goal.ruleKey, status: "not_applicable" as const };
    }

    const data = {
      title: verdict.title,
      description: verdict.description,
      category: goal.category,
      priority: goal.priority,
      actionPrompt: goal.actionPrompt,
      mcpServersUsed: requiredServers.join(","),
      metadata: verdict.metadata ? JSON.stringify(verdict.metadata) : null,
      status: "new",
      expiresAt: new Date(Date.now() + goal.cronIntervalMins * 60 * 1000),
    };

    const execution = existing
      ? await prisma.goalExecution.update({
          where: { id: existing.id },
          data: { ...data, updatedAt: new Date() },
        })
      : await prisma.goalExecution.create({
          data: { shop, goalId: goal.id, ...data },
        });

    console.info(
      `[Goals] Created/updated execution ${execution.id} for goal "${goal.ruleKey}"`,
    );

    return {
      goalId: goal.id,
      ruleKey: goal.ruleKey,
      executionId: execution.id,
      status: "created",
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(
      `[Goals] Error analyzing goal "${goal.ruleKey}": ${msg}`,
    );
    return { goalId: goal.id, ruleKey: goal.ruleKey, status: "error", error: msg };
  }
}

// ---------------------------------------------------------------------------
// Goal Execution
// ---------------------------------------------------------------------------

export async function executeGoalExecution(id: string) {
  console.info(`[Goals] Executing goal execution: ${id}`);

  const execution = await prisma.goalExecution.findUnique({
    where: { id },
  });

  if (!execution) {
    throw new Error(`GoalExecution ${id} not found`);
  }

  if (execution.status === "executed") {
    console.info(`[Goals] GoalExecution ${id} already executed`);
    return execution;
  }

  await mcpManager.ensureInitialized(execution.shop);

  const tools = await mcpManager.getToolsForAI();
  const hasTools = Object.keys(tools).length > 0;

  try {
    await prisma.goalExecution.update({
      where: { id },
      data: { status: "executing" },
    });

    const response = await generateText({
      model: openai("gpt-4o-mini"),
      system: `You are an AI assistant executing an action for a Shopify merchant.

You have access to tools from connected data sources. Use them to complete the requested action.

SHOPIFY TOOL GUIDANCE:
- For reading Shopify data, ALWAYS use shopify_query (it handles Relay patterns automatically).
- For mutations, use shopify_graphql — but first call shopify_get_operation and shopify_get_type to look up the exact argument structure.
- Date filters MUST use ISO 8601: created_at:>=2026-01-01T00:00:00Z
- NEVER guess Shopify field names. The tools reject invalid fields with suggestions.

After completing the action, provide a brief summary of what you did and the results.`,
      prompt: `${execution.actionPrompt}

Context:
- Goal Execution: ${execution.title}
- Description: ${execution.description}
${execution.metadata ? `- Metadata: ${execution.metadata}` : ""}

Please execute this action and provide a summary of the results.`,
      ...(hasTools
        ? {
            tools: tools as Parameters<typeof generateText>[0]["tools"],
            stopWhen: stepCountIs(MAX_TOOL_STEPS),
          }
        : {}),
      timeout: {
        totalMs: EXECUTION_TIMEOUT_MS,
        stepMs: EXECUTION_STEP_TIMEOUT_MS,
      },
    });

    const updated = await prisma.goalExecution.update({
      where: { id },
      data: {
        status: "executed",
        resultSummary: response.text,
        executedAt: new Date(),
      },
    });

    console.info(`[Goals] Successfully executed goal execution ${id}`);

    return updated;
  } catch (error) {
    console.error(`[Goals] Error executing goal execution ${id}:`, error);

    await prisma.goalExecution.update({
      where: { id },
      data: {
        status: "error",
        resultSummary: `Error: ${error instanceof Error ? error.message : String(error)}`,
      },
    });

    throw error;
  }
}

export async function dismissGoalExecution(id: string) {
  console.info(`[Goals] Dismissing goal execution: ${id}`);

  return prisma.goalExecution.update({
    where: { id },
    data: {
      status: "dismissed",
      updatedAt: new Date(),
    },
  });
}
