/**
 * Shopify GraphQL Query Builder
 *
 * Extracted from the MCP server for testability. Handles:
 *   - Building valid GraphQL from high-level resource/fields/filter params
 *   - Relay connection pattern wrapping (edges/node)
 *   - Field validation against the introspection schema
 *   - Partial-success: valid fields produce a query even when some are invalid
 *   - Sort key validation against the schema's enum type
 *   - Full field list in error messages so the caller can self-correct
 *   - Raw GraphQL validation for shopify_graphql
 */

// ---------------------------------------------------------------------------
// Schema types — shared with index.ts
// ---------------------------------------------------------------------------

export interface CompactField {
  name: string;
  type: string;
  description: string;
}

export interface CompactType {
  name: string;
  kind: string;
  description: string;
  fields?: CompactField[];
  enumValues?: string[];
  inputFields?: CompactField[];
}

export interface CompactOperation {
  name: string;
  description: string;
  args: CompactField[];
  returnType: string;
}

export interface CompactSchema {
  apiVersion: string;
  queries: CompactOperation[];
  mutations: CompactOperation[];
  types: CompactType[];
}

// ---------------------------------------------------------------------------
// Query builder result types
// ---------------------------------------------------------------------------

export interface BuildQueryResult {
  query: string;
  /** Hard errors that prevented building the query entirely (e.g. unknown resource) */
  errors: string[];
  /** Warnings about dropped/invalid fields — query still executes with valid fields */
  warnings: string[];
}

