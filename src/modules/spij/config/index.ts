import { mkdirSync } from "node:fs";
import { join } from "node:path";

import { env } from "@/config";
import * as ENV from "@/constants/env";
import {
  BASE_BACK,
  BASE_SOLR,
  BASE_HEADERS,
  DEFAULT_USER_AGENT,
  MAX_RETRIES,
  BACKOFF_BASE,
  REQUEST_TIMEOUT,
  PROGRESS_EVERY,
} from "../constants";
import { REPO_ROOT } from "./paths";
import type { Config } from "../types";

export * from "./paths";

export function config(): Config {
  const state = join(REPO_ROOT, "state", "spij_ingest");
  mkdirSync(state, { recursive: true });
  return {
    concurrency: env.get(ENV.SPIJ_INGEST_CONCURRENCY).default("2").asIntPositive(),
    minDelay: env.get(ENV.SPIJ_INGEST_DELAY).default("0").asFloat(),
    pageSize: env.get(ENV.SPIJ_PAGE_SIZE).default("100").asIntPositive(),
    limit: env.get(ENV.SPIJ_LIMIT).default("0").asInt() || null,
    maxRetries: MAX_RETRIES,
    backoffBase: BACKOFF_BASE,
    requestTimeout: REQUEST_TIMEOUT,
    progressEvery: PROGRESS_EVERY,
    usuario: env.get(ENV.SPIJ_USER).default("spijext").asString(),
    clave: env.get(ENV.SPIJ_CLAVE).default("password").asString(),
    tipoAcceso: env.get(ENV.SPIJ_TIPO_ACCESO).default("0").asInt(),
    tipoNorma: env.get(ENV.SPIJ_TIPO).default("NR").asString(),
    buscarHistorico: env.get(ENV.SPIJ_HISTORICO).default("false").asBool(),
    dispositivoLegal: env
      .get(ENV.SPIJ_DISP)
      .default("")
      .asString()
      .split(",")
      .filter((x) => x.trim()),
    fechaInicio: env.get(ENV.SPIJ_FECHA_INI).asString() || null,
    fechaFin: env.get(ENV.SPIJ_FECHA_FIN).asString() || null,
    authBack: `${BASE_BACK}/authenticate`,
    authSolr: `${BASE_SOLR}/authenticate`,
    urlBuscar: `${BASE_SOLR}/api/buscar`,
    urlWord: `${BASE_BACK}/api/procesarword`,
    urlSector: `${BASE_BACK}/api/sector`,
    headers: {
      "User-Agent": env.get(ENV.SPIJ_UA).default(DEFAULT_USER_AGENT).asString(),
      ...BASE_HEADERS,
    },
    docsPath: join(state, "ledger.jsonl"),
    checkpointPath: join(state, "checkpoint.json"),
    logFile: join(state, "scraper.log"),
    cursorKey: "desde",
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
    ingestSource: env.get(ENV.INGEST_SOURCE).default("SPIJ").asString(),
    ingestStatus: env.get(ENV.INGEST_STATUS).default("Vigente").asString(),
  };
}

export function ingestUrl(cfg: Config): string {
  return cfg.ingestBaseUrl.replace(/\/+$/, "") + cfg.ingestPath;
}
