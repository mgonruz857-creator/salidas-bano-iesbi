// Pruebas del servidor con datos ficticios: node --test pruebas/
import test from 'node:test';
import assert from 'node:assert/strict';
import { crearEntorno, madrid } from './simulador.mjs';

const GRUPOS = ['1ESO_A', '1ESO_B', '1ESO_C', '1ESO_D', '2ESO_A', '2ESO_B'];
const DIA = '2026-10-23'; // viernes

function entorno({ horario } = {}) {
  const alumnado = [['student_id', 'first_name', 'last_name', 'classroom_id', 'is_active']];
  GRUPOS.forEach((g, i) => {
    alumnado.push(['alu_' + g + '_1', 'Ana', 'Prueba ' + i, g, true]);
    alumnado.push(['alu_' + g + '_2', 'Luis', 'Ficticio ' + i, g, true]);
  });
  alumnado.push(['alu_baja', 'Baja', 'De Prueba', '1ESO_A', false]);
  const pestanas = {
    Profesorado: [
      ['teacher_id', 'email', 'full_name', 'assigned_classroom_id', 'rol'],
      ['usr_1', 'docente.uno@g.educaand.es', 'Uno, Docente', '1ESO_A', 'DOCENTE'],
      ['usr_2', 'Docente.Dos@g.educaand.es', 'Dos, Docente', '1ESO_B', ''],
      ['usr_3', 'directiva@g.educaand.es', 'Directiva, Prueba', '', 'DIRECTIVO'],
    ],
    Alumnado: alumnado,
    Historico_Salidas: [['exit_id', 'date', 'student_id', 'classroom_id', 'teacher_email', 'start_time', 'end_time',
      'time_block', 'is_preferred_slot', 'justification', 'is_override', 'override_justification', 'status', 'closed_by']],
  };
  if (horario) pestanas.Horario = [['email', 'dia', 'desde', 'hasta', 'classroom_id'], ...horario];
  const e = crearEntorno(pestanas);
  e.entrar = (email, clave = 'infante26', ahora) => {
    const r = e.pedir({ accion: 'login', email, clave }, ahora);
    assert.equal(r.ok, true, JSON.stringify(r));
    return r.token;
  };
  return e;
}

const hora = (h) => madrid(DIA, h);
const autorizar = (e, token, alumno, grupo, h, extra = {}) =>
  e.pedir({ accion: 'autorizar', token, alumno, grupo, ...extra }, hora(h));

// ───────── Acceso ─────────

test('acceso: dominio, alta en Profesorado, primer acceso, contraseña y bloqueo', () => {
  const e = entorno();
  assert.equal(e.pedir({ accion: 'login', email: 'alguien@gmail.com', clave: 'x' }).codigo, '403_DOMAIN_FORBIDDEN');
  assert.equal(e.pedir({ accion: 'login', email: 'nadie@g.educaand.es', clave: 'infante26' }).codigo, '401_UNAUTHORIZED');
  assert.deepEqual(e.pedir({ accion: 'estadoCuenta', email: 'docente.uno@g.educaand.es' }), { ok: true, registrado: true, tieneClave: false });
  assert.equal(e.pedir({ accion: 'login', email: 'docente.uno@g.educaand.es', clave: 'corta' }).codigo, 'CLAVE_DEBIL');
  const r = e.pedir({ accion: 'login', email: ' DOCENTE.UNO@g.educaand.es ', clave: 'infante26' });
  assert.equal(r.ok, true);
  assert.equal(r.primerAcceso, true);
  assert.ok(!JSON.stringify(e.hojas).includes('infante26'), 'la contraseña no se guarda en la hoja');
  assert.ok(!Object.values(e.props).some((v) => v.includes('infante26')), 'ni en claro en las propiedades');
  for (let i = 0; i < 5; i++) assert.equal(e.pedir({ accion: 'login', email: 'docente.uno@g.educaand.es', clave: 'otra1234' }).codigo, 'CLAVE_INCORRECTA');
  assert.equal(e.pedir({ accion: 'login', email: 'docente.uno@g.educaand.es', clave: 'infante26' }).codigo, 'BLOQUEADO');
  // El correo de la hoja con mayúsculas también vale
  assert.equal(e.pedir({ accion: 'login', email: 'docente.dos@g.educaand.es', clave: 'infante26' }).ok, true);
});

