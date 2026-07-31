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
  /** Slugs a procesar (REG_SOLO="osiptel,sunass"); vacío = los cuatro. */
  solo: string[];
  /** Tope de páginas del buscador POR institución (0 = todas). */
  maxSheets: number;
  docsPath: string;
  logFile: string;
  ingestBaseUrl: string;
  ingestPath: string;
  ingestToken: string;
  ingestTimeout: number;
  ingestMaxRetries: number;
  ingestCountry: string;
  ingestStatus: string;
}

/** Una norma de un regulador publicada en gob.pe. */
export interface Doc {
  /** Id numérico de gob.pe — id del ledger (único global). */
  gid: string;
  /** Slug del regulador dueño ("osiptel"...). */
  institucion: string;
  numero: string;
  sumilla: string;
  publishedAt: string | null;
  pdfUrl: string;
  path: string;
}

export interface StoredRecord {
  id: string;
  institucion: string;
  numero: string;
  sumilla: string;
  fechaPublicacion: string | null;
  pdfUrl: string;
  path: string;
  clasificacion: Classif;
  legal_area: Area | null;
  ingest?: IngestRecord;
}

/** Lo resuelto por regulador al arrancar. */
export interface ReguladorCtx {
  issuer: Classif;
  source: string;
  sigla: string;
}

export interface Ctx {
  cfg: Config;
  log: Logger;
  idx: Index;
  /** institucion → emisor/fuente/sigla resueltos. */
  reguladores: Record<string, ReguladorCtx>;
  stats: Stats;
  ingestThrottle: Throttle;
  gobpeThrottle: Throttle;
  /** Para renderizar el PDF de texto cuando el original exige OCR. */
  browser: Browser;
}
