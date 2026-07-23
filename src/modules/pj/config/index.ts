import { mkdirSync } from "node:fs";
import { join } from "node:path";

import { env } from "../../../config";
import * as ENV from "../../../constants/env";
import {
  BACKOFF_BASE,
  BASE_URL,
  DEFAULT_USER_AGENT,
  MAX_RETRIES,
  PROGRESS_EVERY,
  REQUEST_TIMEOUT,
  ROOT_PATH,
} from "../constants";
import { REPO_ROOT } from "./paths";
import type { Config } from "../types";

export * from "./paths";

export function config(): Config {
  const state = join(REPO_ROOT, "state", "pj_jurisprudencia");
  mkdirSync(state, { recursive: true });
  return {
    concurrency: env.get(ENV.PJ_CONCURRENCY).default("2").asIntPositive(),
    // 0.7s por defecto: ritmo cortés para el bot manager del PJ (ver constants/http).
    minDelay: env.get(ENV.PJ_DELAY).default("0.7").asFloat(),
    limit: env.get(ENV.PJ_LIMIT).default("0").asInt() || null,
    maxRetries: MAX_RETRIES,
    backoffBase: BACKOFF_BASE,
    requestTimeout: REQUEST_TIMEOUT,
    progressEvery: PROGRESS_EVERY,
    userAgent: env.get(ENV.PJ_UA).default(DEFAULT_USER_AGENT).asString(),
    baseUrl: BASE_URL,
    // PJ_ROOT permite apuntar el crawler a una rama/hoja concreta (una URL del
    // portal, p.ej. un tema específico) en vez de todo el árbol. Útil para
    // pruebas dirigidas. Por defecto, la raíz de Jurisprudencia Sistematizada.
    rootPath: env.get(ENV.PJ_ROOT).default(ROOT_PATH).asString(),
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
    ingestMaxRetries: env.get(ENV.INGEST_MAX_RETRIES).default("5").asIntPositive(),
    ingestCountry: env.get(ENV.INGEST_COUNTRY).default("PE").asString(),
    // source DEBE coincidir EXACTO con LEGAL_SOURCE.PODER_JUDICIAL de la
    // plataforma ("Poder judicial"): el filtro de "Fuentes" hace match exacto
    // (documents.source == source), así que un "PJ" no aparecería al filtrar.
    ingestSource: env.get(ENV.INGEST_SOURCE).default("Poder judicial").asString(),
    ingestStatus: env.get(ENV.INGEST_STATUS).default("Vigente").asString(),
  };
}

export function ingestUrl(cfg: Config): string {
  return cfg.ingestBaseUrl.replace(/\/+$/, "") + cfg.ingestPath;
}
