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
  /** Períodos parlamentarios a barrer (vacío = todos los que liste la API). */
  periodos: number[];
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

/** Un proyecto de ley (lista + expediente fusionados). */
export interface Doc {
  perParId: number;
  pleyNum: number;
  /** "14864/2025-CR" — id del ledger. */
  proyectoLey: string;
  titulo: string;
  sumilla: string;
  desEstado: string;
  fecPresentacion: string | null;
  desProponente: string;
  autores: string;
}

export interface StoredRecord {
  id: string;
  perParId: number;
  pleyNum: number;
  titulo: string;
  sumilla: string;
  desEstado: string;
  fecPresentacion: string | null;
  desProponente: string;
  autores: string;
  clasificacion: Classif;
  legal_area: Area | null;
  ingest?: IngestRecord;
}

export interface Ctx {
  cfg: Config;
  log: Logger;
  idx: Index;
  /** Emisor FIJO: Congreso de la República. */
  issuer: Classif;
  stats: Stats;
  ingestThrottle: Throttle;
  spleyThrottle: Throttle;
  browser: Browser;
}
