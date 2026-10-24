/**
 * Simulador de Google Apps Script para probar servidor/Code.gs en Node sin tocar Google:
 * hoja de cálculo en memoria, caché, propiedades, cerrojo y utilidades con hora de Madrid.
 * Solo datos ficticios.
 */
import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';

class Rango {
  constructor(hoja, fila, col, nf, nc) { Object.assign(this, { hoja, fila, col, nf, nc }); }
  getValues() {
    const out = [];
    for (let i = 0; i < this.nf; i++) {
      const f = this.hoja.datos[this.fila - 1 + i] || [];
      const r = [];
      for (let j = 0; j < this.nc; j++) { const v = f[this.col - 1 + j]; r.push(v === undefined ? '' : v); }
      out.push(r);
    }
    this.hoja.lecturas++;
    return out;
  }
  setValues(v) {
    if (v.length !== this.nf || v[0].length !== this.nc) throw new Error('setValues: tamaño incorrecto');
    v.forEach((f, i) => {
      const n = this.fila - 1 + i;
      while (this.hoja.datos.length <= n) this.hoja.datos.push([]);
      f.forEach((x, j) => { this.hoja.datos[n][this.col - 1 + j] = x instanceof Date ? new Date(x) : x; });
    });
    this.hoja.escrituras++;
    return this;
  }
  clearContent() {
    for (let i = 0; i < this.nf; i++) {
      const f = this.hoja.datos[this.fila - 1 + i];
      if (f) for (let j = 0; j < this.nc; j++) f[this.col - 1 + j] = '';
    }
    return this;
  }
  setFontWeight() { return this; }
  setNumberFormat() { return this; }
}

class Hoja {
  constructor(nombre, datos = []) { this.nombre = nombre; this.datos = datos; this.lecturas = 0; this.escrituras = 0; }
  getName() { return this.nombre; }
  getLastRow() {
    let n = this.datos.length;
    while (n > 0 && !(this.datos[n - 1] || []).some((v) => v !== '' && v !== undefined && v !== null)) n--;
    return n;
  }
  getRange(a, b, c, d) {
    if (typeof a === 'string') return new Rango(this, 1, 2, 1, 1);
    return new Rango(this, a, b, c || 1, d || 1);
  }
  setFrozenRows() {}
}

function formatear(fecha, zona, patron) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: zona, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    second: '2-digit', weekday: 'short', hourCycle: 'h23'
  }).formatToParts(fecha).map((x) => [x.type, x.value]));
  const dias = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
  return patron.replace(/yyyy|MM|dd|HH|mm|ss|s|u/g, (t) => ({
    yyyy: p.year, MM: p.month, dd: p.day, HH: p.hour, mm: p.minute, ss: p.second, s: String(Number(p.second)), u: String(dias[p.weekday])
  })[t]);
}

export function crearEntorno(pestanas) {
  const hojas = {};
  for (const [nombre, datos] of Object.entries(pestanas)) hojas[nombre] = new Hoja(nombre, datos);
  let cache = {};
  const props = {};
  const libro = {
    getSheetByName: (n) => hojas[n] || null,
    insertSheet: (n) => (hojas[n] = new Hoja(n)),
    getUrl: () => 'https://docs.google.com/spreadsheets/d/ficticia',
    setSpreadsheetTimeZone() {},
    getSpreadsheetTimeZone: () => 'Europe/Madrid',
  };
  let cerrojoOcupado = false;
  const ctx = {
    console: { error() {}, log: console.log },
    Logger: { log() {} },
    SpreadsheetApp: { getActive: () => libro, flush() {} },
    CacheService: { getScriptCache: () => ({
      get: (k) => (k in cache ? cache[k] : null),
      getAll: (ks) => Object.fromEntries(ks.filter((k) => k in cache).map((k) => [k, cache[k]])),
      put: (k, v) => { cache[k] = String(v); },
      putAll: (o) => { for (const k in o) cache[k] = String(o[k]); },
      remove: (k) => { delete cache[k]; },
      removeAll: (ks) => ks.forEach((k) => delete cache[k]),
    }) },
    PropertiesService: { getScriptProperties: () => ({
      getProperty: (k) => (k in props ? props[k] : null),
      setProperty: (k, v) => { props[k] = String(v); },
      deleteProperty: (k) => { delete props[k]; },
    }) },
    LockService: { getScriptLock: () => ({
      waitLock() { if (cerrojoOcupado) throw new Error('timeout'); cerrojoOcupado = true; },
      releaseLock() { cerrojoOcupado = false; },
    }) },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (t) => ({ texto: t, setMimeType() { return this; } }) },
    Utilities: {
      formatDate: formatear,
      getUuid: () => crypto.randomUUID(),
      base64Encode: (b) => Buffer.from(b).toString('base64'),
      computeHmacSha256Signature: (v, k) => [...crypto.createHmac('sha256', k).update(v).digest()],
      Charset: { UTF_8: 'utf8' },
    },
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(new URL('../servidor/Code.gs', import.meta.url), 'utf8'), ctx, { filename: 'Code.gs' });
  return {
    ctx, hojas, props,
    vaciarCache: () => { cache = {}; },
    ocuparCerrojo: (v) => { cerrojoOcupado = v; },
    /** Petición como la que manda la app, a una hora concreta. */
    pedir: (req, ahora) => JSON.parse(JSON.stringify(ctx.atender_(JSON.parse(JSON.stringify(req)), ahora || new Date()))),
  };
}

/** Instante en hora de Madrid. octubre → UTC+2 (horario de verano hasta el 25/10/2026). */
export function madrid(fecha, hora) {
  const d = new Date(fecha + 'T' + hora + ':00Z');
  const desfase = Number(formatear(d, 'Europe/Madrid', 'HH')) - d.getUTCHours();
  return new Date(d.getTime() - (((desfase + 24) % 24) * 3600000));
}
