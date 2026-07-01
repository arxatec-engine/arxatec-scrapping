export interface Logger {
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
}

export interface Throttle {
  minDelay: number;
  locks: Record<string, Promise<void>>;
  last: Record<string, number>;
}

export interface Sem {
  run<T>(fn: () => Promise<T>): Promise<T>;
}

export type Expect = "json" | "text";

export interface RequestOptions {
  method: string;
  url: string;
  throttle: Throttle;
  throttleKey: string;
  log: Logger;
  maxRetries: number;
  backoffBase: number;
  timeout: number;
  auth?: (() => string | null) | string | null;
  on401?: () => Promise<void>;
  expect?: Expect;
  headers?: Record<string, string>;
  json?: unknown;
}
