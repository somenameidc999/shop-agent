/**
 * Goals Service
 *
 * Manages the goal engine lifecycle:
 * - CRUD operations for goals
 * - AI inference for goal prompts and category
 * - Generates goal executions by analyzing shop data with AI
 * - Impact scoring and multi-goal linking
 * - Executes background actions for goal executions
 * - Outcome measurement and tracking
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
const MAX_TOOL_STEPS = 10;
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
  goalId?: string;
  sortBy?: "impactScore" | "priority" | "newest";
}

interface AIVerdictResponse {
  applicable: boolean;
  title: string;
  description: string;
  metadata?: Record<string, unknown>;
  impact?: {
    revenueEstimate?: { min: number; max: number; currency: string };
    conversionLiftPercent?: number;
    aovImpactPercent?: number;
    confidence: "low" | "medium" | "high";
    reasoning: string;
  };
  actionSteps?: string[];
  relatedGoalKeys?: string[];
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
  outcomeMeasureDays?: number;
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

// ---------------------------------------------------------------------------
// Impact Score Computation
// ---------------------------------------------------------------------------

export function computeImpactScore(impact: AIVerdictResponse["impact"]): number {
  if (!impact) return 0;
  const multiplier = { low: 0.3, medium: 0.6, high: 1.0 }[impact.confidence];
  const revScore = impact.revenueEstimate
    ? Math.min(((impact.revenueEstimate.min + impact.revenueEstimate.max) / 2) / 100, 50)
    : 0;
  const convScore = (impact.conversionLiftPercent ?? 0) * 2;
  const aovScore = (impact.aovImpactPercent ?? 0) * 1.5;
  return Math.round((revScore + convScore + aovScore) * multiplier);
}

// ---------------------------------------------------------------------------
// System Prompt
// ---------------------------------------------------------------------------

const ANALYSIS_SYSTEM_PROMPT = `You are an AI assistant analyzing a Shopify merchant's data to determine if a goal action is applicable.

You have access to tools from connected data sources. Use them to gather information.

ANALYSIS WORKFLOW — follow this order:
1. First, query recent orders (last 30 days) to establish baseline metrics: total revenue, average order value (AOV), order count.
2. Then query goal-specific data relevant to the analysis prompt.
3. Calculate trends and projections from the actual numbers you gathered.
4. Estimate impact grounded in real data. For example: "average order is $85, this optimization could add 1 item per order → $12-15 AOV increase → ~$X revenue/month"
5. Rate your confidence based on data quality:
   - "high": 30+ days of order data available
   - "medium": 7-30 days of data
   - "low": <7 days of data or sparse data
6. Identify specific action steps the agent should take.
7. Flag relatedGoalKeys if the finding is relevant to other goals in the list.

IMPORTANT — be CONSERVATIVE with impact estimates. Under-promise, over-deliver. When uncertain, use the lower bound. Flag uncertainty explicitly in your reasoning.

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
  "title": "<clear, actionable title with specific data points>",
  "description": "<why this matters, grounded in real numbers from the shop>",
  "metadata": { <optional additional context or data points> },
  "impact": {
    "revenueEstimate": { "min": <number>, "max": <number>, "currency": "USD" },
    "conversionLiftPercent": <number or null>,
    "aovImpactPercent": <number or null>,
    "confidence": "<low | medium | high>",
    "reasoning": "<1-2 sentences explaining why this impact is achievable based on the data>"
  },
  "actionSteps": ["<specific step 1>", "<specific step 2>", ...],
  "relatedGoalKeys": ["<ruleKey of related goal if any>"]
}

Rules:
- "applicable" must be a boolean. Set to true only if the data supports the action.
- Keep "title" under 80 characters. Include specific numbers when possible.
- Keep "description" under 300 characters. Reference actual shop data.
- "impact" is required when applicable is true. Estimate conservatively.
- "actionSteps" should be specific, actionable steps (not generic advice).
- "relatedGoalKeys" lists ruleKeys of other goals this finding relates to. Omit if none.
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
      outcomeMeasureDays: input.outcomeMeasureDays ?? 7,
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
  if (data.outcomeMeasureDays !== undefined) updateData.outcomeMeasureDays = data.outcomeMeasureDays;
  if (data.enabled !== undefined) updateData.enabled = data.enabled;
  if (data.requiredServers !== undefined) updateData.requiredServers = JSON.stringify(data.requiredServers);

  return prisma.goal.update({ where: { id }, data: updateData });
}

export async function deleteGoal(id: string) {
  await prisma.goalExecutionGoal.deleteMany({
    where: { goal: { id } },
  });
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
    goalId?: string;
  } = { shop };

  if (filters?.status) where.status = filters.status;
  if (filters?.category) where.category = filters.category;
  if (filters?.priority) where.priority = filters.priority;
  if (filters?.goalId) where.goalId = filters.goalId;

  const now = new Date();
  const results = await prisma.goalExecution.findMany({
    where: {
      ...where,
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
    include: {
      goalExecutionLinks: {
        include: {
          goal: {
            select: { id: true, title: true, ruleKey: true, category: true },
          },
        },
      },
    },
    orderBy: [{ createdAt: "desc" }],
  });

  const sortBy = filters?.sortBy ?? "priority";

  results.sort((a, b) => {
    if (sortBy === "impactScore") {
      const scoreA = a.impactScore ?? 0;
      const scoreB = b.impactScore ?? 0;
      if (scoreA !== scoreB) return scoreB - scoreA;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    }
    if (sortBy === "newest") {
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    }
    // Default: priority
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

  // Build goal context for multi-goal linking
  const allGoalContext = goals.map((g) => ({
    ruleKey: g.ruleKey,
    title: g.title,
    description: g.description,
    category: g.category,
  }));

  const results = await batchProcess<(typeof applicableGoals)[number], GoalAnalysisResult>(
    applicableGoals,
    BATCH_CONCURRENCY,
    (goal) => analyzeGoal(goal, shop, tools, hasTools, allGoalContext),
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
  allGoalContext: Array<{ ruleKey: string; title: string; description: string; category: string }>,
): Promise<GoalAnalysisResult> {
  try {
    // Build context about other goals for multi-goal linking
    const otherGoals = allGoalContext
      .filter((g) => g.ruleKey !== goal.ruleKey)
      .map((g) => `- ${g.ruleKey}: "${g.title}" (${g.category})`)
      .join("\n");

    const goalContextPrompt = otherGoals
      ? `\n\nOther active goals (flag relatedGoalKeys if your finding is relevant to any):\n${otherGoals}`
      : "";

    const verdict = await withRetry(async () => {
      console.info(`[Goals] Analyzing goal: ${goal.ruleKey}`);

      const response = await generateText({
        model: openai("gpt-4o-mini"),
        system: ANALYSIS_SYSTEM_PROMPT,
        prompt: goal.analysisPrompt + goalContextPrompt,
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

      // response.text may be empty if all steps were tool calls and
      // stopWhen terminated before a final text response. Fall back to
      // scanning step texts for the JSON verdict.
      let rawText = response.text;
      if (!rawText || rawText.trim().length === 0) {
        for (let i = response.steps.length - 1; i >= 0; i--) {
          const stepText = response.steps[i]?.text;
          if (stepText && stepText.trim().length > 0) {
            rawText = stepText;
            break;
          }
        }
      }

      const parsed = extractJSON(rawText);
      if (!isVerdictResponse(parsed)) {
        throw new Error(
          `Invalid verdict JSON — raw: ${(rawText || "").slice(0, 200)}`,
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

    const now = new Date();
    const existing = await prisma.goalExecution.findFirst({
      where: { shop, goalId: goal.id },
    });

    // Only skip if the execution is still active (not expired) AND already acted upon
    if (
      existing &&
      ["executed", "dismissed", "completed"].includes(existing.status) &&
      existing.expiresAt &&
      existing.expiresAt > now
    ) {
      console.info(
        `[Goals] Skipping goal "${goal.ruleKey}" — active execution already ${existing.status}`,
      );
      return { goalId: goal.id, ruleKey: goal.ruleKey, status: "not_applicable" as const };
    }

    // Compute impact score
    const impactScore = computeImpactScore(verdict.impact);

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
      impactScore,
      confidenceLevel: verdict.impact?.confidence ?? null,
      estimatedRevenue: verdict.impact?.revenueEstimate
        ? JSON.stringify(verdict.impact.revenueEstimate)
        : null,
      estimatedConversionLift: verdict.impact?.conversionLiftPercent != null
        ? JSON.stringify({ percentage: verdict.impact.conversionLiftPercent })
        : null,
      estimatedAovImpact: verdict.impact?.aovImpactPercent != null
        ? JSON.stringify({ percentage: verdict.impact.aovImpactPercent })
        : null,
      impactReasoning: verdict.impact?.reasoning ?? null,
      actionSteps: verdict.actionSteps
        ? JSON.stringify(verdict.actionSteps)
        : null,
    };

    const execution = existing
      ? await prisma.goalExecution.update({
          where: { id: existing.id },
          data: { ...data, updatedAt: new Date() },
        })
      : await prisma.goalExecution.create({
          data: { shop, goalId: goal.id, ...data },
        });

    // Create multi-goal links
    // Always link to the primary goal
    await prisma.goalExecutionGoal.upsert({
      where: {
        goalExecutionId_goalId: {
          goalExecutionId: execution.id,
          goalId: goal.id,
        },
      },
      create: { goalExecutionId: execution.id, goalId: goal.id },
      update: {},
    });

    // Link to related goals
    if (verdict.relatedGoalKeys && verdict.relatedGoalKeys.length > 0) {
      const relatedGoals = await prisma.goal.findMany({
        where: {
          shop,
          ruleKey: { in: verdict.relatedGoalKeys },
        },
        select: { id: true },
      });

      for (const related of relatedGoals) {
        await prisma.goalExecutionGoal.upsert({
          where: {
            goalExecutionId_goalId: {
              goalExecutionId: execution.id,
              goalId: related.id,
            },
          },
          create: { goalExecutionId: execution.id, goalId: related.id },
          update: {},
        });
      }
    }

    console.info(
      `[Goals] Created/updated execution ${execution.id} for goal "${goal.ruleKey}" (impact: ${impactScore})`,
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
    include: { goal: true },
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
    // Capture baseline data before execution
    let baselineData: string | null = null;
    if (hasTools) {
      try {
        const baselineResponse = await generateText({
          model: openai("gpt-4o-mini"),
          system: `You are a data collector. Query the shop's recent 7-day metrics and return ONLY a JSON object with these fields:
{
  "revenue7d": <total revenue last 7 days as number>,
  "orderCount7d": <number of orders last 7 days>,
  "aov7d": <average order value last 7 days as number>,
  "collectedAt": "<ISO timestamp>"
}
Use shopify_query to get orders from the last 7 days. If you cannot gather data, return null values.`,
          prompt: "Collect baseline metrics for the last 7 days.",
          tools: tools as Parameters<typeof generateText>[0]["tools"],
          stopWhen: stepCountIs(3),
          timeout: { totalMs: 30_000, stepMs: 10_000 },
        });
        const parsedBaseline = extractJSON(baselineResponse.text);
        if (parsedBaseline) {
          baselineData = JSON.stringify(parsedBaseline);
        }
      } catch (err) {
        console.warn(`[Goals] Failed to capture baseline data for ${id}:`, err);
      }
    }

    await prisma.goalExecution.update({
      where: { id },
      data: {
        status: "executing",
        baselineData,
      },
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
        outcomeStatus: "pending_measurement",
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

// ---------------------------------------------------------------------------
// Outcome Measurement
// ---------------------------------------------------------------------------

export async function measureOutcome(executionId: string) {
  console.info(`[Goals] Measuring outcome for execution: ${executionId}`);

  const execution = await prisma.goalExecution.findUnique({
    where: { id: executionId },
  });

  if (!execution) {
    throw new Error(`GoalExecution ${executionId} not found`);
  }

  if (execution.outcomeStatus === "measured") {
    console.info(`[Goals] Outcome already measured for ${executionId}`);
    return execution;
  }

  await mcpManager.ensureInitialized(execution.shop);
  const tools = await mcpManager.getToolsForAI();
  const hasTools = Object.keys(tools).length > 0;

  if (!hasTools) {
    return prisma.goalExecution.update({
      where: { id: executionId },
      data: {
        outcomeStatus: "inconclusive",
        outcomeData: JSON.stringify({ error: "No tools available to measure" }),
        outcomeMeasuredAt: new Date(),
      },
    });
  }

  try {
    const baselineData = execution.baselineData
      ? JSON.parse(execution.baselineData)
      : null;

    const response = await generateText({
      model: openai("gpt-4o-mini"),
      system: `You are a data analyst measuring the outcome of a previously executed action for a Shopify merchant.

Compare current metrics to the baseline and return ONLY a JSON object:
{
  "currentRevenue7d": <number>,
  "currentOrderCount7d": <number>,
  "currentAov7d": <number>,
  "revenueDelta": <number — difference from baseline>,
  "revenueDeltaPercent": <number — percentage change>,
  "orderCountDelta": <number>,
  "aovDelta": <number>,
  "aovDeltaPercent": <number>,
  "measuredAt": "<ISO timestamp>",
  "summary": "<1-2 sentence summary of the outcome>"
}

Use shopify_query to get orders from the last 7 days. Be accurate with the numbers.`,
      prompt: `Measure the outcome of this action:
- Action: ${execution.title}
- Description: ${execution.description}
- Executed at: ${execution.executedAt?.toISOString() ?? "unknown"}
${baselineData ? `- Baseline data: ${JSON.stringify(baselineData)}` : "- No baseline data available"}

Query current metrics and compare to the baseline.`,
      tools: tools as Parameters<typeof generateText>[0]["tools"],
      stopWhen: stepCountIs(3),
      timeout: { totalMs: 30_000, stepMs: 10_000 },
    });

    const outcomeData = extractJSON(response.text);

    return prisma.goalExecution.update({
      where: { id: executionId },
      data: {
        outcomeStatus: "measured",
        outcomeData: outcomeData ? JSON.stringify(outcomeData) : null,
        outcomeMeasuredAt: new Date(),
      },
    });
  } catch (error) {
    console.error(`[Goals] Error measuring outcome for ${executionId}:`, error);

    return prisma.goalExecution.update({
      where: { id: executionId },
      data: {
        outcomeStatus: "inconclusive",
        outcomeData: JSON.stringify({
          error: error instanceof Error ? error.message : String(error),
        }),
        outcomeMeasuredAt: new Date(),
      },
    });
  }
}
