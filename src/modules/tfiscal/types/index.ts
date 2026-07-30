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
  /** Término del buscador de gob.pe (default "tribunal fiscal"). */
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

/** Una RTF publicada en gob.pe, ya filtrada y validada. */
export interface Doc {
  /** Id numérico de gob.pe (del href) — id del ledger, único por publicación. */
  gid: string;
  /** Nº de RTF limpio ("01380-1-2006"). */
  rtf: string;
  sumilla: string;
  /** Fecha de publicación en ISO. */
  publishedAt: string | null;
  /** PDF original en cdn.www.gob.pe. */
  pdfUrl: string;
  /** Ruta gob.pe (`/institucion/mef/normas-legales/...`) → source_url. */
  path: string;
}

export interface StoredRecord {
  id: string;
  rtf: string;
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
  /** Emisor FIJO del módulo: la entidad "Tribunal Fiscal" del catálogo. */
  issuer: Classif;
  stats: Stats;
  ingestThrottle: Throttle;
  gobpeThrottle: Throttle;
  /** Para renderizar el PDF de texto cuando el original exige OCR. */
  browser: Browser;
}
