import { fechaCorta } from "../../../../utils/dates";
import { stripHtml } from "../../../../utils/text";
import type { Area, Classif, Config, Doc, Metadata } from "../../types";

/**
 * Cita de normativa: el título legal ES la cita ("Ley N.° 30225 - ...");
 * se añade la fecha de publicación legible cuando existe. Sala/distrito no
 * aplican a normativa (quedan null).
 */
function buildCitation(title: string, published: string | null): string | null {
  if (!title) return null;
  const fecha = fechaCorta(published);
  return fecha ? `${title}, ${fecha}` : title;
}

export function buildMetadata(
  doc: Doc,
  clasif: Classif,
  area: Area,
  cfg: Config,
  concepts: string[] = [],
  references: string[] = []
): Metadata {
  const dispositivo = doc.dispositivoLegal;
  const title = stripHtml(doc.title) || doc.code || doc.id || "";
  const published = doc.publishedAt || null;

  const meta: Metadata = {
    country: cfg.ingestCountry!,
    type: cfg.tipoNorma === "NR" ? "normative" : "jurisprudence",
    title,
    document_number: doc.code || null,
    jurisdiction: cfg.ingestCountry!,

    legal_area: area.legal_area,
    subarea: area.subarea,
    legal_area_id: area.legal_area_id,
    legal_subarea_id: area.legal_subarea_id,
    source: cfg.ingestSource!,
    source_url: `${cfg.urlWord}/${doc.id}`,
    status: cfg.ingestStatus!,
    version: 1,
    language: "es",
    published_at: published,
    effective_date: published,
    citation: buildCitation(title, published),
    court_chamber: null,
    origin_district: null,
    keywords: [dispositivo, doc.sector].filter((k): k is string => Boolean(k)),
    concepts,
    references,
  };
  const entityId = clasif.entity_id;
  if (entityId) {
    meta.issuer_entity_ids = [String(entityId)];
  }
  return meta;
}
