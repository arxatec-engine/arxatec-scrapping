import axios from "axios";

const _URL = "https://api.groq.com/openai/v1/chat/completions";

/**
 * Mínimo de 10 en `keywords` y `concepts` (decisión del owner, 2026-09-01). El
 * techo va holgado por encima para no recortar lo que el modelo sí encuentre;
 * que se cumpla el mínimo se comprueba en el ledger, no se fuerza aquí.
 */
const _MIN_ITEMS = 10;
const _MAX_KEYWORDS = 20;
const _MAX_CONCEPTS = 20;
/**
 * `references` NO lleva mínimo, a propósito: son citas VERBATIM a normas que
 * existen, y exigir un piso hace que el modelo las invente con número y fecha.
 * Medido el 2026-09-01 sobre 3 documentos reales: 2 de 3 no citan ninguna norma
 * (una designa a un gerente, otra autoriza un viaje). Ver
 * docs/registro/2026-09-01/contrato-columnas-documents.md.
 */
const _MAX_REFERENCES = 20;
const _MAX_ITEM_LEN = 200;
/**
 * Se manda el CUERPO de la norma, no la sumilla. Antes llegaban 2000 caracteres
 * de un resumen de una línea (`textoParaClasificar` descartaba el HTML), y de
 * ahí no salían ni conceptos jurídicos ni fechas.
 */
const _MAX_TEXTO = 8000;

export interface NormaAnalisis {
  subId: string | null;
  keywords: string[];
  concepts: string[];
  references: string[];
  /** Fecha de emisión/firma (ISO) que aparece en el texto, o null. */
  issuedAt: string | null;
  /** Solo si el texto fija una vigencia distinta al día siguiente (vacatio legis). */
  effectiveFrom: string | null;
}

const EMPTY: NormaAnalisis = {
  subId: null,
  keywords: [],
  concepts: [],
  references: [],
  issuedAt: null,
  effectiveFrom: null,
};

type GroqChatResponse = {
  choices?: { message?: { content?: unknown } }[];
};

function cleanList(value: unknown, max: number): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const out: string[] = [];
  for (const item of value) {
    const s = String(item ?? "")
      .replace(/\s+/g, " ")
      .trim();
    if (s && s.length <= _MAX_ITEM_LEN) {
      out.push(s);
    }
  }
  return [...new Set(out)].slice(0, max);
}

/** Acepta solo `YYYY-MM-DD` real: el backend guarda un `date` y un texto libre lo rompe. */
export function isoOrNull(value: unknown): string | null {
  const s = String(value ?? "").trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return s;
}

function parseAnalisis(content: string): NormaAnalisis {
  let obj: unknown = null;
  try {
    obj = JSON.parse(content);
  } catch {
    const m = content.match(/\{[\s\S]*\}/);
    if (m) {
      try {
        obj = JSON.parse(m[0]);
      } catch {
        obj = null;
      }
    }
  }

  if (obj && typeof obj === "object" && !Array.isArray(obj)) {
    const o = obj as Record<string, unknown>;
    const rawId = o.id ?? o.subId ?? o.area_id;
    const subId = rawId != null ? String(rawId).trim() || null : null;
    return {
      subId,
      keywords: cleanList(o.keywords, _MAX_KEYWORDS),
      concepts: cleanList(o.concepts, _MAX_CONCEPTS),
      references: cleanList(o.references, _MAX_REFERENCES),
      issuedAt: isoOrNull(o.issued_at),
      effectiveFrom: isoOrNull(o.effective_from),
    };
  }

  return EMPTY;
}

/** El prompt, aparte, para poder probarlo sin gastar una llamada a ciegas. */
export function buildAnalisisPrompt(texto: string, opciones: string): string {
  return (
    "Eres un analista de normas legales peruanas. A partir del TEXTO de la " +
    "norma devuelve seis cosas:\n\n" +
    "1) id: UNA subárea del catálogo, elegida por la MATERIA de la norma (de " +
    "qué trata), no por quién la emite. El id tiene que ser EXACTAMENTE uno de " +
    "los del catálogo de abajo, copiado tal cual.\n\n" +
    `2) keywords: al menos ${_MIN_ITEMS} términos de búsqueda que un abogado ` +
    "escribiría para encontrar esta norma. Incluye sinónimos y la forma " +
    "coloquial además de la técnica (por ejemplo \"despido sin preaviso\" " +
    "junto a \"extinción de la relación laboral\"). En minúsculas.\n\n" +
    `3) concepts: al menos ${_MIN_ITEMS} conceptos JURÍDICOS sustantivos: ` +
    "instituciones, derechos, obligaciones, supuestos de hecho y consecuencias " +
    "que regula la norma. En minúsculas.\n" +
    "PROHIBIDO devolver palabras de trámite o de forma: \"artículo\", " +
    "\"resolución\", \"normativa\", \"regulación\", \"sector\", " +
    "\"modificación\", \"disposición\", \"entidad\", ni el nombre del emisor. " +
    "Si el documento es un acto administrativo menor (designar a un " +
    "funcionario, autorizar un viaje), devuelve los conceptos de la MATERIA que " +
    "toca (por ejemplo \"designación de funcionario\", \"encargo de " +
    "funciones\", \"régimen laboral público\").\n\n" +
    "4) references: las normas citadas en el texto (leyes, decretos, " +
    "ordenanzas, resoluciones con su número), TAL COMO APARECEN, verbatim. " +
    "Si la norma no cita ninguna, devuelve []. NO INVENTES NINGUNA: una cita " +
    "falsa es peor que una lista vacía.\n\n" +
    "5) issued_at: la fecha de EMISIÓN o firma de la norma en formato " +
    "YYYY-MM-DD (suele ir al principio o al final: \"Lima, 12 de marzo de " +
    "2024\", \"Dado en la Casa de Gobierno, a los doce días...\"). Puede venir " +
    "escrita en letras. Si no aparece, null.\n\n" +
    "6) effective_from: SOLO si el texto fija expresamente cuándo entra en " +
    "vigencia (\"entrará en vigencia el...\", \"a los treinta días de su " +
    "publicación\"), en YYYY-MM-DD. Si no lo dice, null.\n\n" +
    `CATALOGO (id<TAB>area > subárea):\n${opciones}\n\n` +
    `NORMA:\n${texto.slice(0, _MAX_TEXTO)}\n\n` +
    "Responde SOLO con un objeto JSON válido, sin texto extra:\n" +
    '{"id":"<id del catalogo>","keywords":["..."],"concepts":["..."],' +
    '"references":["..."],"issued_at":null,"effective_from":null}'
  );
}

