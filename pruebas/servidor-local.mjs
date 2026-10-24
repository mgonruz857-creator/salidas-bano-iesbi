/**
 * Servidor local para probar la app sin Google: ejecuta servidor/Code.gs en el simulador con
 * datos FICTICIOS.
 *
 *   node pruebas/servidor-local.mjs            (hora real)
 *   SIM_DESDE="2026-10-23 09:40" node pruebas/servidor-local.mjs   (el reloj empieza ahí)
 *   VITE_URL_API=http://localhost:8787 npm run dev
 *
 * Cuentas: directiva@g.educaand.es y docente.uno@g.educaand.es (primer acceso: cualquier contraseña válida).
 */
import http from 'node:http';
import { crearEntorno, madrid } from './simulador.mjs';

const GRUPOS = ['1ESO_A', '1ESO_B', '2ESO_A', '3ESO_C', '4ESO_D', '1BACH_A', '2BACH_B', '1_INF', '2_INF'];
const NOMBRES = ['Ana', 'Luis', 'Carmen', 'Pablo', 'Lucía', 'Javier', 'Elena', 'Hugo', 'Marta', 'Daniel', 'Sara', 'Iván'];
const APELLIDOS = ['Ejemplo', 'Ficticio', 'Inventado', 'Prueba', 'Demo', 'Modelo', 'Muestra', 'Simulado'];

const alumnado = [['student_id', 'first_name', 'last_name', 'classroom_id', 'is_active']];
GRUPOS.forEach((g, gi) => {
  for (let i = 0; i < 12; i++) {
    alumnado.push(['alu_' + g + '_' + i, NOMBRES[(i + gi) % NOMBRES.length],
      APELLIDOS[(i * 3 + gi) % APELLIDOS.length] + ' ' + APELLIDOS[(i + gi * 2 + 1) % APELLIDOS.length], g, true]);
  }
});

const e = crearEntorno({
  Profesorado: [
    ['teacher_id', 'email', 'full_name', 'assigned_classroom_id', 'rol'],
    ['usr_1', 'docente.uno@g.educaand.es', 'Uno Ejemplo, Docente', '1ESO_A', 'DOCENTE'],
    ['usr_2', 'docente.dos@g.educaand.es', 'Dos Ejemplo, Docente', '2ESO_A', 'DOCENTE'],
    ['usr_3', 'directiva@g.educaand.es', 'Directiva Ejemplo, Jefa', '', 'DIRECTIVO'],
  ],
  Alumnado: alumnado,
  Historico_Salidas: [['exit_id', 'date', 'student_id', 'classroom_id', 'teacher_email', 'start_time', 'end_time',
    'time_block', 'is_preferred_slot', 'justification', 'is_override', 'override_justification', 'status', 'closed_by']],
  Horario: [['email', 'dia', 'desde', 'hasta', 'classroom_id'],
    ['docente.uno@g.educaand.es', 'V', '09:30', '10:30', '3ESO_C']],
});

const inicioReal = Date.now();
const inicioSim = process.env.SIM_DESDE ? madrid(...process.env.SIM_DESDE.split(' ')).getTime() : inicioReal;
const ahora = () => new Date(inicioSim + (Date.now() - inicioReal));

http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'POST') { res.end(JSON.stringify({ ok: true, servicio: 'GBCS (local)' })); return; }
  let cuerpo = '';
  req.on('data', (c) => { cuerpo += c; });
  req.on('end', () => {
    let r;
    try { r = e.pedir(JSON.parse(cuerpo || '{}'), ahora()); } catch (err) { r = { ok: false, codigo: 'ERROR_PETICION', mensaje: String(err) }; }
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(r));
  });
}).listen(8787, () => console.log('Servidor de pruebas en http://localhost:8787 · hora simulada ' + ahora().toISOString()));