test('acceso: sin sesión no hay datos; el directivo restablece y la sesión antigua caduca', () => {
  const e = entorno();
  assert.equal(e.pedir({ accion: 'estado' }).codigo, 'NO_AUTH');
  assert.equal(e.pedir({ accion: 'estado', token: 'inventado' }).codigo, 'NO_AUTH');
  const t1 = e.entrar('docente.uno@g.educaand.es');
  const td = e.entrar('directiva@g.educaand.es');
  assert.equal(e.pedir({ accion: 'restablecerClave', token: t1, email: 'directiva@g.educaand.es' }).codigo, 'ERROR_SIN_PERMISO');
  assert.equal(e.pedir({ accion: 'restablecerClave', token: td, email: 'docente.uno@g.educaand.es' }).ok, true);
  assert.equal(e.pedir({ accion: 'estado', token: t1 }, hora('09:40')).codigo, 'NO_AUTH');
  const nueva = e.pedir({ accion: 'login', email: 'docente.uno@g.educaand.es', clave: 'nueva2026' });
  assert.equal(nueva.primerAcceso, true);
  const lista = e.pedir({ accion: 'profesorado', token: td });
  assert.equal(lista.profesorado.length, 3);
  assert.equal(e.pedir({ accion: 'historico', token: nueva.token }).codigo, 'ERROR_SIN_PERMISO');
});

// ───────── Horario y reglas ─────────

test('franjas: preferente directa, fuera de preferente exige motivo, recreo y fuera de jornada', () => {
  const e = entorno();
  const t = e.entrar('docente.uno@g.educaand.es');
  assert.equal(autorizar(e, t, 'alu_1ESO_A_1', '1ESO_A', '08:45').codigo, 'ERROR_JUSTIFICACION');
  assert.equal(autorizar(e, t, 'alu_1ESO_A_1', '1ESO_A', '08:45', { justificacion: 'abc' }).codigo, 'ERROR_JUSTIFICACION');
  assert.equal(autorizar(e, t, 'alu_1ESO_A_1', '1ESO_A', '08:45', { justificacion: 'Urgencia' }).ok, true);
  assert.equal(autorizar(e, t, 'alu_1ESO_B_1', '1ESO_B', '09:30').ok, true, 'hora preferente A: 1 clic');
  assert.equal(autorizar(e, t, 'alu_1ESO_C_1', '1ESO_C', '11:30').codigo, 'ERROR_RECREO_ACTIVE');
  assert.equal(autorizar(e, t, 'alu_1ESO_C_1', '1ESO_C', '11:59').codigo, 'ERROR_RECREO_ACTIVE');
  assert.equal(autorizar(e, t, 'alu_1ESO_C_1', '1ESO_C', '13:15').ok, true, 'hora preferente B');
  assert.equal(autorizar(e, t, 'alu_1ESO_D_1', '1ESO_D', '15:00').codigo, 'ERROR_FUERA_HORARIO');
  assert.equal(autorizar(e, t, 'alu_1ESO_D_1', '1ESO_D', '08:29').codigo, 'ERROR_FUERA_HORARIO');
  assert.equal(e.pedir({ accion: 'autorizar', token: t, alumno: 'alu_1ESO_D_1', grupo: '1ESO_D' }, madrid('2026-10-24', '09:45')).codigo,
    'ERROR_FUERA_HORARIO', 'sábado');
  const f = e.hojas.Historico_Salidas.datos;
  assert.equal(f[1][8], false); assert.equal(f[1][9], 'Urgencia');
  assert.equal(f[2][8], true); assert.equal(f[2][9], 'Salida regular');
  assert.equal(f[1][7], 'BLOCK_1'); assert.equal(f[3][7], 'BLOCK_2');
});

