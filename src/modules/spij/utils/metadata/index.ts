import { fechaCorta } from "../../../../utils/dates";
import { stripHtml } from "../../../../utils/text";
import { PORTAL_NORMA } from "../../constants";
import type { Area, Classif, Config, Doc, Metadata } from "../../types";
import type { NormaAnalisis } from "../../services/llm";

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

/**
 * Vigencia por defecto: el día siguiente al de publicación.
 *
 * Es la regla del artículo 109 de la Constitución ("La ley es obligatoria desde
 * el día siguiente de su publicación en el diario oficial, salvo disposición
 * contraria de la misma ley"). La excepción —la vacatio legis que la propia
 * norma fija— la extrae el LLM del cuerpo y PISA este default.
 *
 * Es un valor DERIVADO, no leído de la fuente: SPIJ no publica fecha de
 * vigencia (verificado el 2026-09-01 volcando la respuesta cruda del buscador y
 * la de `api/detallenorma`, ninguna la trae).
 */
export function diaSiguiente(iso: string | null): string | null {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  if (Number.isNaN(d.getTime())) return null;
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

export function buildMetadata(
  doc: Doc,
  clasif: Classif,
  area: Area,
  cfg: Config,
  analisis: NormaAnalisis
): Metadata {
  const dispositivo = doc.dispositivoLegal;
  const title = stripHtml(doc.title) || doc.code || doc.id || "";
  const published = doc.publishedAt || null;

  // Las keywords de la IA primero (son las que sirven para buscar), y detrás el
  // dispositivo y el sector, que son dato duro del buscador. Si la IA no
  // devuelve nada nos quedamos con esos dos, como antes: nunca vacío.
  const keywords = [
    ...new Set(
      [...analisis.keywords, dispositivo, doc.sector].filter(
        (k): k is string => Boolean(k && k.trim())
      )
    ),
  ];

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
    // Página pública del portal, no el endpoint interno de la API: es el enlace
    // con el que el abogado comprueba que la norma viene del MINJUS.
    source_url: `${PORTAL_NORMA}/${doc.id}`,
    status: cfg.ingestStatus!,
    version: 1,
    language: "es",
    published_at: published,
    effective_date: published,
    issued_at: analisis.issuedAt,
    effective_from: analisis.effectiveFrom ?? diaSiguiente(published),
    effective_to: null,
    citation: buildCitation(title, published),
    court_chamber: null,
    origin_district: null,
    keywords,
    concepts: analisis.concepts,
    references: analisis.references,
  };
  const entityId = clasif.entity_id;
  if (entityId) {
    meta.issuer_entity_ids = [String(entityId)];
  }
  return meta;
}
