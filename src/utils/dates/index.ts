const MESES_CORTOS = [
  "ene",
  "feb",
  "mar",
  "abr",
  "may",
  "jun",
  "jul",
  "ago",
  "sep",
  "oct",
  "nov",
  "dic",
] as const;

/**
 * "2012-01-26" -> "26-ene-2012": formato legible de las citas legales (el que
 * muestra el propio portal del PJ). Devuelve null si la entrada no es ISO.
 */
export function fechaCorta(iso: string | null): string | null {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return null;
  const mesIdx = Number(m[2]) - 1;
  if (mesIdx < 0 || mesIdx > 11) return null;
  return `${Number(m[3])}-${MESES_CORTOS[mesIdx]}-${m[1]}`;
}
