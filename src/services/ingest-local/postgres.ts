import { Pool } from "pg";

import type { ResolvedMetadata } from "./types";

/** Entidad legal ya resuelta contra PostgreSQL (con su grupo y subgrupo). */
export interface ResolvedEntity {
  entityId: string;
  name: string;
  normalizedName: string;
  searchKey: string;
  acronym: string | null;
  groupId: string | null;
  groupName: string | null;
  subgroupId: string | null;
  subgroupName: string | null;
}

/** Vínculo documento→entidad con su rol (issuer, court, cited_entity, …). */
export interface EntityLink {
  entityId: string;
  role: string;
}

export interface SaveResult {
  linkedEntities: number;
  linkedRelations: number;
}

let pool: Pool | null = null;

/**
 * Pool compartido por proceso. El assistant usa 5+10 por proceso; aquí se deja
 * bajo a propósito: con 8 módulos corriendo a la vez, un pool grande por módulo
 * agota el `max_connections` del servidor.
 */
export function getPool(databaseUrl: string): Pool {
  if (pool === null) {
    pool = new Pool({ connectionString: databaseUrl, max: 4, idleTimeoutMillis: 30_000 });
  }
  return pool;
}

export async function closePool(): Promise<void> {
  if (pool !== null) {
    await pool.end();
    pool = null;
  }
}

/** Port de `fetch_legal_entities_by_ids`: resuelve entidades con grupo y subgrupo. */
export async function fetchEntities(
  databaseUrl: string,
  entityIds: string[]
): Promise<Map<string, ResolvedEntity>> {
  const resolved = new Map<string, ResolvedEntity>();
  if (entityIds.length === 0) return resolved;

  const { rows } = await getPool(databaseUrl).query(
    `SELECT e.entity_id, e.name, e.normalized_name, e.search_key, e.acronym,
            e.group_id, g.name AS group_name,
            e.subgroup_id, s.name AS subgroup_name
       FROM legal_entities e
       LEFT JOIN legal_entity_groups g ON g.group_id = e.group_id
       LEFT JOIN legal_entity_subgroups s ON s.subgroup_id = e.subgroup_id
      WHERE e.entity_id = ANY($1::uuid[])`,
    [entityIds]
  );

  for (const row of rows) {
    resolved.set(String(row.entity_id), {
      entityId: String(row.entity_id),
      name: row.name,
      normalizedName: row.normalized_name,
      searchKey: row.search_key,
      acronym: row.acronym,
      groupId: row.group_id ? String(row.group_id) : null,
      groupName: row.group_name ?? null,
      subgroupId: row.subgroup_id ? String(row.subgroup_id) : null,
      subgroupName: row.subgroup_name ?? null,
    });
  }

  return resolved;
}

/**
 * Port de `save_document_to_postgres`: upsert del documento y reemplazo de sus
 * vínculos con entidades. Todo en una transacción, como el original.
 *
 * Las relaciones entre documentos (`document_relations`) no se escriben todavía:
 * ningún módulo del scraper las envía hoy (ver `Metadata`, que no tiene campo
 * `relations`). Queda anotado como deuda para cuando alguno las produzca.
 */
export async function saveDocument(
  databaseUrl: string,
  metadata: ResolvedMetadata,
  links: EntityLink[]
): Promise<SaveResult> {
  const client = await getPool(databaseUrl).connect();

  try {
    await client.query("BEGIN");

    await client.query(
      // ⚠️ La columna se llama `type`, no `document_type`: el modelo de
      // SQLAlchemy expone `document_type` pero mapea a `type` en la tabla.
      // Verificado contra information_schema el 2026-08-07.
      `INSERT INTO documents (
         document_id, country, type, title, normalized_title,
         document_number, citation, court_chamber, origin_district,
         legal_area_id, legal_subarea_id, jurisdiction, legal_area, subarea,
         source, source_url, status, version, effective_date, issued_at,
         published_at, effective_from, effective_to, language, s3_key,
         keywords, concepts, "references", created_at, updated_at
       ) VALUES (
         $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,
         $20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30
       )
       ON CONFLICT (document_id) DO UPDATE SET
         country = EXCLUDED.country,
         type = EXCLUDED.type,
         title = EXCLUDED.title,
         normalized_title = EXCLUDED.normalized_title,
         document_number = EXCLUDED.document_number,
         citation = EXCLUDED.citation,
         court_chamber = EXCLUDED.court_chamber,
         origin_district = EXCLUDED.origin_district,
         legal_area_id = EXCLUDED.legal_area_id,
         legal_subarea_id = EXCLUDED.legal_subarea_id,
         jurisdiction = EXCLUDED.jurisdiction,
         legal_area = EXCLUDED.legal_area,
         subarea = EXCLUDED.subarea,
         source = EXCLUDED.source,
         source_url = EXCLUDED.source_url,
         status = EXCLUDED.status,
         version = EXCLUDED.version,
         effective_date = EXCLUDED.effective_date,
         issued_at = EXCLUDED.issued_at,
         published_at = EXCLUDED.published_at,
         language = EXCLUDED.language,
         s3_key = EXCLUDED.s3_key,
         keywords = EXCLUDED.keywords,
         concepts = EXCLUDED.concepts,
         "references" = EXCLUDED."references",
         updated_at = EXCLUDED.updated_at`,
      [
        metadata.document_id,
        metadata.country.toUpperCase(),
        metadata.type,
        metadata.title,
        metadata.normalized_title,
        metadata.document_number,
        metadata.citation ?? null,
        metadata.court_chamber ?? null,
        metadata.origin_district ?? null,
        metadata.legal_area_id,
        metadata.legal_subarea_id,
        metadata.jurisdiction,
        metadata.legal_area,
        metadata.subarea,
        metadata.source,
        metadata.source_url,
        metadata.status,
        metadata.version,
        metadata.resolved_effective_date,
        metadata.issued_at ?? null,
        metadata.published_at ?? null,
        null,
        null,
        metadata.language,
        metadata.key,
        // keywords/concepts/references son JSONB, no arrays de Postgres: hay
        // que serializarlos, o node-pg los manda como `{a,b}` y el servidor
        // responde "invalid input syntax for type json".
        JSON.stringify(metadata.keywords),
        JSON.stringify(metadata.concepts),
        JSON.stringify(metadata.references),
        metadata.created_at,
        metadata.updated_at,
      ]
    );

    await client.query(
      "DELETE FROM legal_document_entities WHERE document_id = $1",
      [metadata.document_id]
    );

    const unique = new Map(links.map((l) => [`${l.entityId}|${l.role}`, l]));

    for (const link of unique.values()) {
      // created_at/updated_at son NOT NULL sin default en la tabla: en Python
      // los rellena SQLAlchemy, aquí hay que ponerlos a mano.
      await client.query(
        `INSERT INTO legal_document_entities
           (document_id, entity_id, role, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $4)
         ON CONFLICT DO NOTHING`,
        [metadata.document_id, link.entityId, link.role, metadata.updated_at]
      );
    }

    await client.query("COMMIT");

    return { linkedEntities: unique.size, linkedRelations: 0 };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