test('cupos: máximo 5 en el centro y 1 por aula; alumno ya fuera; alumno de otro grupo o de baja', () => {
  const e = entorno();
  const t = e.entrar('docente.uno@g.educaand.es');
  assert.equal(autorizar(e, t, 'alu_1ESO_A_1', '1ESO_A', '09:35').ok, true);
  assert.equal(autorizar(e, t, 'alu_1ESO_A_1', '1ESO_A', '09:35').codigo, 'ERROR_ALUMNO_YA_FUERA');
  assert.equal(autorizar(e, t, 'alu_1ESO_A_2', '1ESO_A', '09:35').codigo, 'ERROR_CLASSROOM_LIMIT_REACHED');
  assert.equal(autorizar(e, t, 'alu_1ESO_B_1', '1ESO_A', '09:35').codigo, 'ERROR_ALUMNO_NO_ENCONTRADO');
  assert.equal(autorizar(e, t, 'alu_baja', '1ESO_A', '09:35').codigo, 'ERROR_ALUMNO_NO_ENCONTRADO');
  for (const g of ['1ESO_B', '1ESO_C', '1ESO_D', '2ESO_A']) assert.equal(autorizar(e, t, 'alu_' + g + '_1', g, '09:36').ok, true);
  const r = autorizar(e, t, 'alu_2ESO_B_1', '2ESO_B', '09:37');
  assert.equal(r.codigo, 'ERROR_GLOBAL_LIMIT_REACHED');
  assert.match(r.mensaje, /5\/5/);
  const est = e.pedir({ accion: 'estado', token: t }, hora('09:38'));
  assert.equal(est.activas.length, 5);
  // Vuelve uno y ya hay hueco
  const id = est.activas.find((s) => s.grupo === '1ESO_C').exit_id;
  const v = e.pedir({ accion: 'regreso', token: t, exit_id: id }, hora('09:39'));
  assert.equal(v.ok, true);
  assert.equal(v.duration_seconds, 180);
  assert.equal(autorizar(e, t, 'alu_2ESO_B_1', '2ESO_B', '09:40').ok, true);
  assert.equal(e.pedir({ accion: 'regreso', token: t, exit_id: id }, hora('09:41')).codigo, 'ERROR_SALIDA_NO_ENCONTRADA');
});

test('peticiones simultáneas: el cerrojo ocupado no deja pasar ninguna escritura', () => {
  const e = entorno();
  const t = e.entrar('docente.uno@g.educaand.es');
  e.ocuparCerrojo(true);
  assert.equal(autorizar(e, t, 'alu_1ESO_A_1', '1ESO_A', '09:35').codigo, 'ERROR_OCUPADO');
  assert.equal(e.hojas.Historico_Salidas.datos.length, 1);
  e.ocuparCerrojo(false);
  assert.equal(autorizar(e, t, 'alu_1ESO_A_1', '1ESO_A', '09:35').ok, true);
});

test('segunda salida en el bloque: aviso con el docente anterior y salida excepcional justificada', () => {
  const e = entorno();
  const t1 = e.entrar('docente.uno@g.educaand.es');
  const t2 = e.entrar('docente.dos@g.educaand.es');
  assert.equal(autorizar(e, t1, 'alu_1ESO_A_1', '1ESO_A', '09:12', { justificacion: 'Lo necesita' }).ok, true);
  const s = e.pedir({ accion: 'estado', token: t1 }, hora('09:14')).activas[0];
  e.pedir({ accion: 'regreso', token: t1, exit_id: s.exit_id }, hora('09:16'));
  const d = autorizar(e, t2, 'alu_1ESO_A_1', '1ESO_A', '10:00');
  assert.equal(d.codigo, 'DUPLICADO');
  assert.equal(d.is_duplicate, true);
  assert.equal(d.previous_teacher, 'docente.uno@g.educaand.es');
  assert.equal(d.time, '09:12');
  assert.equal(autorizar(e, t2, 'alu_1ESO_A_1', '1ESO_A', '10:00', { justificacion_excepcional: 'corto' }).codigo, 'DUPLICADO');
  const ok = autorizar(e, t2, 'alu_1ESO_A_1', '1ESO_A', '10:00', { justificacion_excepcional: 'Indicación médica de la familia' });
  assert.equal(ok.is_override, true);
  const fila = e.hojas.Historico_Salidas.datos.at(-1);
  assert.equal(fila[10], true);
  assert.equal(fila[11], 'Indicación médica de la familia');
  // En el bloque 2 la cuota se reinicia
  const s2 = e.pedir({ accion: 'estado', token: t2 }, hora('10:02')).activas[0];
  e.pedir({ accion: 'regreso', token: t2, exit_id: s2.exit_id }, hora('10:04'));
  assert.equal(autorizar(e, t2, 'alu_1ESO_A_1', '1ESO_A', '13:10').ok, true);
});

