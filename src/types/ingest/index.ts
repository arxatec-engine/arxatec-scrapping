/**
 * Tipos del contrato con la API `legal_documents/ingest`, compartidos por todos
 * los módulos (spij, tc, ...). `Metadata` es el JSON que espera el endpoint;
 * `IngestRecord`/`Checkpoint` son el estado local (ledger + reanudación).
 */

export interface Metadata {
  country: string;
  type: string;
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
}

export interface IngestData {
  document_id?: string | null;
  indexed_chunks?: number | null;
  pages_with_text?: number | null;
  linked_entities?: number | null;
  linked_relations?: number | null;
  [k: string]: unknown;
}

export interface IngestResult {
  ok: boolean;
  permanent: boolean;
  status: number | null;
  error: string | null;
  data: IngestData;
  auth?: boolean;
}

export interface IngestRecord {
  done: boolean;
  ok: boolean;
  permanent: boolean;
  status: number | null;
  document_id: string | null;
  indexed_chunks: number | null;
  pages_with_text: number | null;
  linked_entities: number | null;
  linked_relations: number | null;
  error: string | null;
  ts: string;
}

export interface Stats {
  procesados: number;
  descargados: number;
  errores: number;
  conf: Record<string, number>;
}

export interface Checkpoint {
  [key: string]: number | string | null;
}
