import { QdrantClient } from "@qdrant/js-client-rest";

import type { Chunk, LocalIngestClient } from "./types";

const BASE_COLLECTION = "legal_documents";

// Formato de punto que escribe langchain_qdrant y que asume la LECTURA del
// assistant (query/service.py construye un QdrantVectorStore con los defaults).
// Verificado el 2026-08-06 comparando un punto viejo con uno nuevo: si esto se
// desvía, la búsqueda deja de ver lo ingerido y ningún test lo nota.
const CONTENT_KEY = "page_content";
const METADATA_KEY = "metadata";
const VECTOR_NAME = ""; // vector por defecto, sin nombre

// El default de langchain (64) genera requests de ~1MB con vectores de 1024d y
// payloads de artículo, y el nginx delante del Qdrant remoto responde 413.
const UPSERT_BATCH = 32;

let client: QdrantClient | null = null;

function getClient(cfg: LocalIngestClient): QdrantClient {
  if (client === null) {
    client = new QdrantClient({ url: cfg.qdrantUrl, timeout: 120_000 });
  }
  return client;
}

export function collectionName(country: string): string {
  return `${BASE_COLLECTION}_${country.trim().toLowerCase()}`;
}

/**
 * Delete-first: borra los puntos previos del documento antes del upsert.
 *
 * Los ids de punto son deterministas por (document_id, índice), así que el
 * upsert pisa los primeros N; este borrado elimina la COLA obsoleta cuando la
 * re-ingesta produce menos chunks que la corrida anterior.
 */
export async function deleteExistingPoints(
  cfg: LocalIngestClient,
  country: string,
  documentId: string
): Promise<void> {
  await getClient(cfg).delete(collectionName(country), {
    filter: {
      must: [{ key: "metadata.document_id", match: { value: documentId } }],
    },
    wait: true,
  });
}

export async function upsertChunks(
  cfg: LocalIngestClient,
  country: string,
  chunks: Chunk[],
  ids: string[],
  vectors: number[][]
): Promise<void> {
  const name = collectionName(country);
  const qdrant = getClient(cfg);

  for (let start = 0; start < chunks.length; start += UPSERT_BATCH) {
    const slice = chunks.slice(start, start + UPSERT_BATCH);

    await qdrant.upsert(name, {
      wait: true,
      points: slice.map((chunk, offset) => ({
        id: ids[start + offset],
        vector: { [VECTOR_NAME]: vectors[start + offset] },
        payload: {
          [CONTENT_KEY]: chunk.text,
          [METADATA_KEY]: chunk.metadata,
        },
      })),
    });
  }
}
