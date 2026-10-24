/**
 * GBCS – Gestión de salidas al baño · IES Blas Infante (Córdoba)
 * Servidor Google Apps Script (va dentro de la hoja de cálculo: Extensiones > Apps Script).
 * La app web (GitHub Pages) le habla por POST, igual que la app de convivencia.
 *
 * Publicación: Implementar > Nueva implementación > Aplicación web
 *   - Ejecutar como: Yo (la cuenta propietaria de la hoja)
 *   - Quién tiene acceso: Cualquier persona
 *     (la seguridad la pone este programa: sin sesión iniciada no devuelve datos, y la hoja
 *      no se comparte con nadie)
 *
 * Pestañas de la hoja:
 *   Profesorado        A teacher_id | B email | C full_name | D assigned_classroom_id | E rol (DOCENTE | DIRECTIVO)
 *   Alumnado           A student_id | B first_name | C last_name | D classroom_id | E is_active
 *   Historico_Salidas  A exit_id … M status | N closed_by (ver CABECERAS)
 *   Horario (opcional) A email | B dia (1-5 o L, M, X, J, V) | C desde (HH:mm) | D hasta (HH:mm) | E classroom_id
 *
 * Los identificadores de alumno y los códigos de grupo (1ESO_A, 2BACH_C, 1_FRIO…) son los mismos
 * que usa la app de convivencia (SIGC-BI), para poder integrarlas más adelante.
 *
 * Funciones para ejecutar desde el editor: configurarHoja, limpiarCache, cerrarSalidasAbiertas,
 * activarModoPruebas y desactivarModoPruebas (solo en la hoja de PRUEBAS).
 */

// ───────────────────────── Configuración ─────────────────────────

var VERSION = '1.0.0';
var ZONA = 'Europe/Madrid';
var DOMINIO = '@g.educaand.es';
var CUPO_GLOBAL = 5;
var CUPO_AULA = 1;
var MINUTOS_MAXIMOS = 5;            // temporizador de regreso
var MIN_JUSTIFICACION = 5;          // fuera de hora preferente
var MIN_JUSTIFICACION_EXCEPCIONAL = 10; // 2ª salida en el mismo bloque
var MINUTOS_PARA_ANULAR = 2;        // el docente puede anular su propia salida por error
var ESPERA_CERROJO_MS = 10000;
var CACHE_TTL = 21600;              // 6 horas
var FILAS_POR_LECTURA = 1500;
var DURACION_SESION_SEG = 21600;    // 6 horas (máximo de CacheService), se renueva con el uso
var MAX_INTENTOS = 5;
var BLOQUEO_SEG = 900;              // 15 minutos

// MODO PRUEBAS (solo en la hoja de PRUEBAS): día y hora en los que empieza el reloj simulado,
// "AAAA-MM-DD HH:mm". Se activa con activarModoPruebas y desde ese momento el reloj avanza normal.
var INICIO_RELOJ_PRUEBAS = '2026-10-23 09:25'; // viernes, 5 minutos antes de la hora preferente A

var HOJA_PROFESORADO = 'Profesorado';
var HOJA_ALUMNADO = 'Alumnado';
var HOJA_HISTORICO = 'Historico_Salidas';
var HOJA_HORARIO = 'Horario';

var CABECERAS = {
  Profesorado: ['teacher_id', 'email', 'full_name', 'assigned_classroom_id', 'rol'],
  Alumnado: ['student_id', 'first_name', 'last_name', 'classroom_id', 'is_active'],
  Historico_Salidas: ['exit_id', 'date', 'student_id', 'classroom_id', 'teacher_email', 'start_time', 'end_time',
    'time_block', 'is_preferred_slot', 'justification', 'is_override', 'override_justification', 'status', 'closed_by'],
  Horario: ['email', 'dia', 'desde', 'hasta', 'classroom_id']
};

// Índices (desde 0) de las columnas de Historico_Salidas
var H = { id: 0, fecha: 1, alumno: 2, aula: 3, docente: 4, inicio: 5, fin: 6, bloque: 7, preferente: 8,
  justificacion: 9, excepcional: 10, justificacion_excepcional: 11, estado: 12, cerrado_por: 13 };
var N_COLUMNAS = 14;

// Jornada en minutos desde las 00:00 (hora de Madrid)
var FRANJAS = [
  { desde: 510, hasta: 570, bloque: 'BLOCK_1', preferente: false, nombre: '1ª hora' },
  { desde: 570, hasta: 630, bloque: 'BLOCK_1', preferente: true, nombre: 'Hora preferente A' },
  { desde: 630, hasta: 690, bloque: 'BLOCK_1', preferente: false, nombre: '3ª hora' },
  { desde: 690, hasta: 720, bloque: 'RECREO', preferente: false, nombre: 'Recreo' },
  { desde: 720, hasta: 780, bloque: 'BLOCK_2', preferente: false, nombre: '4ª hora' },
  { desde: 780, hasta: 840, bloque: 'BLOCK_2', preferente: true, nombre: 'Hora preferente B' },
  { desde: 840, hasta: 900, bloque: 'BLOCK_2', preferente: false, nombre: '6ª hora' }
];
var FIN_BLOQUE = { BLOCK_1: 690, BLOCK_2: 900 };

