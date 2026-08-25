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
    client = new QdrantClient({
      url: cfg.qdrantUrl,
      timeout: 120_000,
      ...(cfg.qdrantApiKey ? { apiKey: cfg.qdrantApiKey } : {}),
    });
  }
  return client;
}

export function collectionName(country: string): string {
  return `${BASE_COLLECTION}_${country.trim().toLowerCase()}`;
}

/**
 * Comprueba que la colección existe antes de empezar a trabajar.
 *
 * El scraper NO la crea a propósito: la colección la define el assistant, con su
 * tamaño de vector, su distancia y sus 20+ índices de payload. Una colección
 * creada aquí "a ojo" arrancaría bien y rompería la búsqueda semanas después.
 * Mejor fallar al arrancar con un mensaje que diga qué hacer.
 */
export async function assertCollectionExists(
  cfg: LocalIngestClient,
  country: string
): Promise<void> {
  const name = collectionName(country);
  const { collections } = await getClient(cfg).getCollections();

  if (!collections.some((c) => c.name === name)) {
    throw new Error(
      `La colección "${name}" no existe en ${cfg.qdrantUrl}. La crea el ` +
        "assistant al arrancar (sus migraciones de Qdrant), con los índices de " +
        "payload que necesita la búsqueda. Arranca el assistant una vez contra " +
        "este Qdrant antes de ingestar."
    );
  }
}

/**
 * Huellas de los chunks ya indexados de un documento, por índice.
 *
 * Sirve para no volver a pagar embeddings de algo que no cambió: ver
 * `alreadyIndexed` en index.ts.
 */
export async function existingContentHashes(
  cfg: LocalIngestClient,
  country: string,
  documentId: string
): Promise<Map<number, string>> {
  const hashes = new Map<number, string>();
  let offset: string | number | undefined | null = undefined;

  do {
    const page = await getClient(cfg).scroll(collectionName(country), {
      filter: {
        must: [{ key: "metadata.document_id", match: { value: documentId } }],
      },
      with_payload: ["metadata"],
      with_vector: false,
      limit: 256,
      offset: offset ?? undefined,
    });

    for (const point of page.points) {
      const meta = (point.payload?.metadata ?? {}) as Record<string, unknown>;
      const index = meta.chunk_index;
      const hash = meta.content_hash;
      if (typeof index === "number" && typeof hash === "string") {
        hashes.set(index, hash);
      }
    }

    offset = page.next_page_offset as string | number | null;
  } while (offset !== null && offset !== undefined);

  return hashes;
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
