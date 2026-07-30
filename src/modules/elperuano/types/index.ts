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
  /** `YYYY-MM` para elegir el CSV mensual del dataset; null = el más reciente. */
  periodo: string | null;
  /** URL directa de un CSV del dataset (salta el descubrimiento). */
  csvUrl: string | null;
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

/** Una fila del CSV de Dispositivos Legales, ya decodificada y validada. */
export interface Doc {
  /** Columna OP (ej. "2375814-1"): id del visor y del ledger. */
  op: string;
  /** Fecha Publicación en ISO (YYYY-MM-DD). */
  publishedAt: string | null;
  /** Columna Entidad: nombre de sector del emisor ("AMBIENTE", "PCM"...). */
  entidad: string;
  /** Columna Dispositivo ("LEY", "RESOLUCION MINISTERIAL"...). */
  dispositivo: string;
  /** Columna Número ("N° 042-2025-PCM"). */
  numero: string | null;
  sumilla: string;
}

export interface StoredRecord {
  id: string;
  fechaPublicacion: string | null;
  entidad: string;
  dispositivo: string;
  numero: string | null;
  sumilla: string;
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
  visorThrottle: Throttle;
  browser: Browser;
}