var MENSAJES = {
  '403_DOMAIN_FORBIDDEN': 'Acceso restringido al personal del IES Blas Infante (@g.educaand.es).',
  '401_UNAUTHORIZED': 'Esa cuenta no está dada de alta en el profesorado de la aplicación. Debe darla de alta Jefatura de Estudios.',
  'NO_AUTH': 'La sesión ha caducado. Vuelva a iniciar sesión.',
  'BLOQUEADO': 'Demasiados intentos fallidos. Espere 15 minutos o pida al Equipo Directivo que restablezca su contraseña.',
  'CLAVE_INCORRECTA': 'Contraseña incorrecta.',
  'CLAVE_DEBIL': 'La contraseña debe tener al menos 6 caracteres y combinar letras y números (por ejemplo: infante26).',
  'ERROR_PETICION': 'Petición no válida.',
  'ERROR_FUERA_HORARIO': 'Fuera de la jornada lectiva (lunes a viernes, de 08:30 a 15:00).',
  'ERROR_RECREO_ACTIVE': 'Durante el recreo (11:30 a 12:00) no se conceden salidas.',
  'ERROR_JUSTIFICACION': 'Fuera de la hora preferente hay que escribir un motivo (mínimo ' + MIN_JUSTIFICACION + ' caracteres).',
  'ERROR_JUSTIFICACION_EXCEPCIONAL': 'Para una segunda salida en el mismo bloque hay que justificarla (mínimo ' + MIN_JUSTIFICACION_EXCEPCIONAL + ' caracteres).',
  'ERROR_GLOBAL_LIMIT_REACHED': 'Cupo máximo alcanzado (' + CUPO_GLOBAL + '/' + CUPO_GLOBAL + '). Espere a que un alumno regrese.',
  'ERROR_CLASSROOM_LIMIT_REACHED': 'Ya hay un alumno de este grupo fuera del aula. Espere a que regrese.',
  'ERROR_ALUMNO_YA_FUERA': 'Este alumno ya está fuera del aula.',
  'ERROR_ALUMNO_NO_ENCONTRADO': 'No se encuentra el alumno en el grupo indicado.',
  'ERROR_SALIDA_NO_ENCONTRADA': 'No se encuentra esa salida activa (puede que otro docente ya haya marcado el regreso).',
  'ERROR_NO_SE_PUEDE_ANULAR': 'Solo puede anular una salida el docente que la autorizó y durante los ' + MINUTOS_PARA_ANULAR + ' primeros minutos.',
  'ERROR_SIN_PERMISO': 'Esta consulta es solo para el Equipo Directivo.',
  'ERROR_OCUPADO': 'El sistema está atendiendo otras peticiones. Inténtelo de nuevo en unos segundos.',
  'ERROR_ACCION': 'Acción desconocida.'
};

// ───────────────────────── Entrada web ─────────────────────────

function doGet() {
  return salida_({ ok: true, servicio: 'GBCS', version: VERSION });
}

/**
 * La app (GitHub Pages) envía por POST, en texto plano, { accion, token, ...datos }.
 * Respuesta siempre JSON: { ok: true, ... } o { ok: false, codigo, mensaje }.
 */
function doPost(e) {
  var req;
  try {
    req = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  } catch (err) {
    return salida_(fallo_('ERROR_PETICION'));
  }
  return salida_(atender_(req, ahoraServidor_()));
}

function atender_(req, ahora) {
  try {
    switch (req.accion) {
      case 'estadoCuenta': return estadoCuenta_(req);
      case 'login': return login_(req);
      case 'logout': cerrarSesion_(req.token); return { ok: true };
      case 'cambiarClave': return cambiarClave_(req);
    }
    var usuario = sesion_(req.token);
    switch (req.accion) {
      case 'estado': return estado_(usuario, req, ahora);
      case 'autorizar': return conCerrojo_(function () { return autorizar_(usuario, req, ahora); });
      case 'regreso': return conCerrojo_(function () { return regreso_(usuario, req, ahora); });
      case 'anular': return conCerrojo_(function () { return anular_(usuario, req, ahora); });
      case 'historico': return historico_(usuario, req, ahora);
      case 'profesorado': return listaProfesorado_(usuario);
      case 'guardarHorario': return conCerrojo_(function () { return guardarHorario_(usuario, req); });
      case 'restablecerClave': return restablecerClave_(usuario, req);
      default: return fallo_('ERROR_ACCION');
    }
  } catch (err) {
    if (err && err.codigo) return fallo_(err.codigo, null, err.message);
    console.error(err && err.stack || err);
    return { ok: false, codigo: 'ERROR_INTERNO', mensaje: 'Error inesperado del servidor: ' + (err && err.message || err) };
  }
}

function salida_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// ───────────────────────── Acceso (igual que convivencia) ─────────────────────────
// Correo @g.educaand.es + contraseña. En el primer acceso el docente fija su contraseña
// (la escribe dos veces en la app). Las contraseñas se guardan con sal en las propiedades
// del script (nunca en la hoja) y las sesiones duran 6 horas, renovándose con el uso.

function error_(codigo, mensaje) {
  var e = new Error(mensaje || MENSAJES[codigo] || codigo);
  e.codigo = codigo;
  throw e;
}

function norm_(email) { return String(email || '').trim().toLowerCase(); }

function buscarProfesor_(email) {
  email = norm_(email);
  if (!email || email.slice(-DOMINIO.length) !== DOMINIO) error_('403_DOMAIN_FORBIDDEN');
  return profesorado_()[email] || null;
}

function estadoCuenta_(req) {
  var p = buscarProfesor_(req.email);
  if (!p) return { ok: true, registrado: false };
  return { ok: true, registrado: true, tieneClave: !!claveGuardada_(p.email) };
}

