import type { IngestRecord, Logger, Stats, Throttle } from "../../../../types";
import type { Area } from "../../../spij/types/legal_areas";

export interface Config {
  concurrency: number;
  minDelay: number;
  limit: number | null;
  maxRetries: number;
  backoffBase: number;
  requestTimeout: number;
  progressEvery: number;

  startMonth: string;
  endMonth: string | null;

  urlCronologico: string;
  urlAvanzada: string;
  headers: Record<string, string>;

  issuerName: string;

  docsPath: string;
  checkpointPath: string;
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

export interface Api {
  cfg: Config;
  log: Logger;
  throttle: Throttle;
}

export type RawResult = Record<string, any>;

/** Sentencia/auto/resolución del TC, ya parseada del `_source` de Elastic. */
export interface Doc {
  id: string | null;
  expediente: string | null;
  sentencia: string | null;
  slug: string | null;
  pdfUrl: string | null;
  publishedAt: string | null;
  sentenceDate: string | null;
  demandante: string | null;
  demandado: string | null;
  sala: string | null;
  distrito: string | null;
  tipo: string | null;
  sentido: string | null;
  fundamentos: string[];
  content: string | null;
}

export interface Page {
  docs: RawResult[];
  total: number;
  numPages: number;
}

export interface Ctx {
  cfg: Config;
  log: Logger;
  api: Api;
  issuerEntityId: string | null;
  docsPath: string;
  stats: Stats;
  ingestThrottle: Throttle;
}

export interface StoredRecord {
  id: string;
  expediente: string | null;
  sentencia: string | null;
  fechaPublicacion: string | null;
  demandante: string | null;
  demandado: string | null;
  sala: string | null;
  distrito: string | null;
  pdfUrl: string | null;
  legal_area?: Area | null;
  ingest?: IngestRecord;
}

/** Checkpoint de reanudación: mes y página dentro del recorrido cronológico. */
export interface TcCheckpoint {
  month: string;
  page: number;
  total_agregados: number | null;
  ts: string;
}
