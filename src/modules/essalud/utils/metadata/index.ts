import { fechaCorta } from "../../../../utils/dates";
import { GOBPE_BASE } from "../../constants";
import type { Area, Classif, Config, Doc, Metadata } from "../../types";

/** "Resolución 1011-PE-ESSALUD-2026, ESSALUD, 03-ago-2026". */
function buildCitation(doc: Doc): string {
  const fecha = fechaCorta(doc.publishedAt);
  return `Resolución ${doc.numero}, ESSALUD${fecha ? `, ${fecha}` : ""}`;
}

export function buildMetadata(
  doc: Doc,
  issuer: Classif,
  area: Area,
  cfg: Config,
  concepts: string[] = [],
  references: string[] = []
): Metadata {
  const title = doc.sumilla || `Resolución ${doc.numero} (ESSALUD)`;

  const meta: Metadata = {
    country: cfg.ingestCountry,
    // ESSALUD no es un tribunal: son resoluciones administrativas de la
    // entidad → normativa (mismo trato que los reguladores).
    type: "normative",
    title,
    document_number: doc.numero,
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
    court_chamber: null,
    origin_district: null,
    keywords: ["ESSALUD", "Seguro Social de Salud", doc.numero],
    concepts,
    references,
  };
  if (issuer.entity_id) {
    meta.issuer_entity_ids = [String(issuer.entity_id)];
  }
  return meta;
}
