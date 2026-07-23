import type { Browser } from "puppeteer";
import type { IngestRecord, Logger, Stats, Throttle } from "../../../../types";
import type { Area } from "../legal_areas";

export interface Config {

  concurrency: number;
  minDelay: number;
  pageSize: number;
  limit: number | null;
  maxRetries: number;
  backoffBase: number;
  requestTimeout: number;
  progressEvery: number;

  usuario: string;
  clave: string;
  tipoAcceso: number;

  tipoNorma: string;
  buscarHistorico: boolean;
  dispositivoLegal: string[];
  fechaInicio: string | null;
  fechaFin: string | null;

  authBack: string;
  authSolr: string;
  urlBuscar: string;
  urlWord: string;
  urlSector: string;
  headers: Record<string, string>;

  docsPath: string;
  checkpointPath: string;
  logFile: string;
  cursorKey: string;

  ingestBaseUrl: string;
  ingestPath: string;
  ingestToken: string;
  ingestTimeout: number;
  ingestMaxRetries: number;
  ingestCountry: string;
  ingestSource: string;
  ingestStatus: string;
}

export interface Doc {
  id: string | null;
  code: string | null;
  sector: string | null;
  title: string | null;
  publishedAt: string | null;
  grouping: string | null;
  dispositivoLegal: string | null;
}

export type RawResult = Record<string, any>;

export interface Page {
  docs: RawResult[];
  nextCursor: number | null;
  total: number;
}

export interface Api {
  cfg: Config;
  log: Logger;
  throttle: Throttle;
  token: string | null;
  tokenSolr: string | null;
}

export interface AuthBody {
  usuario: string;
  clave: string;
  tipo?: number;
}

export interface Group {
  id: string;
  name: string;
}
export interface Subgroup {
  id: string;
  name: string;
  group_id: string;
}
export interface IndexEntity {
  id: string;
  name: string;
  norm: string;
  tokens: Set<string>;
  subgroup_id: string | null;
}
export interface Index {
  group_by_id: Record<string, Group>;
  subgroup_by_id: Record<string, Subgroup>;
  subgroup_by_norm: Record<string, Subgroup>;
  entities: IndexEntity[];
  exact: Record<string, IndexEntity>;
  cache: Record<string, Classif>;

  sector_parent: Record<string, string>;
}

export interface SectorRaw {
  id?: string;
  nombre?: string;
  padre?: string | null;
  grupo?: string;
  esPadre?: string;
}

export type MatchConfidence = "exact" | "fuzzy" | "unmatched";
export interface Classif {
  group_id: string | null;
  group_name: string | null;
  subgroup_id: string | null;
  subgroup_name: string | null;
  entity_id: string | null;
  entity_name: string | null;
  match_confidence: MatchConfidence;
}

export interface Ctx {
  cfg: Config;
  log: Logger;
  api: Api;
  idx: Index;
  docsPath: string;
  stats: Stats;
  ingestThrottle: Throttle;
  browser: Browser;
}

export interface StoredRecord {
  id: string;
  codigoNorma: string | null;
  sector: string | null;
  fechaPublicacion: string | null;
  sumilla: string;
  ruta_agrupacion: string | null;
  dispositivoLegal: string | null;
  clasificacion: Classif;
  legal_area?: Area | null;
  ingest?: IngestRecord;
}
