import { fechaCorta } from "../../../../utils/dates";
import { GOBPE_BASE } from "../../constants";
import type { Area, Classif, Config, Doc, Metadata } from "../../types";

import { SIGLA } from "../../constants";

/** "Resolución 152-2026-OS/CD, OSITRAN, 24-jul-2026" (la sigla hace legible la
 * cita; el `source` persiste el nombre canónico completo). */
function buildCitation(doc: Doc): string {
  const fecha = fechaCorta(doc.publishedAt);
  const prefijo = /^\d/.test(doc.numero) ? "Resolución " : "";
  return `${prefijo}${doc.numero}, ${SIGLA}${fecha ? `, ${fecha}` : ""}`;
}

export function buildMetadata(
  doc: Doc,
  issuer: Classif,
  area: Area,
  cfg: Config,
  concepts: string[] = [],
  references: string[] = []
): Metadata {
  const title = doc.sumilla || `${doc.numero} (${SIGLA})`;

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
    keywords: [SIGLA, doc.numero],
    concepts,
    references,
  };
  if (issuer.entity_id) {
    meta.issuer_entity_ids = [String(issuer.entity_id)];
  }
  return meta;
}
