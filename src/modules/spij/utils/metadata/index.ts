import { stripHtml } from "../../../../utils/text";
import type { Area, Classif, Config, Doc, Metadata } from "../../types";

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
