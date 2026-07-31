import type { Browser } from "puppeteer";

import type { Classif, Index } from "../../spij/types/spij";
import type { Area } from "../../spij/types/legal_areas";
import type {
  IngestData,
  IngestResult,
  Logger,
  Metadata,
  Sem,
  Throttle,
} from "../../../types";
import type { IngestRecord, Stats } from "../../../types/ingest";

export type { Classif, Area, IngestData, IngestResult, Logger, Metadata, Sem, Stats };

export interface Config {
  concurrency: number;
  minDelay: number;
  limit: number | null;
  maxRetries: number;
  backoffBase: number;
  requestTimeout: number;
  progressEvery: number;
  userAgent: string;
  /** Slugs de repos a cosechar (vacío = todos los de la lista). */
  repos: string[];
  docsPath: string;
  logFile: string;
  ingestBaseUrl: string;
  ingestPath: string;
  ingestToken: string;
  ingestTimeout: number;
  ingestMaxRetries: number;
  ingestCountry: string;
  ingestSource: string;
  ingestStatus: string;
}

/** Un registro Dublin Core cosechado (tesis/artículo jurídico). */
export interface Doc {
  /** Identificador OAI (`oai:host:handle`) — id del ledger. */
  oaiId: string;
  repoKey: string;
  emisor: string;
  titulo: string;
  autores: string[];
  fecha: string | null;
  tipo: string;
  materias: string[];
  resumen: string;
  /** URL del recurso (handle) → source_url. */
  url: string;
}

export interface StoredRecord {
  id: string;
  repoKey: string;
  emisor: string;
  titulo: string;
  autores: string[];
  fecha: string | null;
  tipo: string;
  materias: string[];
  resumen: string;
  url: string;
  clasificacion: Classif;
  legal_area: Area | null;
  ingest?: IngestRecord;
}

export interface Ctx {
  cfg: Config;
  log: Logger;
  idx: Index;
  stats: Stats;
  ingestThrottle: Throttle;
  oaiThrottle: Throttle;
  browser: Browser;
}