test('anular: solo el mismo docente y en los 2 primeros minutos; no cuenta como salida', () => {
  const e = entorno();
  const t1 = e.entrar('docente.uno@g.educaand.es');
  const t2 = e.entrar('docente.dos@g.educaand.es');
  autorizar(e, t1, 'alu_1ESO_A_1', '1ESO_A', '09:40');
  const s = e.pedir({ accion: 'estado', token: t1 }, hora('09:41')).activas[0];
  assert.equal(s.puede_anular, true);
  assert.equal(e.pedir({ accion: 'anular', token: t2, exit_id: s.exit_id }, hora('09:41')).codigo, 'ERROR_NO_SE_PUEDE_ANULAR');
  assert.equal(e.pedir({ accion: 'anular', token: t1, exit_id: s.exit_id }, hora('09:43')).codigo, 'ERROR_NO_SE_PUEDE_ANULAR');
  assert.equal(e.pedir({ accion: 'anular', token: t1, exit_id: s.exit_id }, hora('09:41')).ok, true);
  assert.equal(autorizar(e, t1, 'alu_1ESO_A_1', '1ESO_A', '09:45').ok, true, 'la anulada no cuenta para la cuota');
});

test('salidas sin regreso se cierran solas al terminar el bloque y liberan el cupo', () => {
  const e = entorno();
  const t = e.entrar('docente.uno@g.educaand.es');
  autorizar(e, t, 'alu_1ESO_A_1', '1ESO_A', '11:00', { justificacion: 'Necesidad' });
  assert.equal(e.pedir({ accion: 'estado', token: t }, hora('11:20')).activas.length, 1);
  const est = e.pedir({ accion: 'estado', token: t }, hora('12:05'));
  assert.equal(est.activas.length, 0);
  const fila = e.hojas.Historico_Salidas.datos[1];
  assert.equal(fila[12], 'NO_RETURN');
  assert.equal(fila[13], 'SISTEMA');
  assert.equal(fila[6].toISOString(), hora('11:30').toISOString());
  assert.equal(autorizar(e, t, 'alu_1ESO_A_2', '1ESO_A', '12:10', { justificacion: 'Necesidad' }).ok, true);
});

test('estado: grupo según horario, aula asignada o el elegido; salidas del bloque por alumno', () => {
  const e = entorno({ horario: [
    ['docente.uno@g.educaand.es', 'V', '09:30', '10:30', '2ESO_B'],
    ['docente.uno@g.educaand.es', 5, '12:00', '13:00', '1ESO_C'],
  ] });
  const t = e.entrar('docente.uno@g.educaand.es');
  assert.equal(e.pedir({ accion: 'estado', token: t }, hora('09:45')).grupo, '2ESO_B');
  assert.equal(e.pedir({ accion: 'estado', token: t }, hora('12:30')).grupo, '1ESO_C');
  assert.equal(e.pedir({ accion: 'estado', token: t }, hora('08:45')).grupo, '1ESO_A', 'sin horario: su aula');
  const est = e.pedir({ accion: 'estado', token: t, grupo: '1ESO_D' }, hora('09:45'));
  assert.equal(est.grupo, '1ESO_D');
  assert.equal(est.alumnos.length, 2);
  assert.deepEqual(est.grupos, GRUPOS);
  autorizar(e, t, 'alu_1ESO_D_1', '1ESO_D', '09:50');
  const est2 = e.pedir({ accion: 'estado', token: t, grupo: '1ESO_D' }, hora('09:51'));
  assert.equal(est2.alumnos.find((a) => a.id === 'alu_1ESO_D_1').salidas[0].hora, '09:50');
  assert.equal(est2.franja.nombre, 'Hora preferente A');
  assert.equal(est2.franja.preferente, true);
});

