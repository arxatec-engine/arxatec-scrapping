import { mkdirSync } from "node:fs";
import { join } from "node:path";

import { env } from "../../../config";
import * as ENV from "../../../constants/env";
import {
  BACKOFF_BASE,
  DEFAULT_USER_AGENT,
  PROGRESS_EVERY,
  VISOR_MAX_RETRIES,
  VISOR_TIMEOUT,
} from "../constants";
import { REPO_ROOT } from "./paths";
import type { Config } from "../types";
import { sourceByKey } from "../../../services/sources";

export * from "./paths";

export function config(): Config {
  const state = join(REPO_ROOT, "state", "elperuano_ingest");
  mkdirSync(state, { recursive: true });
  return {
    concurrency: env.get(ENV.EP_CONCURRENCY).default("2").asIntPositive(),
    minDelay: env.get(ENV.EP_DELAY).default("0.5").asFloat(),
    limit: env.get(ENV.EP_LIMIT).default("0").asInt() || null,
    maxRetries: VISOR_MAX_RETRIES,
    backoffBase: BACKOFF_BASE,
    requestTimeout: VISOR_TIMEOUT,
    progressEvery: PROGRESS_EVERY,
    userAgent: env.get(ENV.EP_UA).default(DEFAULT_USER_AGENT).asString(),
    periodo: env.get(ENV.EP_PERIODO).asString() || null,
    todos: env.get(ENV.EP_TODOS).default("false").asBool(),
    csvUrl: env.get(ENV.EP_CSV_URL).asString() || null,
    docsPath: join(state, "ledger.jsonl"),
    logFile: join(state, "scraper.log"),
    ingestBaseUrl: env.get(ENV.INGEST_BASE_URL).default("").asString(),
    ingestPath: env
      .get(ENV.INGEST_PATH)
      .default("/legal-documents/ingest")
      .asString(),
    ingestToken: env.get(ENV.INGEST_TOKEN).default("").asString(),
    ingestTimeout: env.get(ENV.INGEST_TIMEOUT).default("300").asIntPositive(),
    ingestMaxRetries: env.get(ENV.INGEST_MAX_RETRIES).default("5").asIntPositive(),
    ingestCountry: env.get(ENV.INGEST_COUNTRY).default("PE").asString(),
    ingestSource: env
      .get(ENV.INGEST_SOURCE)
      .default(sourceByKey("el_peruano").canonicalName)
      .asString(),
    ingestStatus: env.get(ENV.INGEST_STATUS).default("Vigente").asString(),
  };
}

export function ingestUrl(cfg: Config): string {
  return cfg.ingestBaseUrl.replace(/\/+$/, "") + cfg.ingestPath;
}
