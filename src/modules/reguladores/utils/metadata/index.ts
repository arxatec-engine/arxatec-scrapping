import { fechaCorta } from "../../../../utils/dates";
import { GOBPE_BASE } from "../../constants";
import type { Area, Config, Doc, Metadata, ReguladorCtx } from "../../types";

/** "Resolución 152-2026-OS/CD, OSINERGMIN, 24-jul-2026". */
function buildCitation(doc: Doc, sigla: string): string {
  const fecha = fechaCorta(doc.publishedAt);
  const prefijo = /^\d/.test(doc.numero) ? "Resolución " : "";
  return `${prefijo}${doc.numero}, ${sigla}${fecha ? `, ${fecha}` : ""}`;
}

export function buildMetadata(
  doc: Doc,
  reg: ReguladorCtx,
  area: Area,
  cfg: Config,
  concepts: string[] = [],
  references: string[] = []
): Metadata {
  const title = doc.sumilla || `${doc.numero} (${reg.sigla})`;

  const meta: Metadata = {
    country: cfg.ingestCountry,
    // Normativa del regulador (reglamentos, tarifas, resoluciones de CD):
    // `normative`, coherente con SPIJ/El Peruano.
    type: "normative",
    title,
    document_number: doc.numero,
    jurisdiction: cfg.ingestCountry,
    legal_area: area.legal_area,
    subarea: area.subarea,
    legal_area_id: area.legal_area_id,
    legal_subarea_id: area.legal_subarea_id,
    source: reg.source,
    source_url: `${GOBPE_BASE}${doc.path}`,
    status: cfg.ingestStatus,
    version: 1,
    language: "es",
    published_at: doc.publishedAt,
    effective_date: doc.publishedAt,
    citation: buildCitation(doc, reg.sigla),
    court_chamber: null,
    origin_district: null,
    keywords: [reg.sigla, doc.numero],
    concepts,
    references,
  };
  if (reg.issuer.entity_id) {
    meta.issuer_entity_ids = [String(reg.issuer.entity_id)];
  }
  return meta;
}
