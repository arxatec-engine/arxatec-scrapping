import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { env } from "../../../config";
import * as ENV from "../../../constants/env";
import {
  BASE_HEADERS,
  DEFAULT_START_MONTH,
  DEFAULT_USER_AGENT,
  ISSUER_NAME,
  MAX_RETRIES,
  BACKOFF_BASE,
  REQUEST_TIMEOUT,
  PROGRESS_EVERY,
  URL_AVANZADA,
  URL_CRONOLOGICO,
} from "../constants";
import { REPO_ROOT } from "./paths";
import type { Config } from "../types";

export * from "./paths";

export function config(): Config {
  const state = join(REPO_ROOT, "state", "tc_ingest");
  mkdirSync(state, { recursive: true });
  return {
    concurrency: env.get(ENV.TC_CONCURRENCY).default("2").asIntPositive(),
    minDelay: env.get(ENV.TC_DELAY).default("0").asFloat(),
    limit: env.get(ENV.TC_LIMIT).default("0").asInt() || null,
    maxRetries: MAX_RETRIES,
    backoffBase: BACKOFF_BASE,
    requestTimeout: REQUEST_TIMEOUT,
    progressEvery: PROGRESS_EVERY,
    startMonth: env.get(ENV.TC_START_MONTH).default(DEFAULT_START_MONTH).asString(),
    endMonth: env.get(ENV.TC_END_MONTH).asString() || null,
    urlCronologico: URL_CRONOLOGICO,
    urlAvanzada: URL_AVANZADA,
    headers: {
      "User-Agent": env.get(ENV.TC_UA).default(DEFAULT_USER_AGENT).asString(),
      ...BASE_HEADERS,
    },
    issuerName: ISSUER_NAME,
    docsPath: join(state, "ledger.jsonl"),
    checkpointPath: join(state, "checkpoint.json"),
    logFile: join(state, "scraper.log"),
    ingestBaseUrl: env.get(ENV.INGEST_BASE_URL).default("").asString(),
    ingestPath: env
      .get(ENV.INGEST_PATH)
      .default("/legal-documents/ingest")
      .asString(),
    ingestToken: env.get(ENV.INGEST_TOKEN).default("").asString(),
    ingestTimeout: env.get(ENV.INGEST_TIMEOUT).default("300").asIntPositive(),
    ingestMaxRetries: env
      .get(ENV.INGEST_MAX_RETRIES)
      .default("5")
      .asIntPositive(),
    ingestCountry: env.get(ENV.INGEST_COUNTRY).default("PE").asString(),
    ingestSource: env.get(ENV.INGEST_SOURCE).default("TC").asString(),
    ingestStatus: env.get(ENV.INGEST_STATUS).default("Vigente").asString(),
  };
}

export function ingestUrl(cfg: Config): string {
  return cfg.ingestBaseUrl.replace(/\/+$/, "") + cfg.ingestPath;
}
