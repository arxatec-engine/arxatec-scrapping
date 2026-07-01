import { appendFileSync } from "node:fs";
import { format } from "node:util";

import type { Logger } from "../../types";

function timestamp(): string {
  const d = new Date();
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())},` +
    `${pad(d.getMilliseconds(), 3)}`
  );
}

function emit(logFile: string, level: string, message: string, args: unknown[]): void {
  const line = `${timestamp()} ${level} ${format(message, ...args)}`;
  console.log(line);
  appendFileSync(logFile, line + "\n", { encoding: "utf-8" });
}

export function setupLogging(logFile: string): Logger {
  return {
    info: (message, ...args) => emit(logFile, "INFO", message, args),
    warn: (message, ...args) => emit(logFile, "WARNING", message, args),
    error: (message, ...args) => emit(logFile, "ERROR", message, args),
  };
}