export interface ValidationError {
  path: string;
  message: string;
  suggestions: string[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function unwrapTypeName(typeStr: string): string {
  return typeStr.replace(/[!\[\]]/g, "").trim();
}

/**
 * Generates candidate search stems for a resource/search term.
 * Handles basic pluralization so "discounts" also matches "discount",
 * and the original term is always included.
 */
export function getSearchStems(term: string): string[] {
  const lower = term.toLowerCase();
  const stems = [lower];
  if (lower.endsWith("s") && lower.length > 2) {
    stems.push(lower.slice(0, -1));
  } else if (!lower.endsWith("s")) {
    stems.push(lower + "s");
  }
  return stems;
}

/**
 * Finds queries whose names contain any of the provided stems.
 */
function findMatchingQueries(
  queries: CompactOperation[],
  stems: string[],
  limit = 10,
): CompactOperation[] {
  const seen = new Set<string>();
  const results: CompactOperation[] = [];
  for (const stem of stems) {
    for (const q of queries) {
      if (!seen.has(q.name) && q.name.toLowerCase().includes(stem)) {
        seen.add(q.name);
        results.push(q);
      }
    }
  }
  return results.slice(0, limit);
}

function buildTypeMap(schema: CompactSchema): Map<string, CompactType> {
  return new Map(schema.types.map((t) => [t.name, t]));
}

/**
 * Returns a categorized list of all fields on a type, formatted for LLM consumption.
 */
function formatAvailableFields(
  typeName: string,
  typeMap: Map<string, CompactType>,
): string {
  const typeDef = typeMap.get(typeName);
  if (!typeDef?.fields) return "";

  const scalars: string[] = [];
  const objects: string[] = [];
  const connections: string[] = [];

  for (const f of typeDef.fields) {
    const baseType = unwrapTypeName(f.type);
    const resolved = typeMap.get(baseType);

    if (baseType.endsWith("Connection")) {
      const edgeType = resolved?.fields?.find((ef) => ef.name === "edges");
      if (edgeType) {
        const edgeTypeName = unwrapTypeName(edgeType.type);
        const edgeTypeDef = typeMap.get(edgeTypeName);
        const nodeField = edgeTypeDef?.fields?.find((nf) => nf.name === "node");
        const nodeTypeName = nodeField ? unwrapTypeName(nodeField.type) : baseType;
        connections.push(`${f.name} → ${nodeTypeName} (connection, use as field name)`);
      } else {
        connections.push(`${f.name} → ${baseType} (connection)`);
      }
    } else if (resolved?.fields) {
      const subScalars = resolved.fields
        .filter((sf) => !typeMap.get(unwrapTypeName(sf.type))?.fields)
        .slice(0, 6)
        .map((sf) => sf.name);
      objects.push(`${f.name} → ${baseType} (has: ${subScalars.join(", ")}${resolved.fields.length > 6 ? ", ..." : ""})`);
    } else {
      scalars.push(f.name);
    }
  }

  const parts: string[] = [];
  if (scalars.length > 0) {
    parts.push(`Scalar fields: ${scalars.join(", ")}`);
  }
  if (objects.length > 0) {
    parts.push(`Object fields (use dot notation, e.g. "field.subfield"):\n  ${objects.join("\n  ")}`);
  }
  if (connections.length > 0) {
    parts.push(`Connection fields (auto-wrapped in edges/node):\n  ${connections.join("\n  ")}`);
  }

  return parts.join("\n\n");
}

/**
 * Resolves the sort key enum type for a query operation and validates
 * the provided value. Returns the validated value or null if invalid.
 */
function validateSortKey(
  queryOp: CompactOperation,
  sortKey: string,
  typeMap: Map<string, CompactType>,
): { valid: boolean; warning?: string } {
  const sortArg = queryOp.args.find((a) => a.name === "sortKey");
  if (!sortArg) {
    return { valid: false, warning: `Query "${queryOp.name}" does not accept a sortKey argument.` };
  }

  const enumTypeName = unwrapTypeName(sortArg.type);
  const enumType = typeMap.get(enumTypeName);

  if (!enumType?.enumValues) {
    return { valid: true };
  }

  if (enumType.enumValues.includes(sortKey)) {
    return { valid: true };
  }

  return {
    valid: false,
    warning:
      `sortKey "${sortKey}" is not valid for "${queryOp.name}". ` +
      `Valid values: ${enumType.enumValues.join(", ")}. ` +
      `Proceeding without sortKey.`,
  };
}

// ---------------------------------------------------------------------------
// Auto-selection builder — recursively expands object types to find scalars
// ---------------------------------------------------------------------------

/**
 * Builds a GraphQL selection set for a type by recursively expanding object
 * sub-fields until scalars are found. Handles types like MoneyBag whose
 * immediate children (shopMoney, presentmentMoney) are themselves objects.
 */
function buildAutoSelection(
  typeName: string,
  typeMap: Map<string, CompactType>,
  maxDepth: number,
): string | null {
  if (maxDepth <= 0) return null;
  const typeDef = typeMap.get(typeName);
  if (!typeDef?.fields) return null;

  const parts: string[] = [];
  for (const f of typeDef.fields.slice(0, 5)) {
    const bt = unwrapTypeName(f.type);
    const resolved = typeMap.get(bt);
    if (!resolved?.fields) {
      parts.push(f.name);
    } else if (!bt.endsWith("Connection")) {
      const inner = buildAutoSelection(bt, typeMap, maxDepth - 1);
      if (inner) {
        parts.push(`${f.name} ${inner}`);
      }
    }
  }

  return parts.length > 0 ? `{ ${parts.join(" ")} }` : null;
}

// ---------------------------------------------------------------------------
// buildQuery — the main function
// ---------------------------------------------------------------------------

export function buildQuery(
  schema: CompactSchema,
  resource: string,
  fields: string[],
  opts: { filter?: string; limit?: number; sortKey?: string; reverse?: boolean },
): BuildQueryResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Exact match only — no stemming / fuzzy matching. The resource name must
  // match a root query name exactly. This prevents "products" from accidentally
  // matching the singular "product" query (which requires an id argument).
  const queryOp = schema.queries.find(
    (q) => q.name.toLowerCase() === resource.toLowerCase(),
  );
  if (!queryOp) {
    const stems = getSearchStems(resource);
    const suggestions = findMatchingQueries(schema.queries, stems)
      .map((q) => q.name);
    errors.push(
      `Query "${resource}" not found. You must use the exact query name.` +
        (suggestions.length > 0 ? ` Did you mean: ${suggestions.join(", ")}?` : ""),
    );
    return { query: "", errors, warnings };
  }

  const typeMap = buildTypeMap(schema);
  const returnType = unwrapTypeName(queryOp.returnType);
  const returnTypeDef = typeMap.get(returnType);

  const isConnection = returnType.endsWith("Connection");
  let nodeTypeName: string | null = null;

  if (isConnection && returnTypeDef?.fields) {
    const edgesField = returnTypeDef.fields.find((f) => f.name === "edges");
    if (edgesField) {
      const edgeTypeName = unwrapTypeName(edgesField.type);
      const edgeType = typeMap.get(edgeTypeName);
      if (edgeType?.fields) {
        const nodeField = edgeType.fields.find((f) => f.name === "node");
        if (nodeField) {
          nodeTypeName = unwrapTypeName(nodeField.type);
        }
      }
    }
  }

  const targetTypeName = nodeTypeName ?? returnType;
  const targetType = typeMap.get(targetTypeName);
  if (!targetType?.fields) {
    errors.push(`Cannot resolve fields for type "${targetTypeName}".`);
    return { query: "", errors, warnings };
  }

  // Group fields by top-level name so dot-notation paths that share a
  // prefix (e.g. variants.title + variants.price) produce ONE selection.
  const fieldGroups = new Map<string, string[][]>();
  for (const reqField of fields) {
    const parts = reqField.split(".");
    const topLevel = parts[0]!;
    if (!fieldGroups.has(topLevel)) {
      fieldGroups.set(topLevel, []);
    }
    fieldGroups.get(topLevel)!.push(parts.slice(1));
  }

  const validFields: string[] = [];
  const nestedSelections: string[] = [];

  for (const [topLevel, subPaths] of fieldGroups) {
    const match = targetType.fields.find((f) => f.name === topLevel);

    if (!match) {
      const available = formatAvailableFields(targetTypeName, typeMap);
      warnings.push(
        `Field "${topLevel}" does not exist on type "${targetTypeName}".\n\n` +
          `Available fields on ${targetTypeName}:\n${available}`,
      );
      continue;
    }

    const fieldBaseType = unwrapTypeName(match.type);
    const fieldTypeDef = typeMap.get(fieldBaseType);
    const hasDotPaths = subPaths.some((p) => p.length > 0);

    if (hasDotPaths && fieldTypeDef?.fields) {
      const subSelection = buildMergedSelection(
        fieldBaseType,
        subPaths.filter((p) => p.length > 0),
        typeMap,
        warnings,
      );
      if (subSelection) {
        nestedSelections.push(`${topLevel} ${subSelection}`);
      }
    } else if (fieldTypeDef?.fields && fieldBaseType.endsWith("Connection")) {
      const connEdges = fieldTypeDef.fields.find((f) => f.name === "edges");
      if (connEdges) {
        const connEdgeType = typeMap.get(unwrapTypeName(connEdges.type));
        const connNode = connEdgeType?.fields?.find((f) => f.name === "node");
        if (connNode) {
          const connNodeType = typeMap.get(unwrapTypeName(connNode.type));
          if (connNodeType?.fields) {
            const idField = connNodeType.fields.find((f) => f.name === "id") ? "id" : "";
            nestedSelections.push(`${topLevel}(first: 10) { edges { node { ${idField} } } }`);
          }
        }
      }
    } else if (fieldTypeDef?.fields) {
      const selection = buildAutoSelection(fieldBaseType, typeMap, 3);
      if (selection) {
        nestedSelections.push(`${topLevel} ${selection}`);
      } else {
        warnings.push(
          `Field "${topLevel}" is an object type (${fieldBaseType}) with no resolvable scalar fields.`,
        );
      }
    } else {
      validFields.push(topLevel);
    }
  }

  if (validFields.length === 0 && nestedSelections.length === 0) {
    if (warnings.length > 0) {
      validFields.push("id");
      warnings.push(
        `No valid fields resolved — falling back to "id". ` +
          `Resubmit with corrected field names from the list above.`,
      );
    } else {
      validFields.push("id");
    }
  }

  const allFieldSelections = [...validFields, ...nestedSelections].join("\n          ");

  // -- Build arguments --
  const args: string[] = [];
  const limit = opts.limit ?? 10;
  if (queryOp.args.some((a) => a.name === "first")) {
    args.push(`first: ${limit}`);
  }
  if (opts.filter && queryOp.args.some((a) => a.name === "query")) {
    args.push(`query: "${opts.filter.replace(/"/g, '\\"')}"`);
  }

  if (opts.sortKey) {
    const sortResult = validateSortKey(queryOp, opts.sortKey, typeMap);
    if (sortResult.valid) {
      args.push(`sortKey: ${opts.sortKey}`);
    } else if (sortResult.warning) {
      warnings.push(sortResult.warning);
    }
  }

  if (opts.reverse && queryOp.args.some((a) => a.name === "reverse")) {
    args.push("reverse: true");
  }

  const argStr = args.length > 0 ? `(${args.join(", ")})` : "";

  let query: string;
  if (isConnection) {
    query = `{
  ${queryOp.name}${argStr} {
    edges {
      node {
        ${allFieldSelections}
      }
    }
    pageInfo { hasNextPage endCursor }
  }
}`;
  } else {
    query = `{
  ${queryOp.name}${argStr} {
    ${allFieldSelections}
  }
}`;
  }

  return { query, errors, warnings };
}

// ---------------------------------------------------------------------------
// Merged selection builder — groups sub-paths and auto-expands object leaves
// ---------------------------------------------------------------------------

/**
 * Builds a single GraphQL selection set from multiple dot-notation sub-paths.
 * Merges paths that share a prefix (e.g. variants.title + variants.price →
 * one selection with both fields) and auto-expands object-typed leaves so
 * they never produce empty braces.
 */
function buildMergedSelection(
  typeName: string,
  subPaths: string[][],
  typeMap: Map<string, CompactType>,
  warnings: string[],
): string | null {
  const typeDef = typeMap.get(typeName);
  if (!typeDef?.fields) return null;

  if (typeName.endsWith("Connection")) {
    const edgesField = typeDef.fields.find((f) => f.name === "edges");
    if (edgesField) {
      const edgeType = typeMap.get(unwrapTypeName(edgesField.type));
      const nodeField = edgeType?.fields?.find((f) => f.name === "node");
      if (nodeField) {
        const nodeType = unwrapTypeName(nodeField.type);
        const inner = buildMergedSelection(nodeType, subPaths, typeMap, warnings);
        return inner ? `(first: 10) { edges { node ${inner} } }` : null;
      }
    }
    return null;
  }

  const groups = new Map<string, string[][]>();
  for (const path of subPaths) {
    if (path.length === 0) continue;
    const fieldName = path[0]!;
    if (!groups.has(fieldName)) {
      groups.set(fieldName, []);
    }
    groups.get(fieldName)!.push(path.slice(1));
  }

  const parts: string[] = [];
  for (const [fieldName, childPaths] of groups) {
    const match = typeDef.fields.find((f) => f.name === fieldName);
    if (!match) {
      const available = formatAvailableFields(typeName, typeMap);
      warnings.push(
        `Field "${fieldName}" does not exist on type "${typeName}".\n\n` +
          `Available fields on ${typeName}:\n${available}`,
      );
      continue;
    }

    const fieldBaseType = unwrapTypeName(match.type);
    const fieldTypeDef = typeMap.get(fieldBaseType);
    const hasDeeper = childPaths.some((p) => p.length > 0);

    if (hasDeeper && fieldTypeDef?.fields) {
      const inner = buildMergedSelection(fieldBaseType, childPaths.filter((p) => p.length > 0), typeMap, warnings);
      if (inner) {
        parts.push(`${fieldName} ${inner}`);
      }
    } else if (fieldTypeDef?.fields && fieldBaseType.endsWith("Connection")) {
      const connEdges = fieldTypeDef.fields.find((f) => f.name === "edges");
      if (connEdges) {
        const connEdgeType = typeMap.get(unwrapTypeName(connEdges.type));
        const connNode = connEdgeType?.fields?.find((f) => f.name === "node");
        if (connNode) {
          const connNodeType = typeMap.get(unwrapTypeName(connNode.type));
          if (connNodeType?.fields) {
            const idField = connNodeType.fields.find((f) => f.name === "id") ? "id" : "";
            parts.push(`${fieldName}(first: 10) { edges { node { ${idField} } } }`);
          }
        }
      }
    } else if (fieldTypeDef?.fields) {
      const inner = buildAutoSelection(fieldBaseType, typeMap, 3);
      if (inner) {
        parts.push(`${fieldName} ${inner}`);
      }
    } else {
      parts.push(fieldName);
    }
  }

  return parts.length > 0 ? `{ ${parts.join(" ")} }` : null;
}

// ---------------------------------------------------------------------------
// Raw GraphQL validation (for shopify_graphql tool)
// ---------------------------------------------------------------------------

export function validateFieldsAgainstSchema(
  queryStr: string,
  schema: CompactSchema,
): ValidationError[] {
  const validationErrors: ValidationError[] = [];

  const rootOps = new Map<string, string>();
  for (const q of schema.queries) {
    rootOps.set(q.name, q.returnType);
  }
  for (const m of schema.mutations) {
    rootOps.set(m.name, m.returnType);
  }

  const typeMap = buildTypeMap(schema);

  function resolveFieldType(parentTypeName: string, fieldName: string): string | null {
    if (fieldName === "__typename") return "String";
    const parentType = typeMap.get(parentTypeName);
    if (!parentType?.fields) return null;
    const field = parentType.fields.find((f) => f.name === fieldName);
    return field ? field.type : null;
  }

  function getSuggestions(parentTypeName: string, _badField: string): string[] {
    const parentType = typeMap.get(parentTypeName);
    if (!parentType?.fields) return [];
    return parentType.fields
      .map((f) => `${f.name} (${f.type})`)
      .slice(0, 30);
  }

  interface SelectionNode {
    name: string;
    children?: SelectionNode[];
  }

  function extractBraceBlock(str: string, openIndex: number): string | null {
    if (str[openIndex] !== "{") return null;
    let depth = 0;
    for (let i = openIndex; i < str.length; i++) {
      if (str[i] === "{") depth++;
      if (str[i] === "}") {
        depth--;
        if (depth === 0) return str.slice(openIndex + 1, i);
      }
    }
    return null;
  }

  function parseSelections(body: string): SelectionNode[] {
    const nodes: SelectionNode[] = [];
    let i = 0;

    while (i < body.length) {
      while (i < body.length && /\s/.test(body[i]!)) i++;
      if (i >= body.length) break;

      if (body[i] === "." || body[i] === "}") { i++; continue; }

      const nameMatch = body.slice(i).match(/^(\w+)/);
      if (!nameMatch) { i++; continue; }

      const fieldName = nameMatch[1]!;
      i += fieldName.length;

      while (i < body.length && /\s/.test(body[i]!)) i++;
      if (i < body.length && body[i] === "(") {
        let depth = 0;
        while (i < body.length) {
          if (body[i] === "(") depth++;
          if (body[i] === ")") { depth--; if (depth === 0) { i++; break; } }
          i++;
        }
      }

      while (i < body.length && /\s/.test(body[i]!)) i++;
      if (i < body.length && body[i] === "{") {
        const inner = extractBraceBlock(body, i);
        if (inner !== null) {
          i += inner.length + 2;
          nodes.push({ name: fieldName, children: parseSelections(inner) });
        } else {
          nodes.push({ name: fieldName });
        }
      } else {
        nodes.push({ name: fieldName });
      }
    }

    return nodes;
  }

  const SKIP_NAMES = new Set([
    "query", "mutation", "fragment", "on", "true", "false", "null",
  ]);

  function walkNodes(nodes: SelectionNode[], parentTypeName: string, path: string) {
    for (const node of nodes) {
      if (SKIP_NAMES.has(node.name)) {
        if (node.children) {
          walkNodes(node.children, parentTypeName, path);
        }
        continue;
      }

      if (parentTypeName === "__ROOT__") {
        const returnType = rootOps.get(node.name);
        if (returnType && node.children) {
          walkNodes(node.children, unwrapTypeName(returnType), `${path}.${node.name}`);
        }
        continue;
      }

      const fieldType = resolveFieldType(parentTypeName, node.name);
      if (fieldType === null) {
        validationErrors.push({
          path: `${path}.${node.name}`,
          message: `Field '${node.name}' does not exist on type '${parentTypeName}'.`,
          suggestions: getSuggestions(parentTypeName, node.name),
        });
        continue;
      }

      if (node.children) {
        walkNodes(node.children, unwrapTypeName(fieldType), `${path}.${node.name}`);
      }
    }
  }

  try {
    const stripped = queryStr
      .replace(/#[^\n]*/g, "")
      .replace(/\.\.\.\s*\w+/g, "")
      .replace(/\$\w+\s*:\s*[^,)]+/g, "");

    const outerBrace = stripped.indexOf("{");
    if (outerBrace !== -1) {
      const outerBody = extractBraceBlock(stripped, outerBrace);
      if (outerBody) {
        const selections = parseSelections(outerBody);
        walkNodes(selections, "__ROOT__", "");
      }
    }
  } catch {
    // Parsing edge cases — fall through to let Shopify handle it
  }

  return validationErrors;
}

export function formatValidationErrors(validationErrors: ValidationError[]): string {
  const lines = ["SCHEMA VALIDATION FAILED — fix these fields before retrying:\n"];
  for (const err of validationErrors) {
    lines.push(`• ${err.message}`);
    if (err.suggestions.length > 0) {
      lines.push(`  All fields on this type: ${err.suggestions.join(", ")}`);
    }
  }
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Schema transform — converts raw introspection to CompactSchema
// ---------------------------------------------------------------------------

export function formatTypeRef(typeRef: Record<string, unknown>): string {
  if (!typeRef) return "unknown";
  const kind = typeRef.kind as string;
  if (kind === "NON_NULL") {
    return `${formatTypeRef(typeRef.ofType as Record<string, unknown>)}!`;
  }
  if (kind === "LIST") {
    return `[${formatTypeRef(typeRef.ofType as Record<string, unknown>)}]`;
  }
  return (typeRef.name as string) ?? "unknown";
}

export function transformSchema(
  introspection: Record<string, unknown>,
  apiVersion: string,
): CompactSchema {
  const schemaData = (
    introspection as {
      data?: { __schema?: Record<string, unknown> };
    }
  )?.data?.__schema;

  if (!schemaData) {
    throw new Error("Invalid introspection response — missing __schema");
  }

  const allTypes = (schemaData.types ?? []) as Array<Record<string, unknown>>;
  const queryTypeName = (
    schemaData.queryType as Record<string, unknown> | null
  )?.name as string | undefined;
  const mutationTypeName = (
    schemaData.mutationType as Record<string, unknown> | null
  )?.name as string | undefined;

  function extractOperations(
    rootTypeName: string | undefined,
  ): CompactOperation[] {
    if (!rootTypeName) return [];
    const rootType = allTypes.find((t) => t.name === rootTypeName);
    if (!rootType) return [];
    const fields = (rootType.fields ?? []) as Array<Record<string, unknown>>;
    return fields.map((f) => ({
      name: f.name as string,
      description: (f.description as string) ?? "",
      args: ((f.args ?? []) as Array<Record<string, unknown>>).map((a) => ({
        name: a.name as string,
        type: formatTypeRef(a.type as Record<string, unknown>),
        description: (a.description as string) ?? "",
      })),
      returnType: formatTypeRef(f.type as Record<string, unknown>),
    }));
  }

  const builtinPrefixes = ["__"];
  const rootNames = new Set(
    [queryTypeName, mutationTypeName].filter(Boolean),
  );

  const types: CompactType[] = allTypes
    .filter(
      (t) =>
        !builtinPrefixes.some((p) => (t.name as string).startsWith(p)) &&
        !rootNames.has(t.name as string),
    )
    .map((t) => {
      const entry: CompactType = {
        name: t.name as string,
        kind: t.kind as string,
        description: (t.description as string) ?? "",
      };

      if (t.kind === "OBJECT" || t.kind === "INTERFACE") {
        const fields = (t.fields ?? []) as Array<Record<string, unknown>>;
        entry.fields = fields.map((f) => ({
          name: f.name as string,
          type: formatTypeRef(f.type as Record<string, unknown>),
          description: (f.description as string) ?? "",
        }));
      }

      if (t.kind === "INPUT_OBJECT") {
        const inputFields = (t.inputFields ?? []) as Array<
          Record<string, unknown>
        >;
        entry.inputFields = inputFields.map((f) => ({
          name: f.name as string,
          type: formatTypeRef(f.type as Record<string, unknown>),
          description: (f.description as string) ?? "",
        }));
      }

      if (t.kind === "ENUM") {
        const enumValues = (t.enumValues ?? []) as Array<
          Record<string, unknown>
        >;
        entry.enumValues = enumValues.map((v) => v.name as string);
      }

      return entry;
    });

  return {
    apiVersion,
    queries: extractOperations(queryTypeName),
    mutations: extractOperations(mutationTypeName),
    types,
  };
}
