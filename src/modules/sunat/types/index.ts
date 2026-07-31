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
  /** Rango de años a barrer (hasta 0 = año actual). */
  anioDesde: number;
  anioHasta: number;
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

/** Un informe/oficio/carta del índice anual. */
export interface Doc {
  /** Nombre de archivo sin extensión ("i000131-2025-7T0000") — id del ledger. */
  id: string;
  /** "Informe" | "Oficio" | "Carta". */
  tipoDoc: string;
  /** Número limpio ("0000131-2025-SUNAT/7T0000"). */
  numero: string;
  sumilla: string;
  anio: number;
  /** URL absoluta del PDF o del .htm. */
  href: string;
  esPdf: boolean;
}

export interface StoredRecord {
  id: string;
  tipoDoc: string;
  numero: string;
  sumilla: string;
  anio: number;
  href: string;
  esPdf: boolean;
  clasificacion: Classif;
  legal_area: Area | null;
  ingest?: IngestRecord;
}

export interface Ctx {
  cfg: Config;
  log: Logger;
  idx: Index;
  /** Emisor FIJO: la entidad SUNAT del catálogo. */
  issuer: Classif;
  stats: Stats;
  ingestThrottle: Throttle;
  sunatThrottle: Throttle;
  browser: Browser;
}