test('histórico del día para el Equipo Directivo; los días anteriores no cuentan', () => {
  const e = entorno();
  const t = e.entrar('docente.uno@g.educaand.es');
  const td = e.entrar('directiva@g.educaand.es');
  e.pedir({ accion: 'autorizar', token: t, alumno: 'alu_1ESO_A_1', grupo: '1ESO_A' }, madrid('2026-10-22', '09:40'));
  e.pedir({ accion: 'autorizar', token: t, alumno: 'alu_1ESO_A_1', grupo: '1ESO_A' }, madrid('2026-10-22', '13:40'));
  autorizar(e, t, 'alu_1ESO_A_1', '1ESO_A', '09:40'); // al día siguiente no es duplicado
  const h = e.pedir({ accion: 'historico', token: td, fecha: '2026-10-22' }, hora('10:00'));
  assert.equal(h.salidas.length, 2);
  assert.equal(e.pedir({ accion: 'historico', token: td }, hora('10:00')).salidas.length, 1);
});

test('guardar horario: solo directivos, valida filas y sustituye solo a los docentes importados', () => {
  const e = entorno({ horario: [
    ['docente.dos@g.educaand.es', 'L', '08:30', '09:30', '1ESO_B'],
    ['docente.uno@g.educaand.es', 'L', '08:30', '09:30', '1ESO_A'],
  ] });
  const t = e.entrar('docente.uno@g.educaand.es');
  const td = e.entrar('directiva@g.educaand.es');
  const filas = [
    ['docente.uno@g.educaand.es', 5, '9:30', '10:30', '2ESO_B'],
    ['docente.uno@g.educaand.es', 5, '12:00', '13:00', 'GRUPO_INVENTADO'],
    ['nadie@g.educaand.es', 5, '12:00', '13:00', '1ESO_A'],
    ['docente.uno@g.educaand.es', 9, '12:00', '13:00', '1ESO_A'],
  ];
  assert.equal(e.pedir({ accion: 'guardarHorario', token: t, filas }).codigo, 'ERROR_SIN_PERMISO');
  const r = e.pedir({ accion: 'guardarHorario', token: td, filas });
  assert.equal(r.guardados, 1);
  assert.equal(r.total, 2);
  const hoja = e.hojas.Horario.datos.slice(1, e.hojas.Horario.getLastRow());
  assert.deepEqual(hoja.map((f) => f.join('|')), ['docente.dos@g.educaand.es|L|08:30|09:30|1ESO_B', 'docente.uno@g.educaand.es|5|09:30|10:30|2ESO_B']);
  assert.equal(e.pedir({ accion: 'estado', token: t }, hora('09:45')).grupo, '2ESO_B', 'la caché del horario se renueva');
  const lista = e.pedir({ accion: 'profesorado', token: td });
  assert.equal(lista.profesorado.find((p) => p.email === 'docente.uno@g.educaand.es').tramos, 1);
  assert.deepEqual(lista.grupos, GRUPOS);
});

test('modo pruebas: el reloj simulado empieza en INICIO_RELOJ_PRUEBAS y se apaga', () => {
  const e = entorno();
  const post = (req) => JSON.parse(e.ctx.doPost({ postData: { contents: JSON.stringify(req) } }).texto);
  const token = post({ accion: 'login', email: 'docente.uno@g.educaand.es', clave: 'infante26' }).token;
  e.ctx.activarModoPruebas();
  const est = post({ accion: 'estado', token });
  assert.equal(est.reloj_simulado, true);
  assert.equal(est.franja.nombre, '1ª hora');
  assert.equal(e.ctx.Utilities.formatDate(new Date(est.ahora), 'Europe/Madrid', 'yyyy-MM-dd HH:mm'), '2026-10-23 09:25');
  e.ctx.desactivarModoPruebas();
  assert.equal(post({ accion: 'estado', token }).reloj_simulado, false);
});
