import { fechaCorta } from "../../../../utils/dates";
import { stripHtml } from "../../../../utils/text";
import { dispositivoUrl } from "../../constants";
import type { Area, Classif, Config, Doc, Metadata } from "../../types";
import type { LegalDocumentType } from "../../../../types";

/**
 * El cuadernillo de Normas Legales trae de todo; el grueso son normas y actos
 * con rango normativo, así que el default es `normative` (coherente con SPIJ,
 * que ingesta las resoluciones igual). Solo las sentencias/casaciones que El
 * Peruano publica (p.ej. del TC o la Corte Suprema) van como `jurisprudence`.
 */
export function tipoFromDispositivo(dispositivo: string): LegalDocumentType {
  return /SENTENCIA|CASACI/i.test(dispositivo) ? "jurisprudence" : "normative";
}

/** Cita de normativa, patrón SPIJ: el título legal + fecha de publicación. */
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
  const title = stripHtml(doc.sumilla) || `${doc.dispositivo} ${doc.numero ?? doc.op}`;
  const published = doc.publishedAt;

  const meta: Metadata = {
    country: cfg.ingestCountry,
    type: tipoFromDispositivo(doc.dispositivo),
    title,
    document_number: doc.numero,
    jurisdiction: cfg.ingestCountry,
    legal_area: area.legal_area,
    subarea: area.subarea,
    legal_area_id: area.legal_area_id,
    legal_subarea_id: area.legal_subarea_id,
    source: cfg.ingestSource,
    source_url: dispositivoUrl(doc.op),
    status: cfg.ingestStatus,
    version: 1,
    language: "es",
    published_at: published,
    effective_date: published,
    citation: buildCitation(title, published),
    court_chamber: null,
    origin_district: null,
    keywords: [doc.dispositivo, doc.entidad, doc.numero].filter(
      (k): k is string => Boolean(k)
    ),
    concepts,
    references,
  };
  if (clasif.entity_id) {
    meta.issuer_entity_ids = [String(clasif.entity_id)];
  }
  return meta;
}
