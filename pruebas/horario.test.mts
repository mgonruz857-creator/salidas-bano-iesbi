// Lectura del horario de Séneca con una página FICTICIA que imita la posición de los textos del PDF.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buscarDocente, grupoAutomatico, interpretarPagina, type Texto } from '../src/services/horarioSeneca.ts';

const COL = [68, 217, 366, 514, 663]; // inicio de cada columna (lunes … viernes)
function pagina(): Texto[] {
  const t: Texto[] = [
    { s: 'IES Blas Infante', x: 39, y: 15 },
    { s: 'Profesor:', x: 30, y: 64 }, { s: 'PÉREZ FICTICIO,ANA', x: 78, y: 64 },
    { s: 'Lunes', x: 126, y: 120, w: 24 }, { s: 'Martes', x: 272, y: 120, w: 29 }, { s: 'Miérc.', x: 421, y: 120, w: 29 },
    { s: 'Jueves', x: 570, y: 120, w: 29 }, { s: 'Viernes', x: 716, y: 120, w: 34 },
  ];
  const horas = [['8:30', '9:30'], ['9:30', '10:30'], ['10:30', '11:30'], ['11:30', '12:00'], ['12:00', '13:00'], ['13:00', '14:00'], ['14:00', '15:00']];
  horas.forEach(([a, b], i) => { t.push({ s: a, x: 34, y: 136 + i * 32 }, { s: b, x: 34, y: 144 + i * 32 }); });
  const casilla = (col: number, fila: number, lineas: string[]) =>
    lineas.forEach((s, k) => t.push({ s, x: COL[col], y: 136 + fila * 32 + k * 8 }));
  casilla(0, 0, ['MAT 1ESOA', 'A12', '1ºESO A']);
  casilla(2, 1, ['LEN 2BACH', 'B03', '2º BACH-B']);
  casilla(4, 4, ['OPER 1FPB', '1_FPB', '1ºFPB PCP']);
  casilla(1, 5, ['GUARDIA']);
  casilla(3, 6, ['REF', 'A01', '3ºESO C, 3ºESO D']);
  return t;
}

test('lee docente, días, horas y casillas; una casilla sin grupo no tiene grupos', () => {
  const r = interpretarPagina(pagina())!;
  assert.equal(r.profesor, 'PÉREZ FICTICIO,ANA');
  const resumen = r.tramos.map((x) => [x.dia, x.desde, x.hasta, x.asignatura, x.aula, x.grupos.join('+')].join('|'));
  assert.deepEqual(resumen, [
    '1|08:30|09:30|MAT 1ESOA|A12|1ºESO A',
    '3|09:30|10:30|LEN 2BACH|B03|2º BACH-B',
    '5|12:00|13:00|OPER 1FPB|1_FPB|1ºFPB PCP',
    '2|13:00|14:00|GUARDIA||',
    '4|14:00|15:00|REF|A01|3ºESO C+3ºESO D',
  ]);
});

test('una página sin "Profesor:" no es un horario', () => {
  assert.equal(interpretarPagina([{ s: 'Otra cosa', x: 10, y: 10 }]), null);
});

test('correspondencia de docentes y grupos con la app', () => {
  const profes = [{ email: 'ana@g.educaand.es', nombre: 'Pérez Ficticio, Ana' }, { email: 'luis@g.educaand.es', nombre: 'Luis Gómez Inventado' }];
  assert.equal(buscarDocente('PÉREZ FICTICIO,ANA', profes), 'ana@g.educaand.es');
  assert.equal(buscarDocente('GÓMEZ INVENTADO,LUIS', profes), 'luis@g.educaand.es');
  assert.equal(buscarDocente('OTRA PERSONA,EVA', profes), '');
  const grupos = ['1ESO_A', '2BACH_B', '1_INF'];
  assert.equal(grupoAutomatico('1ºESO A', grupos), '1ESO_A');
  assert.equal(grupoAutomatico('2º BACH-B', grupos), '2BACH_B');
  assert.equal(grupoAutomatico('3ºESO C', grupos), '', 'no existe en la app');
  assert.equal(grupoAutomatico('1ºFPB PCP', grupos), '', 'FP se elige a mano');
});
