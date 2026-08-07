import { v4 as uuidv4, v5 as uuidv5 } from "uuid";

/**
 * Identidad DETERMINISTA del documento — port exacto de
 * `_build_document_id` (assistant, ingest/service.py).
 *
 * `source_url` es la identidad natural: re-ingestar la misma fuente produce el
 * MISMO document_id y por tanto reemplaza en vez de duplicar. Sin source_url no
 * hay identidad natural y se cae al uuid4 histórico.
 *
 * ⚠️ El namespace es `uuid.NAMESPACE_URL` y la cadena tiene que coincidir
 * carácter a carácter con la de Python, o el mismo documento acabaría con dos
 * identidades según quién lo ingiera.
 */
export function buildDocumentId(country: string, sourceUrl: string | null): string {
  if (!sourceUrl) return uuidv4();

  return uuidv5(
    `legal_document:${country.trim().toUpperCase()}:${sourceUrl}`,
    uuidv5.URL
  );
}

/**
 * Ids de punto deterministas por (document_id, índice) — port de
 * `_build_qdrant_ids`. Que sean deterministas es lo que hace que el upsert
 * PISE los puntos anteriores en vez de acumular duplicados.
 */
export function buildPointIds(documentId: string, total: number): string[] {
  return Array.from({ length: total }, (_, index) =>
    uuidv5(`legal_documents_v2:${documentId}:${index}`, uuidv5.URL)
  );
}
