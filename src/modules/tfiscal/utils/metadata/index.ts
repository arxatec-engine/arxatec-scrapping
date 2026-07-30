import { fechaCorta } from "../../../../utils/dates";
import { GOBPE_BASE } from "../../constants";
import { salaFromRtf } from "../parse";
import type { Area, Classif, Config, Doc, Metadata } from "../../types";

/**
 * Cita de jurisprudencia administrativa, patrón PJ: número + órgano + fecha.
 * "RTF 01380-1-2006, Tribunal Fiscal, 15-mar-2006".
 */
function buildCitation(doc: Doc): string {
  const fecha = fechaCorta(doc.publishedAt);
  return `RTF ${doc.rtf}, Tribunal Fiscal${fecha ? `, ${fecha}` : ""}`;
}

export function buildMetadata(
  doc: Doc,
  issuer: Classif,
  area: Area,
  cfg: Config,
  concepts: string[] = [],
  references: string[] = []
): Metadata {
  const title = doc.sumilla || `RTF ${doc.rtf}`;

  const meta: Metadata = {
    country: cfg.ingestCountry,
    // RTF = jurisprudencia administrativa: mismo trato que PJ/TC para que la
    // biblioteca y el chat la filtren junto al resto de jurisprudencia.
    type: "jurisprudence",
    title,
    document_number: doc.rtf,
    jurisdiction: cfg.ingestCountry,
    legal_area: area.legal_area,
    subarea: area.subarea,
    legal_area_id: area.legal_area_id,
    legal_subarea_id: area.legal_subarea_id,
    source: cfg.ingestSource,
    source_url: `${GOBPE_BASE}${doc.path}`,
    status: cfg.ingestStatus,
    version: 1,
    language: "es",
    published_at: doc.publishedAt,
    effective_date: doc.publishedAt,
    citation: buildCitation(doc),
    court_chamber: salaFromRtf(doc.rtf),
    origin_district: null,
    keywords: ["Resolución del Tribunal Fiscal", doc.rtf],
    concepts,
    references,
  };
  if (issuer.entity_id) {
    meta.issuer_entity_ids = [String(issuer.entity_id)];
  }
  return meta;
}
