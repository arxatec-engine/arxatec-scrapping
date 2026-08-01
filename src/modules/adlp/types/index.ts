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
  /** Rango de números de norma a barrer (reciente-primero). */
  numDesde: number;
  numHasta: number;
  docsPath: string;
  logFile: string;
  ingestBaseUrl: string;
  ingestPath: string;
  ingestToken: string;
  ingestTimeout: number;
  ingestMaxRetries: number;
  ingestCountry: string;
  ingestSource: string;
}

/** Una norma del índice (una fila del grid del buscador). */
export interface Doc {
  /** `ley-{numero}` — id del ledger (la numeración es correlativa única). */
  id: string;
  /** "LEY" | "RESOLUCION LEGISLATIVA" | "DECRETO LEY" (tal como lo da el grid). */
  tipo: string;
  numero: number;
  titulo: string;
  /** Fecha de publicación ISO (columna del grid), o null si el grid no la dio. */
  fecha: string | null;
  /** true si el buscador la lista entre las "Normas no vigentes". */
  derogada: boolean;
  /** URL del PDF en el archivo. */
  href: string;
}

export interface StoredRecord {
  id: string;
  tipo: string;
  numero: number;
  titulo: string;
  fecha: string | null;
  derogada: boolean;
  href: string;
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
  adlpThrottle: Throttle;
  browser: Browser;
  /** Campos ocultos del form WebForms (ViewState), cacheados por corrida. */
  form: Record<string, string> | null;
}
