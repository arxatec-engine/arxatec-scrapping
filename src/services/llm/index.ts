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
 * Modelo por defecto. ⚠ `llama-3.1-8b-instant` (el anterior) lo APAGA Groq el
 * **2026-08-16**: a partir de esa fecha devolvía HTTP 400 y, como aquí se
 * captura todo, el área habría caído SILENCIOSAMENTE al default en cada
 * documento. Sustituto verificado el 2026-08-04 (clasifica igual o mejor:
 * acertó "Parte general" donde llama decía "Delitos contra la administración
 * pública"). Se puede fijar otro con LLM_MODEL.
 *
 * OJO: los `gpt-oss` emiten razonamiento que consume `max_tokens`; con los 500
 * de antes Groq respondía 400 "Failed to generate JSON". Por eso 2000.
 */
export const DEFAULT_LLM_MODEL = "openai/gpt-oss-20b";

/** Holgura para el razonamiento de los modelos que lo emiten (ver arriba). */
const _MAX_TOKENS = 2000;

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
  const model = process.env.LLM_MODEL || DEFAULT_LLM_MODEL;
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
    max_tokens: _MAX_TOKENS,
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
  } catch (e) {
    // NO se silencia: un fallo del LLM degrada el área al default en TODOS los
    // documentos, y sin este aviso es invisible hasta que alguien nota que todo
    // quedó clasificado igual (es lo que habría pasado el 2026-08-16 con el
    // modelo apagado). Sigue sin lanzar: el documento se ingesta igual.
    warnLlm(model, e);
    return EMPTY;
  }
}

/** Cuántos avisos de fallo del LLM van, para no inundar el log. */
let _fallosLlm = 0;

function warnLlm(model: string, e: unknown): void {
  _fallosLlm += 1;
  // Los primeros 3 siempre; luego uno de cada 50 (el ledger ya marca cada
  // documento con `warning: area por defecto`).
  if (_fallosLlm > 3 && _fallosLlm % 50 !== 0) return;
  const err = e as { response?: { status?: number; data?: { error?: { message?: string } } }; message?: string };
  const status = err.response?.status;
  const detalle = err.response?.data?.error?.message ?? err.message ?? String(e);
  console.warn(
    `[llm] fallo #${_fallosLlm} con el modelo "${model}"${status ? ` (HTTP ${status})` : ""}: ` +
      `${String(detalle).slice(0, 160)} — el área cae al default. ` +
      `Si el modelo fue apagado por Groq, fija LLM_MODEL a uno vigente.`
  );
}
