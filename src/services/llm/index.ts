import axios from "axios";

const _URL = "https://api.groq.com/openai/v1/chat/completions";

const _MAX_CONCEPTS = 8;
const _MAX_REFERENCES = 12;
const _MAX_ITEM_LEN = 200;

export interface NormaAnalisis {
  subId: string | null;
  concepts: string[];
  references: string[];
}

const EMPTY: NormaAnalisis = { subId: null, concepts: [], references: [] };

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
      concepts: cleanList(o.concepts, _MAX_CONCEPTS),
      references: cleanList(o.references, _MAX_REFERENCES),
    };
  }

  // Fallback: si no vino JSON, tomamos el primer token como id (comportamiento previo).
  const first = content.trim().split(/\s+/).filter(Boolean)[0];
  return { subId: first ?? null, concepts: [], references: [] };
}

/**
 * Una sola llamada a Groq que clasifica un documento legal (subárea del
 * catálogo) y, de paso, extrae `concepts` (materias/temas) y `references`
 * (normas citadas). Genérica: la usan todos los módulos (spij, tc, ...). Ante
 * cualquier fallo devuelve un análisis vacío (el área cae a la por defecto),
 * nunca lanza.
 */
export async function analizarNorma(
  texto: string,
  opciones: string
): Promise<NormaAnalisis> {
  const key = process.env.GROQ_API_KEY;
  if (!key || !texto) {
    return EMPTY;
  }
  // Default estable: llama-3.1-8b-instant se apaga el 2026-08-16, y los modelos
  // de razonamiento (gpt-oss) fallan a menudo con response_format json_object.
  const model = process.env.LLM_MODEL || "llama-3.3-70b-versatile";
  const prompt =
    "Eres un analista de normas legales peruanas. A partir del TEXTO de la " +
    "norma haz tres cosas:\n" +
    "1) Clasifícala en UNA subárea del catálogo según su MATERIA (de qué " +
    "trata), no según quién la emite.\n" +
    "2) Extrae hasta 8 CONCEPTOS jurídicos clave (materias/temas), en " +
    "minúsculas y sin duplicar.\n" +
    "3) Extrae las REFERENCIAS a otras normas citadas en el texto (leyes, " +
    "decretos, ordenanzas, resoluciones con su número), tal como aparecen.\n\n" +
    `CATALOGO (id<TAB>area > subárea):\n${opciones}\n\n` +
    `NORMA:\n${texto.slice(0, 2000)}\n\n` +
    "Responde SOLO con un objeto JSON válido, sin texto extra, con esta forma " +
    'exacta:\n{"id":"<id del catalogo>","concepts":["..."],"references":["..."]}';

  const payload = {
    model,
    messages: [{ role: "user", content: prompt }],
    temperature: 0,
    max_tokens: 500,
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
    const data: any = r.data;
    const content = String(data.choices[0].message.content ?? "");
    return parseAnalisis(content);
  } catch (e: any) {
    // Este catch estaba vacío, y eso escondía un fallo caro: el 2026-08-07 se
    // descubrió que Groq devolvía 400 "Failed to generate JSON" en ráfaga con
    // un modelo de razonamiento, así que TODOS los documentos se ingerían con
    // el área legal por defecto. En el ledger solo se veía "la IA no clasificó
    // la subárea", que suena a duda del modelo y no a una API rechazando.
    const status = e?.response?.status;
    const detalle = String(
      e?.response?.data?.error?.message ?? e?.message ?? e
    ).slice(0, 160);
    console.warn(
      `[llm] clasificación fallida (${status ?? "sin status"}): ${detalle}`
    );
    return EMPTY;
  }
}