function login_(req) {
  var email = norm_(req.email);
  var cache = CacheService.getScriptCache();
  var intentos = parseInt(cache.get('FALLOS_' + email) || '0', 10);
  if (intentos >= MAX_INTENTOS) error_('BLOQUEADO');
  var p = buscarProfesor_(email);
  if (!p) error_('401_UNAUTHORIZED');
  var clave = String(req.clave || '');
  var guardada = claveGuardada_(email);
  var primerAcceso = false;
  if (guardada) {
    if (hashClave_(clave, guardada.sal) !== guardada.hash) {
      var n = intentos + 1;
      cache.put('FALLOS_' + email, String(n), BLOQUEO_SEG);
      var quedan = MAX_INTENTOS - n;
      error_('CLAVE_INCORRECTA', quedan > 0
        ? 'Contraseña incorrecta. Le quedan ' + quedan + ' intento(s).'
        : 'Contraseña incorrecta. Cuenta bloqueada 15 minutos.');
    }
  } else {
    validarComplejidad_(clave);
    fijarClave_(email, clave);
    primerAcceso = true;
  }
  cache.remove('FALLOS_' + email);
  return { ok: true, token: crearSesion_(email), usuario: perfilPublico_(p), primerAcceso: primerAcceso };
}

function cambiarClave_(req) {
  var u = sesion_(req.token);
  var guardada = claveGuardada_(u.email);
  if (!guardada || hashClave_(String(req.actual || ''), guardada.sal) !== guardada.hash) {
    error_('CLAVE_INCORRECTA', 'La contraseña actual no es correcta.');
  }
  validarComplejidad_(req.nueva);
  fijarClave_(u.email, String(req.nueva));
  return { ok: true };
}

/** Equipo Directivo: el docente fijará una contraseña nueva en su próximo acceso. */
function restablecerClave_(usuario, req) {
  if (!usuario.directivo) return fallo_('ERROR_SIN_PERMISO');
  var email = norm_(req.email);
  if (!profesorado_()[email]) return fallo_('401_UNAUTHORIZED');
  PropertiesService.getScriptProperties().deleteProperty('CLAVE_' + email);
  PropertiesService.getScriptProperties().setProperty('GEN_' + email, String(new Date().getTime()));
  CacheService.getScriptCache().remove('FALLOS_' + email);
  return { ok: true };
}

function listaProfesorado_(usuario) {
  if (!usuario.directivo) return fallo_('ERROR_SIN_PERMISO');
  var mapa = profesorado_();
  var horario = horario_();
  var lista = Object.keys(mapa).map(function (k) {
    var p = mapa[k];
    return { email: p.email, nombre: p.nombre, aula: p.aula, directivo: p.directivo, tieneClave: !!claveGuardada_(p.email),
      tramos: (horario[p.email] || []).length };
  });
  lista.sort(function (a, b) { return a.nombre.localeCompare(b.nombre, 'es'); });
  return { ok: true, profesorado: lista, grupos: gruposDe_(alumnado_()) };
}

/**
 * Equipo Directivo: guarda el horario leído de los PDF de Séneca (la lectura se hace en el navegador).
 * filas = [[email, dia, desde, hasta, grupo], …]. Se sustituyen solo los tramos de los docentes que
 * vienen en la petición; los demás se conservan.
 */
function guardarHorario_(usuario, req) {
  if (!usuario.directivo) return fallo_('ERROR_SIN_PERMISO');
  var profes = profesorado_();
  var grupos = gruposDe_(alumnado_());
  var nuevas = [];
  var docentes = {};
  (Array.isArray(req.filas) ? req.filas : []).slice(0, 20000).forEach(function (f) {
    if (!Array.isArray(f) || f.length < 5) return;
    var email = norm_(f[0]), dia = numeroDia_(f[1]), desde = minutosTexto_(f[2]), hasta = minutosTexto_(f[3]);
    var grupo = String(f[4] || '').trim();
    if (!profes[email] || !dia || desde === null || hasta === null || hasta <= desde || grupos.indexOf(grupo) < 0) return;
    docentes[email] = true;
    nuevas.push([email, dia, textoMinutos_(desde), textoMinutos_(hasta), grupo]);
  });
  (Array.isArray(req.docentes) ? req.docentes : []).forEach(function (e) { if (profes[norm_(e)]) docentes[norm_(e)] = true; });

  var libro = SpreadsheetApp.getActive();
  var hoja = libro.getSheetByName(HOJA_HORARIO);
  if (!hoja) {
    hoja = libro.insertSheet(HOJA_HORARIO);
    hoja.getRange(1, 1, 1, 5).setValues([CABECERAS.Horario]).setFontWeight('bold');
    hoja.setFrozenRows(1);
  }
  var conservadas = valoresDe_(HOJA_HORARIO, 5).filter(function (f) { return f[0] && !docentes[norm_(f[0])]; })
    .map(function (f) { return [norm_(f[0]), f[1], comoTextoHora_(f[2]), comoTextoHora_(f[3]), String(f[4] || '')]; });
  var todas = conservadas.concat(nuevas);
  var ultima = hoja.getLastRow();
  if (ultima > 1) hoja.getRange(2, 1, ultima - 1, 5).clearContent();
  if (todas.length) {
    hoja.getRange(2, 3, todas.length, 2).setNumberFormat('@');
    hoja.getRange(2, 1, todas.length, 5).setValues(todas);
  }
  SpreadsheetApp.flush();
  limpiarCache();
  return { ok: true, guardados: nuevas.length, docentes: Object.keys(docentes).length, total: todas.length };
}

function comoTextoHora_(v) {
  var m = minutosTexto_(v);
  return m === null ? String(v || '') : textoMinutos_(m);
}

