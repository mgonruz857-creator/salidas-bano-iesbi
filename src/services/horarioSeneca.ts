/**
 * Lectura del PDF "Horarios de profesores" de Séneca (una página por docente).
 *
 * Cada página tiene "Profesor: APELLIDOS,NOMBRE", la fila de días (Lunes … Viernes), las horas
 * a la izquierda en parejas (8:30 / 9:30) y en cada casilla tres líneas: asignatura, aula y grupo.
 * Esta parte no depende de pdf.js: recibe los textos con su posición (y medida desde arriba).
 */

export interface Texto { s: string; x: number; y: number; w?: number }

export interface Tramo {
  dia: number;          // 1 = lunes … 5 = viernes
  desde: string;        // "08:30"
  hasta: string;        // "09:30"
  asignatura: string;
  aula: string;
  grupos: string[];     // tal como vienen en Séneca, p. ej. "2ºFPB PCP"
}

export interface PaginaHorario { profesor: string; tramos: Tramo[] }

const DIAS = [/^lun/i, /^mar/i, /^mi[eé]/i, /^jue/i, /^vie/i];

export function interpretarPagina(textos: Texto[]): PaginaHorario | null {
  const items = textos.map((t) => ({ ...t, s: t.s.trim() })).filter((t) => t.s);

  const profesor = textoProfesor(items);
  if (!profesor) return null;

  // Cabecera de días: centro aproximado de cada palabra
  const cabecera: { dia: number; centro: number; y: number }[] = [];
  items.forEach((t) => {
    const d = DIAS.findIndex((re) => re.test(t.s));
    if (d >= 0 && !cabecera.some((c) => c.dia === d + 1)) cabecera.push({ dia: d + 1, centro: t.x + (t.w || anchoAprox(t.s)) / 2, y: t.y });
  });
  if (cabecera.length < 2) return { profesor, tramos: [] };
  cabecera.sort((a, b) => a.centro - b.centro);
  const mitad = (cabecera[cabecera.length - 1].centro - cabecera[0].centro) / (cabecera.length - 1) / 2;
  const izquierdas = cabecera.map((c) => ({ dia: c.dia, x: c.centro - mitad }));
  const yCabecera = Math.max(...cabecera.map((c) => c.y));
  const limiteHoras = izquierdas[0].x - 2;

  // Horas de la izquierda, en parejas inicio/fin
  const horas = items
    .filter((t) => t.x < limiteHoras && t.y > yCabecera && /^\d{1,2}:\d{2}$/.test(t.s))
    .sort((a, b) => a.y - b.y);
  const franjas: { desde: string; hasta: string; y: number }[] = [];
  for (let i = 0; i + 1 < horas.length; i += 2) franjas.push({ desde: hora(horas[i].s), hasta: hora(horas[i + 1].s), y: horas[i].y });

  const tramos: Tramo[] = [];
  franjas.forEach((f, i) => {
    const yFin = i + 1 < franjas.length ? franjas[i + 1].y - 2 : Infinity;
    const enFila = items.filter((t) => t.x >= izquierdas[0].x - 6 && t.y >= f.y - 2 && t.y < yFin);
    for (let c = 0; c < izquierdas.length; c++) {
      const x0 = izquierdas[c].x - 6;
      const x1 = c + 1 < izquierdas.length ? izquierdas[c + 1].x - 6 : Infinity;
      const lineas = agruparLineas(enFila.filter((t) => t.x >= x0 && t.x < x1));
      if (!lineas.length) continue;
      tramos.push({
        dia: izquierdas[c].dia, desde: f.desde, hasta: f.hasta,
        asignatura: lineas[0] || '', aula: lineas[1] || '',
        grupos: lineas.slice(2).flatMap((l) => l.split(/\s*[,;]\s*/)).filter(Boolean),
      });
    }
  });
  return { profesor, tramos };
}

function textoProfesor(items: Texto[]): string {
  const et = items.find((t) => /^profesor(a)?:/i.test(t.s));
  if (!et) return '';
  const enLinea = /^profesor(a)?:\s*(.+)$/i.exec(et.s);
  const resto = items.filter((t) => t !== et && Math.abs(t.y - et.y) < 4 && t.x > et.x).sort((a, b) => a.x - b.x).map((t) => t.s);
  return [enLinea ? enLinea[2] : '', ...resto].join(' ').replace(/\s+/g, ' ').trim();
}

function agruparLineas(items: Texto[]): string[] {
  const orden = [...items].sort((a, b) => a.y - b.y || a.x - b.x);
  const lineas: Texto[][] = [];
  orden.forEach((t) => {
    const ult = lineas[lineas.length - 1];
    if (ult && Math.abs(ult[0].y - t.y) < 3) ult.push(t);
    else lineas.push([t]);
  });
  return lineas.map((l) => l.sort((a, b) => a.x - b.x).map((t) => t.s).join(' ').replace(/\s+/g, ' ').trim());
}

/** Ancho aproximado de un texto de 7 pt (solo para centrar la cabecera de días). */
function anchoAprox(s: string) { return s.length * 4.8; }

function hora(s: string) { const [h, m] = s.split(':'); return h.padStart(2, '0') + ':' + m; }

// ───────── Correspondencias con la app ─────────

export function normalizarNombre(s: string): string {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()
    .replace(/\s*,\s*/g, ',').replace(/\s+/g, ' ').trim();
}

/**
 * Busca el correo de un docente de Séneca ("APELLIDOS,NOMBRE") en el profesorado de la app
 * ("Apellidos, Nombre" o "Nombre Apellidos").
 */
export function buscarDocente(nombreSeneca: string, profesorado: { email: string; nombre: string }[]): string {
  const n = normalizarNombre(nombreSeneca);
  const [ap, no] = n.split(',');
  for (const p of profesorado) {
    const q = normalizarNombre(p.nombre);
    if (q === n) return p.email;
    if (no && (q === no + ' ' + ap || q.replace(',', ' ') === ap + ' ' + no)) return p.email;
  }
  return '';
}

/** "1ºESO A" → "1ESO_A", "2º BACH-B" → "2BACH_B", "1ºFPB PCP" → "1_INF". Lo demás (ciclos, desdobles) se elige a mano. */
export function grupoAutomatico(texto: string, existentes: string[]): string {
  const t = normalizarNombre(texto).replace(/º|ª/g, '');
  let codigo = '';
  const m = /^(\d)\s*(ESO|BACH|BTO|BACHILLERATO)\s*-?\s*([A-Z])\b/.exec(t);
  if (m) codigo = m[1] + (m[2] === 'ESO' ? 'ESO' : 'BACH') + '_' + m[3];
  // FP Básica de Informática: en Séneca "1ºFPB PCP", en convivencia 1_INF
  const fpb = /^(\d)\s*FPB\b/.exec(t);
  if (fpb) codigo = fpb[1] + '_INF';
  const directo = existentes.find((g) => g.toUpperCase() === t.replace(/\s+/g, '_'));
  if (directo) return directo;
  return existentes.includes(codigo) ? codigo : '';
}
