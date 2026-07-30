const MESES_LARGOS: Record<string, number> = {
  enero: 1,
  febrero: 2,
  marzo: 3,
  abril: 4,
  mayo: 5,
  junio: 6,
  julio: 7,
  agosto: 8,
  setiembre: 9,
  septiembre: 9,
  octubre: 10,
  noviembre: 11,
  diciembre: 12,
};

/** "15 de marzo de 2006" (formato `publication` de gob.pe) → "2006-03-15". */
export function fechaLargaIso(value: string | null | undefined): string | null {
  const m = /^(\d{1,2})\s+de\s+([a-záéíóúñ]+)\s+de\s+(\d{4})$/i.exec(
    (value ?? "").trim()
  );
  if (!m) return null;
  const mes = MESES_LARGOS[m[2].toLowerCase()];
  if (!mes) return null;
  const dia = Number(m[1]);
  if (dia < 1 || dia > 31) return null;
  return `${m[3]}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

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
