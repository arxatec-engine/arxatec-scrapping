/**
 * Catálogo canónico de FUENTES jurídicas — regla de los tres repos
 * (scrapping · assistant · platform, ver docs/fuentes-canonicas.md):
 *
 *  - `key`            identificador técnico interno (nombre del módulo).
 *  - `canonicalName`  nombre oficial COMPLETO: lo único que se persiste y
 *                     se muestra. Jamás una sigla.
 *  - `aliases`        siglas y variantes históricas: solo sirven para
 *                     detección/normalización/búsqueda, nunca se guardan.
 *
 * FUENTE ≠ ENTIDAD EMISORA: un documento obtenido desde el SPIJ tiene fuente
 * "Sistema Peruano de Información Jurídica" y como emisor, por ejemplo, el
 * Ministerio de Educación. Este catálogo solo gobierna la fuente.
 *
 * Los espejos de este catálogo viven en:
 *  - assistant: app/storage/legal_documents/shared/sources.py
 *  - platform:  src/types/legal_documents (LEGAL_SOURCE + alias)
 * Cambiar una fuente aquí exige cambiarla en los tres (hay pruebas/validación
 * en cada repo que fijan el mapeo).
 */

export interface LegalSourceDef {
  key: string;
  canonicalName: string;
  aliases: string[];
}

export const LEGAL_SOURCES: readonly LegalSourceDef[] = [
  {
    key: "pj",
    canonicalName: "Poder Judicial",
    aliases: ["PJ", "Poder judicial"],
  },
  {
    key: "tc",
    canonicalName: "Tribunal Constitucional",
    aliases: ["TC", "Tribunal constitucional"],
  },
  {
    key: "spij",
    canonicalName: "Sistema Peruano de Información Jurídica",
    aliases: ["SPIJ", "Sistema peruano de informacion juridica"],
  },
  {
    key: "el_peruano",
    canonicalName: "Diario Oficial El Peruano",
    aliases: ["El Peruano", "Diario oficial el peruano"],
  },
  {
    key: "congreso",
    canonicalName: "Congreso de la República",
    aliases: ["Congreso", "Congreso de la república"],
  },
  {
    key: "minjus",
    canonicalName: "Ministerio de Justicia y Derechos Humanos",
    aliases: ["MINJUS", "Ministerio de justicia y derechos humanos"],
  },
  {
    key: "defensoria",
    canonicalName: "Defensoría del Pueblo",
    aliases: ["Defensoría del pueblo", "Defensoria del Pueblo"],
  },
  {
    key: "jne",
    canonicalName: "Jurado Nacional de Elecciones",
    aliases: ["JNE", "Jurado nacional de elecciones"],
  },
  // Tanda P3 (tribunales administrativos, registrada 2026-07-30): se añaden
  // TODAS de una vez para que la huella compartida cambie una sola vez;
  // los módulos van llegando uno a uno (ver docs/registro-scraping.md).
  {
    key: "tfiscal",
    canonicalName: "Tribunal Fiscal",
    aliases: ["TF", "Tribunal fiscal"],
  },
  {
    key: "indecopi",
    canonicalName:
      "Instituto Nacional de Defensa de la Competencia y de la Protección de la Propiedad Intelectual",
    aliases: ["INDECOPI"],
  },
  {
    key: "tce",
    canonicalName: "Tribunal de Contrataciones del Estado",
    aliases: ["OSCE", "OECE", "TCE", "TCP", "Tribunal de Contrataciones Publicas"],
  },
  {
    key: "tregistral",
    canonicalName: "Tribunal Registral",
    aliases: ["SUNARP", "Tribunal registral"],
  },
  {
    key: "tservir",
    canonicalName: "Tribunal del Servicio Civil",
    aliases: ["SERVIR", "TSC"],
  },
  {
    key: "toefa",
    canonicalName: "Tribunal de Fiscalización Ambiental",
    aliases: ["OEFA", "TFA"],
  },
  {
    key: "sunat",
    canonicalName: "Superintendencia Nacional de Aduanas y de Administración Tributaria",
    aliases: ["SUNAT"],
  },
  // Tanda P4 (reguladores, registrada 2026-07-30): igual que la P3, todas de
  // una vez para una sola rotación de huella; las sirve el módulo `reguladores`.
  {
    key: "osinergmin",
    canonicalName: "Organismo Supervisor de la Inversión en Energía y Minería",
    aliases: ["OSINERGMIN"],
  },
  {
    key: "osiptel",
    canonicalName: "Organismo Supervisor de Inversión Privada en Telecomunicaciones",
    aliases: ["OSIPTEL"],
  },
  {
    key: "sunass",
    canonicalName: "Superintendencia Nacional de Servicios de Saneamiento",
    aliases: ["SUNASS"],
  },
  {
    key: "ositran",
    canonicalName:
      "Organismo Supervisor de la Inversión en Infraestructura de Transporte de Uso Público",
    aliases: ["OSITRAN"],
  },
] as const;

/** minúsculas + sin tildes: la llave de comparación de alias. */
function fold(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Mapa completo de resolución (alias y canónicos plegados → canónico).
 * Exportado únicamente para el test de sincronía entre repos (huella
 * compartida con assistant/platform); el código de producto debe pasar por
 * `canonicalSource`.
 */
export const CANONICAL_BY_ALIAS = new Map<string, string>();
for (const source of LEGAL_SOURCES) {
  CANONICAL_BY_ALIAS.set(fold(source.canonicalName), source.canonicalName);
  for (const alias of source.aliases) {
    CANONICAL_BY_ALIAS.set(fold(alias), source.canonicalName);
  }
}

export function sourceByKey(key: string): LegalSourceDef {
  const def = LEGAL_SOURCES.find((s) => s.key === key);
  if (!def) {
    throw new Error(`Fuente desconocida en el catálogo: "${key}"`);
  }
  return def;
}

/**
 * Normaliza un valor de fuente a su nombre canónico. Los alias registrados
 * (siglas, variantes de mayúsculas/tildes) se resuelven; un valor DESCONOCIDO
 * se devuelve tal cual (no se inventan expansiones) — el caller decide si
 * advertir. Nunca devuelve una sigla registrada.
 */
export function canonicalSource(value: string): string {
  const trimmed = value.replace(/\s+/g, " ").trim();
  if (!trimmed) {
    return trimmed;
  }
  return CANONICAL_BY_ALIAS.get(fold(trimmed)) ?? trimmed;
}

/** ¿El valor es un alias/canónico registrado? (para advertir desconocidas). */
export function isKnownSource(value: string): boolean {
  return CANONICAL_BY_ALIAS.has(fold(value));
}
