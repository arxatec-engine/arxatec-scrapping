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
  /** Ventana explícita (ISO YYYY-MM-DD). Sin ella: últimos `dias`. */
  desde: string | null;
  hasta: string | null;
  /** Modo incremental: días hacia atrás desde hoy (default 7). */
  dias: number;
  /** "todos" (default, decisión owner 2026-07-31) o "nacional" (salta Gobiernos Regionales/Locales). */
  ambito: string;
  /** Slugs excluidos (streams cubiertos por módulos dedicados). */
  excluir: string[];
  /** Tope de hojas POR VENTANA (además del tope real del buscador). */
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

/** Una norma del stream general de gob.pe. */
export interface Doc {
  /** Id numérico de gob.pe — id del ledger. */
  gid: string;
  /** Slug de la institución dueña. */
  institucion: string;
  /** Etiqueta del emisor ("SIGLA - Nombre completo"). */
  entidadLabel: string;
  numero: string;
  sumilla: string;
  publishedAt: string | null;
  pdfUrl: string;
  path: string;
}

export interface StoredRecord {
  id: string;
  institucion: string;
  entidadLabel: string;
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
  /** gids ya ingestados por módulos dedicados: JAMÁS se tocan aquí. */
  ajenos: Set<string>;
  stats: Stats;
  ingestThrottle: Throttle;
  gobpeThrottle: Throttle;
  browser: Browser;
}
