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
  progressEvery: number;
  userAgent: string;
  /** Término del buscador (vacío = stream completo). */
  term: string;
  /** Tope de páginas del buscador (0 = hasta que se acaben). */
  maxSheets: number;
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

/** Una norma de ESSALUD publicada en gob.pe. */
export interface Doc {
  /** Id numérico de gob.pe (del href) — id del ledger. */
  gid: string;
  /** Número limpio ("1011-PE-ESSALUD-2026"). */
  numero: string;
  sumilla: string;
  publishedAt: string | null;
  pdfUrl: string;
  path: string;
}

export interface StoredRecord {
  id: string;
  numero: string;
  sumilla: string;
  fechaPublicacion: string | null;
  pdfUrl: string;
  path: string;
  clasificacion: Classif;
  legal_area: Area | null;
  ingest?: IngestRecord;
}

export interface Ctx {
  cfg: Config;
  log: Logger;
  idx: Index;
  /** Emisor FIJO del módulo: la entidad ESSALUD del catálogo. */
  issuer: Classif;
  stats: Stats;
  ingestThrottle: Throttle;
  gobpeThrottle: Throttle;
  /** Para renderizar el PDF de texto cuando el original exige OCR. */
  browser: Browser;
}