function perfilPublico_(p) { return { email: p.email, nombre: p.nombre, aula: p.aula, directivo: p.directivo }; }

function secretoServidor_() {
  var props = PropertiesService.getScriptProperties();
  var s = props.getProperty('SECRETO_SERVIDOR');
  if (!s) {
    s = Utilities.getUuid() + Utilities.getUuid();
    props.setProperty('SECRETO_SERVIDOR', s);
  }
  return s;
}

function hashClave_(clave, sal) {
  return Utilities.base64Encode(
    Utilities.computeHmacSha256Signature(sal + '|' + clave, secretoServidor_() + sal, Utilities.Charset.UTF_8));
}

function claveGuardada_(email) {
  var r = PropertiesService.getScriptProperties().getProperty('CLAVE_' + norm_(email));
  return r ? JSON.parse(r) : null;
}

function fijarClave_(email, clave) {
  var sal = Utilities.getUuid();
  PropertiesService.getScriptProperties().setProperty('CLAVE_' + norm_(email),
    JSON.stringify({ sal: sal, hash: hashClave_(clave, sal), fecha: new Date().toISOString() }));
}

function validarComplejidad_(clave) {
  var c = String(clave || '');
  if (c.length < 6 || !/[A-Za-zÁÉÍÓÚáéíóúÑñÜü]/.test(c) || !/[0-9]/.test(c)) error_('CLAVE_DEBIL');
}

function generacion_(email) {
  return PropertiesService.getScriptProperties().getProperty('GEN_' + norm_(email)) || '0';
}

function crearSesion_(email) {
  var token = Utilities.getUuid() + Utilities.getUuid();
  CacheService.getScriptCache().put('SES_' + token, norm_(email) + '|' + generacion_(email), DURACION_SESION_SEG);
  return token;
}

function cerrarSesion_(token) {
  if (token) CacheService.getScriptCache().remove('SES_' + token);
}

/** Devuelve el docente de la sesión o lanza NO_AUTH. */
function sesion_(token) {
  if (!token) error_('NO_AUTH');
  var cache = CacheService.getScriptCache();
  var valor = cache.get('SES_' + token);
  if (!valor) error_('NO_AUTH');
  var partes = String(valor).split('|');
  if (partes[1] !== generacion_(partes[0])) { cerrarSesion_(token); error_('NO_AUTH'); }
  var p = profesorado_()[partes[0]];
  if (!p) { cerrarSesion_(token); error_('NO_AUTH', 'Su cuenta ya no tiene acceso.'); }
  cache.put('SES_' + token, valor, DURACION_SESION_SEG);
  return p;
}
// ───────────────────────── Acciones ─────────────────────────

function estado_(usuario, datos, ahora) {
  var hoy = fechaHoy_(ahora);
  var franja = franjaDe_(ahora);
  var dia = filasDelDia_(hoy);
  if (hayCaducadas_(dia, ahora)) {
    conCerrojo_(function () { dia = filasDelDia_(hoy); cerrarCaducadas_(dia, ahora); });
  }
  var filas = dia.filas;
  var alumnos = alumnado_();
  var grupos = gruposDe_(alumnos);
  // Grupo: el que ha elegido el docente; si no, el que le toca según el horario; si no, su aula asignada
  var sugerido = grupoSegunHorario_(usuario.email, ahora);
  var grupo = String(datos.grupo || '');
  if (grupos.indexOf(grupo) < 0) grupo = grupos.indexOf(sugerido) >= 0 ? sugerido : grupos.indexOf(usuario.aula) >= 0 ? usuario.aula : '';

  var activas = [];
  var salidasPorAlumno = {}; // salidas de hoy en el bloque actual
  filas.forEach(function (f) {
    if (f[H.estado] === 'ACTIVE') activas.push(salidaParaVista_(f, alumnos, usuario, ahora));
    if (f[H.estado] !== 'CANCELLED' && f[H.bloque] === franja.bloque) {
      (salidasPorAlumno[f[H.alumno]] = salidasPorAlumno[f[H.alumno]] || []).push({
        hora: horaDe_(f[H.inicio]), docente: f[H.docente], estado: f[H.estado]
      });
    }
  });

  var lista = [];
  Object.keys(alumnos).forEach(function (id) {
    var a = alumnos[id];
    if (a.aula === grupo) lista.push({ id: a.id, nombre: a.nombre, apellidos: a.apellidos, salidas: salidasPorAlumno[a.id] || [] });
  });
  lista.sort(function (x, y) { return (x.apellidos + x.nombre).localeCompare(y.apellidos + y.nombre, 'es'); });

  return {
    ok: true,
    ahora: ahora.getTime(),
    usuario: { email: usuario.email, nombre: usuario.nombre, aula: usuario.aula, directivo: usuario.directivo },
    franja: franja,
    reloj_simulado: relojSimulado_() !== null,
    cupo: { global: CUPO_GLOBAL, aula: CUPO_AULA, minutos: MINUTOS_MAXIMOS,
      min_justificacion: MIN_JUSTIFICACION, min_excepcional: MIN_JUSTIFICACION_EXCEPCIONAL },
    grupos: grupos,
    grupo: grupo,
    grupo_horario: sugerido,
    alumnos: lista,
    activas: activas
  };
}

