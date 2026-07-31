import { mkdirSync } from "node:fs";
import { join } from "node:path";

import { env } from "../../../config";
import * as ENV from "../../../constants/env";
import {
  BACKOFF_BASE,
  DEFAULT_USER_AGENT,
  EXCLUIR_SLUGS_DEFAULT,
  PROGRESS_EVERY,
  SEARCH_MAX_RETRIES,
  SHEET_CAP,
} from "../constants";
import { REPO_ROOT } from "./paths";
import type { Config } from "../types";
import { sourceByKey } from "../../../services/sources";

export * from "./paths";

export function config(): Config {
  const state = join(REPO_ROOT, "state", "gobpe_ingest");
  mkdirSync(state, { recursive: true });
  return {
    concurrency: env.get(ENV.GOBPE_CONCURRENCY).default("2").asIntPositive(),
    minDelay: env.get(ENV.GOBPE_DELAY).default("0.4").asFloat(),
    limit: env.get(ENV.GOBPE_LIMIT).default("0").asInt() || null,
    maxRetries: SEARCH_MAX_RETRIES,
    backoffBase: BACKOFF_BASE,
    progressEvery: PROGRESS_EVERY,
    userAgent: env.get(ENV.GOBPE_UA).default(DEFAULT_USER_AGENT).asString(),
    desde: env.get(ENV.GOBPE_DESDE).asString() || null,
    hasta: env.get(ENV.GOBPE_HASTA).asString() || null,
    dias: env.get(ENV.GOBPE_DIAS).default("7").asIntPositive(),
    ambito: env.get(ENV.GOBPE_AMBITO).default("todos").asString(),
    excluir: env
      .get(ENV.GOBPE_EXCLUIR)
      .default(EXCLUIR_SLUGS_DEFAULT.join(","))
      .asString()
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    maxSheets: env.get(ENV.GOBPE_MAX_SHEETS).default(String(SHEET_CAP)).asIntPositive(),
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
      .default(sourceByKey("gobpe").canonicalName)
      .asString(),
    ingestStatus: env.get(ENV.INGEST_STATUS).default("Vigente").asString(),
  };
}

export function ingestUrl(cfg: Config): string {
  return cfg.ingestBaseUrl.replace(/\/+$/, "") + cfg.ingestPath;
}
