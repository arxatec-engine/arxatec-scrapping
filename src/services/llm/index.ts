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
  const model = process.env.LLM_MODEL || "llama-3.1-8b-instant";
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
  } catch {
    return EMPTY;
  }
}
