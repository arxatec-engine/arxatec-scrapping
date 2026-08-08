import { buildChunks } from "./chunk";
import { embedDocuments } from "./embeddings";
import { buildDocumentId, buildPointIds } from "./ids";
import { fetchEntities, saveDocument, type EntityLink } from "./postgres";
import {
  assertCollectionExists,
  deleteExistingPoints,
  existingContentHashes,
  upsertChunks,
} from "./qdrant";
import { buildKey, uploadOriginal } from "./s3";
import { ocrPdfPages } from "../ocr";
import { extractPages } from "./text";
import type { LocalIngestClient, ResolvedMetadata } from "./types";
import { canonicalSource, isKnownSource } from "../sources";
import type { IngestResult, Metadata } from "../../types";

export type { LocalIngestClient } from "./types";

/** Port de `normalize_text`: NFKD, sin diacríticos, minúsculas, espacios colapsados. */
export function normalizeTitle(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Misma precedencia que `_resolve_effective_date` del assistant. */
function resolveEffectiveDate(metadata: Metadata): string | null {
  return (
    metadata.effective_date ||
    metadata.published_at ||
    metadata.issued_at ||
    null
  );
}

function buildEntityLinks(metadata: Metadata): EntityLink[] {
  const links: EntityLink[] = [];

  for (const entityId of metadata.issuer_entity_ids ?? []) {
    links.push({ entityId, role: "issuer" });
  }
  for (const entityId of metadata.court_entity_ids ?? []) {
    links.push({ entityId, role: "court" });
  }

  const unique = new Map(links.map((l) => [`${l.entityId}|${l.role}`, l]));
  return [...unique.values()];
}

function fail(error: string, permanent: boolean): IngestResult {
  return { ok: false, permanent, status: null, error, data: {} };
}

/**
 * Comprobación de entorno, una sola vez por país y proceso.
 *
 * Va aquí y no en el `prepare()` de cada módulo para que replicar esto a los
 * otros 7 no exija acordarse de llamarla: el primer documento paga la
 * comprobación y el resto no.
 */
const preflighted = new Set<string>();

async function preflight(cfg: LocalIngestClient, country: string): Promise<void> {
  if (preflighted.has(country)) return;
  await assertCollectionExists(cfg, country);
  preflighted.add(country);
}

/**
 * Ingesta local: hace lo que hace `POST /legal-documents/ingest` del assistant,
 * pero dentro del propio scraper — extraer, trocear, embeddings, Qdrant, PG, S3.
 *
 * **Respeta el mismo contrato de salida** (`IngestResult`) que el cliente HTTP,
 * y eso es deliberado: el módulo que la llama no se entera de por dónde fue. En
 * particular, cuando el PDF no tiene texto extraíble devuelve el MISMO error
 * permanente que el assistant ("No extractable text in document"), que es lo que
 * dispara el fallback de OCR local de los módulos.
 */
export async function ingestLocal(
  cfg: LocalIngestClient,
  pdfBytes: Uint8Array,
  filename: string,
  metadata: Metadata
): Promise<IngestResult> {
  try {
    const source = canonicalSource(metadata.source);
    if (!isKnownSource(source)) {
      cfg.log.warn(
        'Fuente fuera del catálogo canónico: "%s" (se ingiere tal cual)',
        source
      );
    }

    const country = metadata.country.trim().toUpperCase();
    await preflight(cfg, country);

    const documentId = buildDocumentId(country, metadata.source_url);

    let pages = await extractPages(pdfBytes);
    let ocrUsado = false;

    if (pages.length === 0) {
      // MEJORA sobre la ruta del assistant: en vez de devolver el error y
      // obligar al módulo al rodeo «OCR → renderizar un PDF nuevo → reingerir»,
      // se hace el OCR aquí mismo. Se ahorra un render y una segunda pasada
      // completa, y —lo que más importa— se conservan los números de página
      // reales, que el rodeo perdía (todo acababa como `[PAGE 1]`).
      cfg.log.info("Sin texto extraíble: intento OCR local…");
      const ocr = await ocrPdfPages(pdfBytes, cfg.log);

      if (ocr) {
        pages = ocr
          .map((text, i) => ({ page: i + 1, text: text.trim() }))
          .filter((p) => p.text.length > 0);
        ocrUsado = pages.length > 0;
      }
    }

    if (pages.length === 0) {
      // Mismo mensaje que el controller del assistant: los módulos lo detectan
      // por regex para lanzar SU fallback de OCR. Cambiarlo lo rompe, y en modo
      // remoto sigue siendo la única vía.
      return fail("No extractable text in document", true);
    }

    const effectiveDate = resolveEffectiveDate(metadata);
    if (!effectiveDate) {
      return fail(
        "At least one date is required: effective_date, published_at or issued_at",
        true
      );
    }

    const key = cfg.awsBucket ? buildKey(country, documentId, filename) : null;
    if (key) await uploadOriginal(cfg, key, pdfBytes, filename);

    const now = new Date();
    const resolved: ResolvedMetadata = {
      ...metadata,
      source,
      document_id: documentId,
      key,
      normalized_title: normalizeTitle(metadata.title),
      resolved_effective_date: effectiveDate,
      created_at: now,
      updated_at: now,
    };

    const requestedLinks = buildEntityLinks(metadata);
    const entities = await fetchEntities(
      cfg.databaseUrl,
      requestedLinks.map((l) => l.entityId)
    );
    const validLinks = requestedLinks.filter((l) => entities.has(l.entityId));

    const issuerName =
      validLinks
        .filter((l) => l.role === "issuer")
        .map((l) => entities.get(l.entityId)?.name)
        .find(Boolean) ?? null;

    const chunks = await buildChunks(resolved, pages, validLinks, entities, issuerName);

    if (chunks.length === 0) {
      return fail("No extractable text in document", true);
    }

    const started = Date.now();

    // ¿Ya está indexado exactamente esto? Los embeddings son lo caro y lo que
    // se factura: si el contenido no cambió, no hay nada que volver a pagar.
    // Solo se salta si coinciden el NÚMERO de chunks y TODAS las huellas: una
    // corrida anterior interrumpida a medias no debe darse por buena.
    //
    // Se puede desactivar con INGEST_SKIP_UNCHANGED=false: mientras se prueba
    // que la ingesta embebe de verdad, saltarse el trabajo estorba más de lo
    // que ahorra. En campaña conviene dejarlo activo.
    const indexed = cfg.skipUnchanged
      ? await existingContentHashes(cfg, country, documentId)
      : new Map<number, string>();
    const unchanged =
      cfg.skipUnchanged &&
      indexed.size === chunks.length &&
      chunks.every(
        (chunk, index) => indexed.get(index) === chunk.metadata.content_hash
      );

    if (unchanged) {
      cfg.log.info(
        "Sin cambios doc=%s (%d chunks ya indexados): se omiten los embeddings",
        documentId,
        chunks.length
      );
    } else {
      await deleteExistingPoints(cfg, country, documentId);

      const ids = buildPointIds(documentId, chunks.length);
      const vectors = await embedDocuments(cfg, chunks.map((c) => c.text));
      await upsertChunks(cfg, country, chunks, ids, vectors);

      cfg.log.info(
        "Indexado local doc=%s chunks=%d en %ss",
        documentId,
        chunks.length,
        ((Date.now() - started) / 1000).toFixed(2)
      );
    }

    const saved = await saveDocument(cfg.databaseUrl, resolved, validLinks);

    return {
      ok: true,
      permanent: false,
      status: 200,
      error: null,
      data: {
        document_id: documentId,
        indexed_chunks: chunks.length,
        pages_with_text: pages.length,
        linked_entities: saved.linkedEntities,
        linked_relations: saved.linkedRelations,
        // El módulo lo usa para dejar el warning auditable en el ledger.
        ocr_used: ocrUsado,
      },
    };
  } catch (error) {
    // Transitorio por defecto: el orquestador reintenta y el ledger conserva el
    // documento como pendiente. Solo lo validable arriba es permanente.
    const message = error instanceof Error ? error.message : String(error);
    return fail(message, false);
  }
}
