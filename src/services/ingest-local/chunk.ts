import { createHash } from "node:crypto";

import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";

import type { Chunk, Page, ResolvedMetadata } from "./types";
import type { ResolvedEntity, EntityLink } from "./postgres";

// Mismos valores que el assistant (ingest/service.py). Verificado el 2026-08-07:
// con este troceador y estos parámetros, JS y Python producen chunks IDÉNTICOS
// carácter a carácter sobre el mismo texto de entrada (19/19 en la prueba).
const CHUNK_SIZE = 1800;
const CHUNK_OVERLAP = 250;

/** `date` de Python → timestamp UTC a medianoche, como `_date_to_timestamp`. */
export function dateToTimestamp(value: string | null | undefined): number | null {
  if (!value) return null;

  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  if (!year || !month || !day) return null;

  return Math.floor(Date.UTC(year, month - 1, day) / 1000);
}

/**
 * Cabecera que se antepone a CADA chunk — port de `_build_chunk_header`.
 *
 * La cita y la fecha van en cada chunk a propósito: son la señal semántica que
 * permite recuperar el documento cuando el usuario pega su referencia. URL y
 * document_id NO van al texto.
 */
export function buildChunkHeader(
  metadata: ResolvedMetadata,
  issuerName: string | null
): string {
  const rows = [`Tipo: ${metadata.type}`, `Título: ${metadata.title}`];

  if (metadata.citation) rows.push(`Cita: ${metadata.citation}`);
  if (metadata.document_number) rows.push(`Número: ${metadata.document_number}`);

  const headerDate = metadata.issued_at || metadata.resolved_effective_date;
  if (headerDate) rows.push(`Fecha: ${headerDate.slice(0, 10)}`);

  if (issuerName) rows.push(`Entidad emisora: ${issuerName}`);
  if (metadata.court_chamber) rows.push(`Sala: ${metadata.court_chamber}`);
  if (metadata.origin_district) rows.push(`Procedencia: ${metadata.origin_district}`);

  rows.push(`Área legal: ${metadata.legal_area}`);
  if (metadata.subarea) rows.push(`Subárea legal: ${metadata.subarea}`);

  return rows.join("\n");
}

function dedupe(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function idsByRole(
  links: EntityLink[],
  resolved: Map<string, ResolvedEntity>,
  role: string
): string[] {
  return dedupe(
    links.filter((l) => l.role === role && resolved.has(l.entityId)).map((l) => l.entityId)
  );
}

/** Payload de entidades + filtros planos — port de `_build_entities_payload`
 *  y `_build_flat_entity_filters`. */
function buildEntityPayload(
  links: EntityLink[],
  resolved: Map<string, ResolvedEntity>
): Record<string, unknown> {
  const entities = links
    .map((link) => {
      const entity = resolved.get(link.entityId);
      if (!entity) return null;
      return {
        id: entity.entityId,
        name: entity.name,
        normalized_name: entity.normalizedName,
        search_key: entity.searchKey,
        acronym: entity.acronym,
        role: link.role,
        group_id: entity.groupId,
        group_name: entity.groupName,
        subgroup_id: entity.subgroupId,
        subgroup_name: entity.subgroupName,
      };
    })
    .filter((e): e is NonNullable<typeof e> => e !== null);

  const present = links
    .filter((l) => resolved.has(l.entityId))
    .map((l) => resolved.get(l.entityId) as ResolvedEntity);

  return {
    entities,
    entity_ids: dedupe(present.map((e) => e.entityId)),
    entity_group_ids: dedupe(present.map((e) => e.groupId ?? "")),
    entity_subgroup_ids: dedupe(present.map((e) => e.subgroupId ?? "")),
    issuer_entity_ids: idsByRole(links, resolved, "issuer"),
    court_entity_ids: idsByRole(links, resolved, "court"),
    cited_entity_ids: idsByRole(links, resolved, "cited_entity"),
    affected_entity_ids: idsByRole(links, resolved, "affected_entity"),
  };
}

/** Payload completo de un chunk — port de `_build_qdrant_metadata`. */
export function buildChunkMetadata(
  metadata: ResolvedMetadata,
  chunkIndex: number,
  pageNumber: number,
  contentHash: string,
  links: EntityLink[],
  resolved: Map<string, ResolvedEntity>
): Record<string, unknown> {
  return {
    document_id: metadata.document_id,
    chunk_index: chunkIndex,
    page: pageNumber,
    content_hash: contentHash,
    country: metadata.country.toUpperCase(),
    type: metadata.type,
    title: metadata.title,
    normalized_title: metadata.normalized_title,
    document_number: metadata.document_number,
    citation: metadata.citation ?? null,
    court_chamber: metadata.court_chamber ?? null,
    origin_district: metadata.origin_district ?? null,
    legal_area_id: metadata.legal_area_id,
    legal_subarea_id: metadata.legal_subarea_id,
    jurisdiction: metadata.jurisdiction,
    legal_area: metadata.legal_area,
    subarea: metadata.subarea,
    source: metadata.source,
    source_url: metadata.source_url,
    status: metadata.status,
    version: metadata.version,
    effective_date: dateToTimestamp(metadata.resolved_effective_date),
    issued_at: dateToTimestamp(metadata.issued_at),
    published_at: dateToTimestamp(metadata.published_at),
    effective_from: null,
    effective_to: null,
    language: metadata.language,
    s3_key: metadata.key,
    keywords: metadata.keywords,
    concepts: metadata.concepts,
    references: metadata.references,
    ...buildEntityPayload(links, resolved),
    created_at: Math.floor(metadata.created_at.getTime() / 1000),
    updated_at: Math.floor(metadata.updated_at.getTime() / 1000),
  };
}

/**
 * Trocea el documento — port de `_build_documents` (rama no-código).
 *
 * Se trocea el TEXTO de la página y el header se antepone a CADA chunk: si se
 * concatenara antes de trocear, solo el primer chunk de cada página conservaría
 * su identidad textual.
 */
export async function buildChunks(
  metadata: ResolvedMetadata,
  pages: Page[],
  links: EntityLink[],
  resolved: Map<string, ResolvedEntity>,
  issuerName: string | null
): Promise<Chunk[]> {
  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: CHUNK_SIZE,
    chunkOverlap: CHUNK_OVERLAP,
  });

  const header = buildChunkHeader(metadata, issuerName);
  const chunks: Chunk[] = [];
  let chunkIndex = 0;

  for (const { page, text } of pages) {
    for (const piece of await splitter.splitText(text)) {
      const sourceText = [header, "---", `[PAGE ${page}]`, piece].join("\n\n");
      const contentHash = createHash("sha256").update(sourceText, "utf8").digest("hex");

      chunks.push({
        text: sourceText,
        metadata: buildChunkMetadata(
          metadata,
          chunkIndex,
          page,
          contentHash,
          links,
          resolved
        ),
      });

      chunkIndex += 1;
    }
  }

  return chunks;
}
