import axios from "axios";

import { sleep } from "../time";
import type { Throttle, RequestOptions, Sem } from "../../types";

export function newThrottle(minDelay: number): Throttle {
  return { minDelay, locks: {}, last: {} };
}

export async function throttleWait(t: Throttle, key: string): Promise<void> {

  const previous = t.locks[key] ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });

  t.locks[key] = previous.then(() => current);

  await previous;
  try {
    const now = performance.now();
    const delta = (now - (t.last[key] ?? 0)) / 1000;
    if (delta < t.minDelay) {
      await sleep(t.minDelay - delta);
    }
    t.last[key] = performance.now();
  } finally {

    release();
  }
}

export async function request(opts: RequestOptions): Promise<unknown> {
  const {
    method,
    url,
    throttle,
    throttleKey,
    log,
    maxRetries,
    backoffBase,
    timeout,
    auth,
    on401,
    expect = "json",
    headers,
    json,
  } = opts;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {

    await throttleWait(throttle, throttleKey);

    const hdrs: Record<string, string> = { ...(headers || {}) };
    const authVal = typeof auth === "function" ? auth() : auth;
    if (authVal) {
      hdrs["Authorization"] = authVal;
    }

    try {

      const r = await axios.request({
        method,
        url,
        headers: hdrs,
        data: json,
        timeout: timeout * 1000,
        responseType: expect === "json" ? "json" : "text",

        validateStatus: () => true,
      });

      if (r.status === 401) {
        log.warn("401 en %s -> re-autenticando", url);
        if (on401) {
          await on401();
        }

        throw new Error(`HTTP 401 en ${url}`);
      }
      if (r.status === 429 || r.status >= 500) {

        throw new Error(`HTTP ${r.status} en ${url}`);
      }
      if (r.status >= 400) {

        throw new Error(`HTTP ${r.status} en ${url}`);
      }

      return r.data;
    } catch (e) {
      if (attempt === maxRetries) {
        log.error("Falló %s tras %d intentos: %s", url, attempt, e);
        throw e;
      }
      const backoff = backoffBase ** attempt;
      log.warn(
        "Error %s (intento %d/%d), reintento en %ss: %s",
        url,
        attempt,
        maxRetries,
        backoff.toFixed(1),
        e
      );
      await sleep(backoff);
    }
  }

  throw new Error(`request: agotados los reintentos para ${url}`);
}

export function semaphore(n: number): Sem {
  let available = n;
  const waiters: Array<() => void> = [];

  function acquire(): Promise<void> {
    if (available > 0) {
      available -= 1;
      return Promise.resolve();
    }

    return new Promise<void>((resolve) => {
      waiters.push(resolve);
    });
  }

  function release(): void {
    const next = waiters.shift();
    if (next) {

      next();
    } else {
      available += 1;
    }
  }

  async function run<T>(fn: () => Promise<T>): Promise<T> {
    await acquire();
    try {
      return await fn();
    } finally {
      release();
    }
  }

  return { run };
}
