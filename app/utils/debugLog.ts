
import { appendFileSync } from "fs";

export function debugLog(...args: unknown[]) {
    appendFileSync("/tmp/custom-api-debug.log", `${new Date().toISOString()} ${args.join(" ")}\n`);
}