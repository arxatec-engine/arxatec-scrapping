import { mkdirSync } from "node:fs";
import { join } from "node:path";

import { env } from "../../../config";
import * as ENV from "../../../constants/env";
import {
  BACKOFF_BASE,
  DEFAULT_USER_AGENT,
  MAX_RETRIES,
  PRIMERA_LEY_PDF,
  PROGRESS_EVERY,
  REQUEST_TIMEOUT,
  ULTIMA_LEY_PDF,
} from "../constants";
import { REPO_ROOT } from "./paths";
import type { Config } from "../types";
import { sourceByKey } from "../../../services/sources";

export * from "./paths";

export function config(): Config {
  const state = join(REPO_ROOT, "state", "adlp_ingest");
  mkdirSync(state, { recursive: true });
  return {
    concurrency: env.get(ENV.ADLP_CONCURRENCY).default("2").asIntPositive(),
    minDelay: env.get(ENV.ADLP_DELAY).default("0.5").asFloat(),
    limit: env.get(ENV.ADLP_LIMIT).default("0").asInt() || null,
    maxRetries: MAX_RETRIES,
    backoffBase: BACKOFF_BASE,
    requestTimeout: REQUEST_TIMEOUT,
    progressEvery: PROGRESS_EVERY,
    userAgent: env.get(ENV.ADLP_UA).default(DEFAULT_USER_AGENT).asString(),
    numDesde: env.get(ENV.ADLP_DESDE).default(String(PRIMERA_LEY_PDF)).asIntPositive(),
    numHasta: env.get(ENV.ADLP_HASTA).default(String(ULTIMA_LEY_PDF)).asIntPositive(),
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
      .default(sourceByKey("congreso").canonicalName)
      .asString(),
  };
}

export function ingestUrl(cfg: Config): string {
  return cfg.ingestBaseUrl.replace(/\/+$/, "") + cfg.ingestPath;
}
