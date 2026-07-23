/**
 * Tipos de documento del backend (`LegalDocumentType` en
 * app/storage/legal_documents/shared/enums.py del assistant), más "codigo",
 * que activa el chunking por artículo en el ingest. El endpoint NO valida el
 * campo (string libre): un typo entraría en silencio y crearía un tipo
 * fantasma en el corpus, por eso todos los módulos construyen su metadata
 * con este union type.
 */
export type LegalDocumentType =
  | "normative"
  | "jurisprudence"
  | "administrative_act"
  | "doctrine"
  | "codigo";

export interface Logger {
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
}

export interface Throttle {
  minDelay: number;
  locks: Record<string, Promise<void>>;
  last: Record<string, number>;
}

export interface Sem {
  run<T>(fn: () => Promise<T>): Promise<T>;
}

export type Expect = "json" | "text";

export interface RequestOptions {
  method: string;
  url: string;
  throttle: Throttle;
  throttleKey: string;
  log: Logger;
  maxRetries: number;
  backoffBase: number;
  timeout: number;
  auth?: (() => string | null) | string | null;
  on401?: () => Promise<void>;
  expect?: Expect;
  headers?: Record<string, string>;
  json?: unknown;
}

/**
 * Contrato de ingesta del backend (`POST /legal-documents/ingest` del
 * arxatec-lawyer-assistant). Es EL MISMO para todas las fuentes: cada módulo
 * llena este objeto y lo manda como campo `metadata` (string JSON) del
 * multipart. Ver docs/plan-poder-judicial.md §3.1 y docs/deuda-tecnica.md.
 */
export interface Metadata {
  country: string;
  type: LegalDocumentType;
  title: string;
  document_number: string | null;
  jurisdiction: string;
  legal_area: string;
  subarea: string;
  legal_area_id: string | null;
  legal_subarea_id: string | null;
  source: string;
  source_url: string;
  status: string;
  version: number;
  language: string;
  published_at: string | null;
  effective_date: string | null;
  keywords: string[];
  concepts: string[];
  references: string[];
  issuer_entity_ids?: string[];
  court_entity_ids?: string[];
}

/** Bloque `data` de la respuesta 200 del endpoint de ingesta. */
export interface IngestData {
  document_id?: string | null;
  indexed_chunks?: number | null;
  pages_with_text?: number | null;
  linked_entities?: number | null;
  linked_relations?: number | null;
  [k: string]: unknown;
}

/**
 * Resultado normalizado de una ingesta. `permanent` = no reintentar (4xx de
 * validación); `auth` = token inválido (abortar corrida); si `!ok && !permanent`
 * es un fallo transitorio (red/5xx/429) que el orquestador puede reintentar.
 */
export interface IngestResult {
  ok: boolean;
  permanent: boolean;
  status: number | null;
  error: string | null;
  data: IngestData;
  auth?: boolean;
}