function autorizar_(usuario, datos, ahora) {
  var franja = franjaDe_(ahora);
  if (franja.bloque === 'RECREO') return fallo_('ERROR_RECREO_ACTIVE');
  if (franja.bloque === 'FUERA') return fallo_('ERROR_FUERA_HORARIO');

  var justificacion = String(datos.justificacion || '').trim();
  var excepcional = String(datos.justificacion_excepcional || '').trim();
  if (!franja.preferente && justificacion.length < MIN_JUSTIFICACION) return fallo_('ERROR_JUSTIFICACION');

  var alumno = alumnado_()[String(datos.alumno || '')];
  if (!alumno || alumno.aula !== String(datos.grupo || '')) return fallo_('ERROR_ALUMNO_NO_ENCONTRADO');

  var hoy = fechaHoy_(ahora);
  var dia = filasDelDia_(hoy);
  cerrarCaducadas_(dia, ahora);
  var filas = dia.filas;

  var activas = filas.filter(function (f) { return f[H.estado] === 'ACTIVE'; });
  if (activas.some(function (f) { return f[H.alumno] === alumno.id; })) return fallo_('ERROR_ALUMNO_YA_FUERA');
  if (activas.length >= CUPO_GLOBAL) return fallo_('ERROR_GLOBAL_LIMIT_REACHED', { activas: activas.length });
  if (activas.filter(function (f) { return f[H.aula] === alumno.aula; }).length >= CUPO_AULA) {
    return fallo_('ERROR_CLASSROOM_LIMIT_REACHED');
  }

  var previas = filas.filter(function (f) {
    return f[H.alumno] === alumno.id && f[H.bloque] === franja.bloque && f[H.estado] !== 'CANCELLED';
  });
  var esExcepcional = previas.length > 0;
  if (esExcepcional && excepcional.length < MIN_JUSTIFICACION_EXCEPCIONAL) {
    var ultima = previas[previas.length - 1];
    return {
      ok: false, codigo: 'DUPLICADO', is_duplicate: true,
      previous_teacher: ultima[H.docente], time: horaDe_(ultima[H.inicio]), veces: previas.length,
      mensaje: 'Este alumno ya salió en este bloque a las ' + horaDe_(ultima[H.inicio]) + ' (autorizó ' + ultima[H.docente] + ').'
    };
  }

  var fila = [];
  for (var i = 0; i < N_COLUMNAS; i++) fila.push('');
  fila[H.id] = 'ext_' + Utilities.getUuid().replace(/-/g, '').slice(0, 12);
  fila[H.fecha] = hoy;
  fila[H.alumno] = alumno.id;
  fila[H.aula] = alumno.aula;
  fila[H.docente] = usuario.email;
  fila[H.inicio] = ahora;
  fila[H.bloque] = franja.bloque;
  fila[H.preferente] = franja.preferente;
  fila[H.justificacion] = justificacion || 'Salida regular';
  fila[H.excepcional] = esExcepcional;
  fila[H.justificacion_excepcional] = esExcepcional ? excepcional : 'N/A';
  fila[H.estado] = 'ACTIVE';

  var hoja = hoja_(HOJA_HISTORICO);
  hoja.getRange(hoja.getLastRow() + 1, 1, 1, N_COLUMNAS).setValues([fila]);
  SpreadsheetApp.flush();
  return { ok: true, exit_id: fila[H.id], is_override: esExcepcional, activas: activas.length + 1 };
}

function regreso_(usuario, datos, ahora) {
  var dia = filasDelDia_(fechaHoy_(ahora));
  var i = indiceActiva_(dia, datos.exit_id);
  if (i < 0) return fallo_('ERROR_SALIDA_NO_ENCONTRADA');
  var f = dia.filas[i];
  var segundos = Math.max(0, Math.round((ahora.getTime() - comoFecha_(f[H.inicio]).getTime()) / 1000));
  escribirCierre_(dia.primeraFila + i, ahora, 'COMPLETED', usuario.email);
  SpreadsheetApp.flush();
  return { ok: true, duration_seconds: segundos };
}

function anular_(usuario, datos, ahora) {
  var dia = filasDelDia_(fechaHoy_(ahora));
  var i = indiceActiva_(dia, datos.exit_id);
  if (i < 0) return fallo_('ERROR_SALIDA_NO_ENCONTRADA');
  var f = dia.filas[i];
  var minutos = (ahora.getTime() - comoFecha_(f[H.inicio]).getTime()) / 60000;
  if (f[H.docente] !== usuario.email || minutos > MINUTOS_PARA_ANULAR) return fallo_('ERROR_NO_SE_PUEDE_ANULAR');
  escribirCierre_(dia.primeraFila + i, ahora, 'CANCELLED', usuario.email);
  SpreadsheetApp.flush();
  return { ok: true };
}

function historico_(usuario, datos, ahora) {
  if (!usuario.directivo) return fallo_('ERROR_SIN_PERMISO');
  var fecha = /^\d{4}-\d{2}-\d{2}$/.test(String(datos.fecha || '')) ? datos.fecha : fechaHoy_(ahora);
  var alumnos = alumnado_();
  var salidas = filasDelDia_(fecha).filas.map(function (f) { return salidaParaVista_(f, alumnos, usuario, ahora); });
  return { ok: true, fecha: fecha, salidas: salidas, url_hoja: SpreadsheetApp.getActive().getUrl() };
}

// ───────────────────────── Reglas de horario ─────────────────────────

