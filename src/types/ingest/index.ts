/**
 * Estado local de ingesta compartido (ledger + reanudación) que usan los
 * módulos. El CONTRATO de la API (`Metadata` / `IngestData` / `IngestResult`)
 * vive en `src/types/common` (reexportado también vía `src/types`), para no
 * duplicarlo; aquí solo quedan los tipos de estado local.
 */

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
  /**
   * Ingesta aceptada (200) pero con un problema de calidad detectado (p.ej.
   * emisor no enlazado, área por defecto). No se reintenta; queda para revisión.
   */
  warning?: string | null;
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