/**
 * Una sola llamada a Groq que clasifica la norma y extrae de su CUERPO todo lo
 * que el contrato de ingesta necesita y no viene en el buscador: keywords,
 * conceptos, referencias citadas, fecha de emisión y vacatio legis.
 *
 * Ante cualquier fallo devuelve un análisis vacío, nunca lanza — pero lo REGISTRA
 * (ver el catch): el `catch {}` vacío que había aquí escondió durante semanas que
 * Groq devolvía 400 en ráfaga y todo el corpus caía al área por defecto.
 */
export async function analizarNorma(
  texto: string,
  opciones: string
): Promise<NormaAnalisis> {
  const key = process.env.GROQ_API_KEY;
  if (!key || !texto) {
    return EMPTY;
  }
  // `reasoning_effort: "low"` no es opcional: sin él el razonamiento se come el
  // presupuesto de `max_tokens` y Groq responde 400 "Failed to validate JSON".
  // Ver docs/registro/2026-08-15/cambio-modelos-groq.md.
  const model = process.env.LLM_MODEL || "openai/gpt-oss-20b";
  const prompt = buildAnalisisPrompt(texto, opciones);

  const payload = {
    model,
    messages: [{ role: "user", content: prompt }],
    temperature: 0,
    // Subido de 1200: ahora se piden 10 keywords + 10 conceptos + referencias
    // + dos fechas, y con 1200 la respuesta se truncaba a medio JSON.
    max_tokens: 6000,
    reasoning_effort: "low",
    response_format: { type: "json_object" },
  };

  try {
    const r = await axios.post(_URL, payload, {
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0 (compatible; arxatec-scraper/1.0)",
      },
      timeout: 60_000,
    });
    const data = r.data as GroqChatResponse;
    const content = data.choices?.[0]?.message?.content;
    if (content == null) {
      throw new Error("respuesta sin choices[0].message.content");
    }
    return parseAnalisis(String(content));
  } catch (e: unknown) {
    const axiosError = axios.isAxiosError(e) ? e : null;
    const status = axiosError?.response?.status;
    const apiMessage = (
      axiosError?.response?.data as { error?: { message?: unknown } } | undefined
    )?.error?.message;
    const detalle = String(
      apiMessage ?? (e instanceof Error ? e.message : e)
    ).slice(0, 160);
    console.warn(
      `[llm] análisis fallido (${status ?? "sin status"}): ${detalle}`
    );
    return EMPTY;
  }
}

/**
 * Fallback de entidad emisora: cuando el classifier determinista queda
 * unmatched, Groq elige entre una lista corta de candidatos del catálogo.
 * El id devuelto se valida contra los candidatos — la IA nunca puede meter una
 * entidad que no exista en entity.json. Ante cualquier fallo devuelve null
 * (el documento queda unmatched, como antes), nunca lanza.
 *
 * OJO: elperuano y gobpe importan ESTA función desde aquí.
 */
export async function elegirEntidad(
  sector: string,
  candidatos: Array<{ id: string; name: string }>
): Promise<string | null> {
  const key = process.env.GROQ_API_KEY;
  if (!key || !sector.trim() || candidatos.length === 0) {
    return null;
  }
  const model = process.env.LLM_MODEL || "openai/gpt-oss-20b";
  const lista = candidatos.map((c) => `${c.id}\t${c.name}`).join("\n");
  const prompt =
    "El SECTOR es el texto libre con que el SPIJ identifica al emisor de una " +
    "norma legal peruana. Elige de la lista de ENTIDADES candidatas la que " +
    "corresponde a ese emisor.\n\n" +
    `SECTOR: ${sector.slice(0, 300)}\n\n` +
    `ENTIDADES (id<TAB>nombre):\n${lista}\n\n` +
    "Responde SOLO con un objeto JSON válido, sin texto extra: " +
    '{"id":"<id elegido>"} o {"id":null} si ninguna corresponde.';

  const payload = {
    model,
    messages: [{ role: "user", content: prompt }],
    temperature: 0,
    max_tokens: 600,
    reasoning_effort: "low",
    response_format: { type: "json_object" },
  };

  try {
    const r = await axios.post(_URL, payload, {
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0 (compatible; arxatec-scraper/1.0)",
      },
      timeout: 30_000,
    });
    const data = r.data as GroqChatResponse;
    const content = String(data.choices?.[0]?.message?.content ?? "");
    const obj = JSON.parse(content) as { id?: unknown };
    const id = obj.id != null ? String(obj.id).trim() : "";
    return id && candidatos.some((c) => c.id === id) ? id : null;
  } catch {
    return null;
  }
}

export { _MIN_ITEMS as MIN_ITEMS };
