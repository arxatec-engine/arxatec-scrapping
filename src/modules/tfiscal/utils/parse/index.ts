/**
 * La sala sale del propio número de RTF: el token central es la sala
 * ("01380-1-2006" → Sala 1) o la letra Q de la Oficina de Atención de Quejas
 * ("02077-Q-2014").
 */
export function salaFromRtf(rtf: string): string | null {
  const m = /^\d+-(\d{1,2}|[A-Za-z])-\d{4}$/.exec(rtf);
  if (!m) return null;
  if (/^\d+$/.test(m[1])) return `Sala ${Number(m[1])}`;
  if (m[1].toUpperCase() === "Q") return "Oficina de Atención de Quejas";
  return `Sala ${m[1].toUpperCase()}`;
}
