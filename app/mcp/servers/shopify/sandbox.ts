/**
 * Sandboxed JavaScript Executor
 *
 * Runs LLM-authored code in a restricted environment. Whitelists safe
 * builtins, shadows dangerous globals, captures console output, and
 * enforces a timeout. Caller injects domain-specific globals (e.g.
 * `schema` for search, `client` for execute).
 */

export interface SandboxResult {
  result: unknown;
  logs: string[];
  error?: string;
}

const SAFE_BUILTINS: Record<string, unknown> = {
  JSON,
  Array,
  Object,
  Promise,
  Math,
  String,
  Number,
  Boolean,
  Date,
  Map,
  Set,
  WeakMap,
  WeakSet,
  RegExp,
  Error,
  TypeError,
  RangeError,
  SyntaxError,
  URIError,
  parseInt,
  parseFloat,
  isNaN,
  isFinite,
  encodeURIComponent,
  decodeURIComponent,
  encodeURI,
  decodeURI,
  undefined,
  NaN,
  Infinity,
};

const SHADOWED_GLOBALS = [
  "process",
  "require",
  "fetch",
  "globalThis",
  "global",
  "window",
  "self",
  "setTimeout",
  "setInterval",
  "setImmediate",
  "clearTimeout",
  "clearInterval",
  "clearImmediate",
  "queueMicrotask",
  "eval",
  "Function",
  "Proxy",
  "Reflect",
  "module",
  "exports",
  "__dirname",
  "__filename",
];

export async function runInSandbox(
  code: string,
  globals: Record<string, unknown>,
  timeoutMs = 30_000,
): Promise<SandboxResult> {
  const logs: string[] = [];

  const mockConsole = Object.freeze({
    log: (...args: unknown[]) => logs.push(args.map(String).join(" ")),
    warn: (...args: unknown[]) =>
      logs.push(`[warn] ${args.map(String).join(" ")}`),
    error: (...args: unknown[]) =>
      logs.push(`[error] ${args.map(String).join(" ")}`),
    info: (...args: unknown[]) =>
      logs.push(`[info] ${args.map(String).join(" ")}`),
    debug: (...args: unknown[]) =>
      logs.push(`[debug] ${args.map(String).join(" ")}`),
  });

  const scope: Record<string, unknown> = {
    ...SAFE_BUILTINS,
    console: mockConsole,
    ...globals,
  };

  for (const name of SHADOWED_GLOBALS) {
    if (!(name in scope)) {
      scope[name] = undefined;
    }
  }

  const paramNames = Object.keys(scope);
  const paramValues = Object.values(scope);

  const wrappedCode = `return (async () => { ${code} })();`;

  let fn: (...args: unknown[]) => Promise<unknown>;
  try {
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    fn = new Function(...paramNames, wrappedCode) as typeof fn;
  } catch (err) {
    return {
      result: undefined,
      logs,
      error: `Syntax error: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  const execution = fn(...paramValues);

  const timeout = new Promise<never>((_, reject) => {
    const id = setTimeout(
      () => reject(new Error(`Execution timed out after ${timeoutMs}ms`)),
      timeoutMs,
    );
    // Unref so the timer doesn't keep the process alive if execution finishes first
    if (typeof id === "object" && "unref" in id) id.unref();
  });

  try {
    const result = await Promise.race([execution, timeout]);
    return { result, logs };
  } catch (err) {
    return {
      result: undefined,
      logs,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