/** Devuelve la franja de un instante: { bloque: BLOCK_1 | BLOCK_2 | RECREO | FUERA, preferente, nombre, hasta } */
function franjaDe_(fecha) {
  var diaSemana = Number(Utilities.formatDate(fecha, ZONA, 'u')); // 1 = lunes … 7 = domingo
  var p = Utilities.formatDate(fecha, ZONA, 'HH:mm').split(':');
  var min = Number(p[0]) * 60 + Number(p[1]);
  if (diaSemana <= 5) {
    for (var i = 0; i < FRANJAS.length; i++) {
      var f = FRANJAS[i];
      if (min >= f.desde && min < f.hasta) {
        return { bloque: f.bloque, preferente: f.preferente, nombre: f.nombre, desde: textoMinutos_(f.desde), hasta: textoMinutos_(f.hasta) };
      }
    }
  }
  return { bloque: 'FUERA', preferente: false, nombre: 'Fuera de la jornada lectiva', desde: '', hasta: '' };
}

/**
 * Cierra como NO_RETURN las salidas activas de un bloque que ya ha terminado (nadie marcó el regreso),
 * para que no bloqueen el cupo. Modifica también las filas en memoria.
 */
function cerrarCaducadas_(dia, ahora) {
  dia.filas.forEach(function (f, i) {
    if (caducada_(f, ahora)) {
      var fin = FIN_BLOQUE[f[H.bloque]];
      var cierre = instanteDelDia_(comoFecha_(f[H.inicio]), fin);
      escribirCierre_(dia.primeraFila + i, cierre, 'NO_RETURN', 'SISTEMA');
      f[H.estado] = 'NO_RETURN';
      f[H.fin] = cierre;
    }
  });
}

function caducada_(f, ahora) {
  var fin = FIN_BLOQUE[f[H.bloque]];
  return f[H.estado] === 'ACTIVE' && fin !== undefined && minutosDe_(ahora) >= fin;
}

function hayCaducadas_(dia, ahora) {
  return dia.filas.some(function (f) { return caducada_(f, ahora); });
}

// ───────────────────────── Acceso a la hoja ─────────────────────────

function hoja_(nombre) {
  var h = SpreadsheetApp.getActive().getSheetByName(nombre);
  if (!h) throw new Error('Falta la pestaña "' + nombre + '". Ejecute configurarHoja desde el editor.');
  return h;
}

/**
 * Lee las filas de un día de Historico_Salidas. Las filas se añaden en orden, así que se leen bloques
 * desde el final hasta encontrar un día anterior (nunca se lee el histórico entero ni celda a celda).
 */
function filasDelDia_(fecha) {
  var hoja = hoja_(HOJA_HISTORICO);
  var ultima = hoja.getLastRow();
  var filas = [];
  var primeraFila = ultima + 1;
  var hasta = ultima;
  while (hasta >= 2) {
    var desde = Math.max(2, hasta - FILAS_POR_LECTURA + 1);
    var valores = hoja.getRange(desde, 1, hasta - desde + 1, N_COLUMNAS).getValues();
    var anterior = false;
    for (var i = valores.length - 1; i >= 0; i--) {
      var f = valores[i];
      var fechaFila = comoTextoFecha_(f[H.fecha]);
      if (fechaFila === fecha) {
        f[H.fecha] = fechaFila;
        f[H.estado] = String(f[H.estado]);
        f[H.alumno] = String(f[H.alumno]);
        f[H.aula] = String(f[H.aula]);
        f[H.docente] = String(f[H.docente]).toLowerCase();
        filas.unshift(f);
        primeraFila = desde + i;
      } else if (fechaFila && fechaFila < fecha) {
        anterior = true;
        break;
      }
    }
    if (anterior) break;
    hasta = desde - 1;
  }
  return { filas: filas, primeraFila: primeraFila };
}

function indiceActiva_(dia, id) {
  for (var i = 0; i < dia.filas.length; i++) {
    if (dia.filas[i][H.id] === id && dia.filas[i][H.estado] === 'ACTIVE') return i;
  }
  return -1;
}

/** Escribe end_time … closed_by de una salida (columnas G y M:N). */
function escribirCierre_(numeroFila, fin, estado, quien) {
  var hoja = hoja_(HOJA_HISTORICO);
  hoja.getRange(numeroFila, H.fin + 1, 1, 1).setValues([[fin]]);
  hoja.getRange(numeroFila, H.estado + 1, 1, 2).setValues([[estado, quien]]);
}

function profesorado_() {
  return conCache_('GBCS_PROFESORADO', function () {
    var datos = valoresDe_(HOJA_PROFESORADO, 5);
    var mapa = {};
    datos.forEach(function (f) {
      var email = String(f[1] || '').trim().toLowerCase();
      if (!email) return;
      mapa[email] = {
        id: String(f[0] || ''), email: email, nombre: String(f[2] || email),
        aula: String(f[3] || '').trim(), directivo: String(f[4] || '').trim().toUpperCase() === 'DIRECTIVO'
      };
    });
    return mapa;
  });
}

function alumnado_() {
  return conCache_('GBCS_ALUMNADO', function () {
    var datos = valoresDe_(HOJA_ALUMNADO, 5);
    var mapa = {};
    datos.forEach(function (f) {
      var id = String(f[0] || '').trim();
      var activo = f[4] === true || String(f[4]).toUpperCase() === 'TRUE' || String(f[4]).toUpperCase() === 'VERDADERO';
      if (!id || !activo) return;
      mapa[id] = { id: id, nombre: String(f[1] || ''), apellidos: String(f[2] || ''), aula: String(f[3] || '').trim() };
    });
    return mapa;
  });
}

/** Grupo que tiene el docente a esa hora según la pestaña Horario (vacío si no hay horario). */
function grupoSegunHorario_(email, ahora) {
  var horario = horario_();
  var dia = Number(Utilities.formatDate(ahora, ZONA, 'u'));
  var min = minutosDe_(ahora);
  var tramos = horario[norm_(email)] || [];
  for (var i = 0; i < tramos.length; i++) {
    if (tramos[i][0] === dia && min >= tramos[i][1] && min < tramos[i][2]) return tramos[i][3];
  }
  return '';
}

