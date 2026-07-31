import { fechaCorta } from "../../../../utils/dates";
import { stripHtml } from "../../../../utils/text";
import { GOBPE_BASE } from "../../constants";
import type { Area, Classif, Config, Doc, Metadata } from "../../types";
import type { LegalDocumentType } from "../../../../types";

/**
 * Normas generales del Estado: default `normative`; las sentencias/casaciones
 * que algún emisor publique van como `jurisprudence` (patrón elperuano).
 */
export function tipoDe(doc: Doc): LegalDocumentType {
  return /SENTENCIA|CASACI/i.test(`${doc.numero} ${doc.sumilla}`)
    ? "jurisprudence"
    : "normative";
}

/** Cita de normativa (patrón SPIJ/elperuano): el título legal + la fecha. */
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
  const title = stripHtml(doc.sumilla) || `${doc.numero} (${doc.entidadLabel})`;

  const meta: Metadata = {
    country: cfg.ingestCountry,
    type: tipoDe(doc),
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
    citation: buildCitation(title, doc.publishedAt),
    court_chamber: null,
    origin_district: null,
    keywords: [doc.numero, doc.entidadLabel].filter(Boolean),
    concepts,
    references,
  };
  if (clasif.entity_id) {
    meta.issuer_entity_ids = [String(clasif.entity_id)];
  }
  return meta;
}