/** { email: [[dia, desdeMin, hastaMin, grupo], …] } */
function horario_() {
  return conCache_('GBCS_HORARIO', function () {
    var libro = SpreadsheetApp.getActive();
    if (!libro.getSheetByName(HOJA_HORARIO)) return {};
    var porDocente = {};
    valoresDe_(HOJA_HORARIO, 5).forEach(function (f) {
      var e = norm_(f[0]), dia = numeroDia_(f[1]), desde = minutosTexto_(f[2]), hasta = minutosTexto_(f[3]);
      var grupo = String(f[4] || '').trim();
      if (!e || !dia || desde === null || hasta === null || !grupo) return;
      (porDocente[e] = porDocente[e] || []).push([dia, desde, hasta, grupo]);
    });
    return porDocente;
  });
}

function numeroDia_(v) {
  var t = String(v || '').trim().toUpperCase().charAt(0);
  var letras = { L: 1, M: 2, X: 3, J: 4, V: 5 };
  if (letras[t]) return letras[t];
  var n = Number(t);
  return n >= 1 && n <= 5 ? n : 0;
}

/** Minutos desde las 00:00 de "08:30", "8:30" o una hora de la hoja (Date). */
function minutosTexto_(v) {
  if (v instanceof Date) return minutosDe_(v);
  var m = /^(\d{1,2})[:.](\d{2})/.exec(String(v || '').trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

function valoresDe_(nombre, columnas) {
  var hoja = hoja_(nombre);
  var ultima = hoja.getLastRow();
  if (ultima < 2) return [];
  return hoja.getRange(2, 1, ultima - 1, columnas).getValues();
}

function gruposDe_(alumnos) {
  var vistos = {};
  Object.keys(alumnos).forEach(function (id) { if (alumnos[id].aula) vistos[alumnos[id].aula] = true; });
  return Object.keys(vistos).sort(ordenGrupos_);
}

/** Ordena 1ESO_A … 4ESO_D, 1BACH_A … y después ciclos, igual que en convivencia. */
function ordenGrupos_(a, b) {
  var peso = function (g) {
    if (/ESO/.test(g)) return 1;
    if (/BACH/.test(g)) return 2;
    return 3;
  };
  return peso(a) - peso(b) || a.localeCompare(b, 'es');
}

// ───────────────────────── Caché ─────────────────────────

/** Guarda en CacheService en trozos de 90 KB (el límite por clave es 100 KB). */
function conCache_(clave, calcular) {
  var cache = CacheService.getScriptCache();
  var n = cache.get(clave + '_N');
  if (n) {
    var claves = [];
    for (var i = 0; i < Number(n); i++) claves.push(clave + '_' + i);
    var trozos = cache.getAll(claves);
    if (claves.every(function (k) { return trozos[k] !== undefined && trozos[k] !== null; })) {
      return JSON.parse(claves.map(function (k) { return trozos[k]; }).join(''));
    }
  }
  var valor = calcular();
  var texto = JSON.stringify(valor);
  var pares = {};
  var total = Math.ceil(texto.length / 90000) || 1;
  for (var j = 0; j < total; j++) pares[clave + '_' + j] = texto.slice(j * 90000, (j + 1) * 90000);
  pares[clave + '_N'] = String(total);
  cache.putAll(pares, CACHE_TTL);
  return valor;
}

/** Ejecutar desde el editor después de cambiar Profesorado o Alumnado a mano (también se hace solo al editar). */
function limpiarCache() {
  CacheService.getScriptCache().removeAll(['GBCS_PROFESORADO_N', 'GBCS_ALUMNADO_N', 'GBCS_HORARIO_N']);
}

/** Disparador simple: al editar Profesorado o Alumnado se descarta la caché. */
function onEdit(e) {
  var nombre = e && e.range && e.range.getSheet().getName();
  if (nombre === HOJA_PROFESORADO || nombre === HOJA_ALUMNADO || nombre === HOJA_HORARIO) limpiarCache();
}

// ───────────────────────── Funciones de editor ─────────────────────────

/** Reloj simulado: { real, ficticio } en milisegundos, o null si está apagado. */
function relojSimulado_() {
  var v = PropertiesService.getScriptProperties().getProperty('RELOJ_PRUEBAS');
  return v ? JSON.parse(v) : null;
}

function ahoraServidor_() {
  var r = relojSimulado_();
  var ahora = new Date();
  return r ? new Date(r.ficticio + (ahora.getTime() - r.real)) : ahora;
}

/**
 * SOLO EN PRUEBAS: la app funciona como si fuera el día y la hora de INICIO_RELOJ_PRUEBAS
 * (y el reloj avanza desde ahí). Para volver a la hora real: desactivarModoPruebas.
 */
function activarModoPruebas() {
  var m = /^(\d{4}-\d{2}-\d{2}) (\d{1,2}):(\d{2})$/.exec(INICIO_RELOJ_PRUEBAS);
  if (!m) throw new Error('INICIO_RELOJ_PRUEBAS debe tener la forma "2026-10-23 09:25".');
  // Instante de Madrid: se parte de las 12:00 UTC de ese día y se corrige con la hora que marca Madrid
  var base = new Date(m[1] + 'T12:00:00Z');
  var ficticio = base.getTime() + ((Number(m[2]) * 60 + Number(m[3])) - minutosDe_(base)) * 60000;
  PropertiesService.getScriptProperties().setProperty('RELOJ_PRUEBAS',
    JSON.stringify({ real: new Date().getTime(), ficticio: ficticio }));
  Logger.log('Modo pruebas activado: la app cree que es ' + Utilities.formatDate(new Date(ficticio), ZONA, 'EEEE dd/MM/yyyy HH:mm'));
}

function desactivarModoPruebas() {
  PropertiesService.getScriptProperties().deleteProperty('RELOJ_PRUEBAS');
  Logger.log('Modo pruebas desactivado: la app vuelve a la hora real.');
}

/** Crea las tres pestañas con sus cabeceras si no existen. No borra nada. */
function configurarHoja() {
  var libro = SpreadsheetApp.getActive();
  libro.setSpreadsheetTimeZone(ZONA);
  Object.keys(CABECERAS).forEach(function (nombre) {
    var hoja = libro.getSheetByName(nombre) || libro.insertSheet(nombre);
    var cab = CABECERAS[nombre];
    if (hoja.getLastRow() === 0) {
      hoja.getRange(1, 1, 1, cab.length).setValues([cab]).setFontWeight('bold');
      hoja.setFrozenRows(1);
    }
    if (nombre === HOJA_HISTORICO) hoja.getRange('B:B').setNumberFormat('@');
  });
  limpiarCache();
  secretoServidor_();
  Logger.log('Hoja preparada (zona horaria ' + libro.getSpreadsheetTimeZone() + ').');
}

/** Cierra a mano todas las salidas que sigan activas de días anteriores o de bloques ya terminados. */
function cerrarSalidasAbiertas() {
  var lock = LockService.getScriptLock();
  lock.waitLock(ESPERA_CERROJO_MS);
  try {
    var dia = filasDelDia_(fechaHoy_(new Date()));
    cerrarCaducadas_(dia, new Date());
    var hoja = hoja_(HOJA_HISTORICO);
    var ultima = hoja.getLastRow();
    if (ultima < 2) return;
    var estados = hoja.getRange(2, H.estado + 1, ultima - 1, 1).getValues();
    var fechas = hoja.getRange(2, H.fecha + 1, ultima - 1, 1).getValues();
    var hoy = fechaHoy_(new Date());
    var cerradas = 0;
    estados.forEach(function (e, i) {
      if (e[0] === 'ACTIVE' && comoTextoFecha_(fechas[i][0]) < hoy) {
        escribirCierre_(i + 2, new Date(), 'NO_RETURN', 'SISTEMA');
        cerradas++;
      }
    });
    SpreadsheetApp.flush();
    Logger.log('Salidas de días anteriores cerradas: ' + cerradas);
  } finally {
    lock.releaseLock();
  }
}

// ───────────────────────── Utilidades ─────────────────────────

function conCerrojo_(fn) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(ESPERA_CERROJO_MS);
  } catch (e) {
    return fallo_('ERROR_OCUPADO');
  }
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

function fallo_(codigo, extra, mensaje) {
  var r = { ok: false, codigo: codigo, mensaje: mensaje || MENSAJES[codigo] || codigo };
  if (extra) Object.keys(extra).forEach(function (k) { r[k] = extra[k]; });
  return r;
}

function codigoDeError_(err) { return String(err && err.message || err); }

function salidaParaVista_(f, alumnos, usuario, ahora) {
  var a = alumnos[f[H.alumno]] || { nombre: '', apellidos: '(alumno dado de baja)' };
  var inicio = comoFecha_(f[H.inicio]);
  var fin = f[H.fin] ? comoFecha_(f[H.fin]) : null;
  return {
    exit_id: f[H.id], alumno: f[H.alumno], nombre: a.nombre, apellidos: a.apellidos, grupo: f[H.aula],
    docente: f[H.docente], inicio: inicio.getTime(), fin: fin ? fin.getTime() : null,
    hora: horaDe_(inicio), hora_fin: fin ? horaDe_(fin) : '',
    bloque: f[H.bloque], preferente: f[H.preferente] === true, justificacion: String(f[H.justificacion] || ''),
    excepcional: f[H.excepcional] === true, justificacion_excepcional: String(f[H.justificacion_excepcional] || ''),
    estado: f[H.estado], cerrado_por: String(f[H.cerrado_por] || ''),
    puede_anular: f[H.estado] === 'ACTIVE' && f[H.docente] === usuario.email &&
      (ahora.getTime() - inicio.getTime()) / 60000 <= MINUTOS_PARA_ANULAR
  };
}

function fechaHoy_(fecha) { return Utilities.formatDate(fecha, ZONA, 'yyyy-MM-dd'); }
function horaDe_(fecha) { return Utilities.formatDate(comoFecha_(fecha), ZONA, 'HH:mm'); }
function comoFecha_(v) { return v instanceof Date ? v : new Date(v); }
function comoTextoFecha_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, ZONA, 'yyyy-MM-dd');
  return String(v || '').slice(0, 10);
}
function minutosDe_(fecha) {
  var p = Utilities.formatDate(fecha, ZONA, 'HH:mm').split(':');
  return Number(p[0]) * 60 + Number(p[1]);
}
function textoMinutos_(m) { return ('0' + Math.floor(m / 60)).slice(-2) + ':' + ('0' + (m % 60)).slice(-2); }

/** El instante de ese mismo día (hora de Madrid) a los minutos indicados. */
function instanteDelDia_(fecha, minutos) {
  return new Date(fecha.getTime() + (minutos - minutosDe_(fecha)) * 60000 - Number(Utilities.formatDate(fecha, ZONA, 's')) * 1000);
}
