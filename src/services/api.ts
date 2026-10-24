/**
 * Comunicación con el servidor (Google Apps Script), igual que en convivencia:
 * POST con el cuerpo en texto plano (sin consulta previa CORS) y respuesta JSON.
 */
import { URL_API } from '../config/entorno';

export const EVENTO_SESION_CADUCADA = 'gbcs-sesion-caducada';
const CLAVE_TOKEN = 'gbcs_token';

export interface Respuesta {
  ok: boolean;
  codigo?: string;
  mensaje?: string;
  [clave: string]: any;
}

export function tokenGuardado(): string {
  try { return sessionStorage.getItem(CLAVE_TOKEN) || ''; } catch { return ''; }
}

export function guardarToken(t: string) {
  try { if (t) sessionStorage.setItem(CLAVE_TOKEN, t); else sessionStorage.removeItem(CLAVE_TOKEN); } catch { /* sin almacenamiento */ }
}

export async function llamarApi<T = Respuesta>(accion: string, datos: Record<string, unknown> = {}, timeoutMs = 20000): Promise<T & Respuesta> {
  if (!URL_API) {
    return { ok: false, codigo: 'SIN_SERVIDOR', mensaje: 'La app aún no está conectada a su servidor (falta la URL en src/config/entorno.ts).' } as T & Respuesta;
  }
  for (let intento = 1; intento <= 2; intento++) {
    const r = await unaVez(accion, datos, timeoutMs);
    // A veces Google devuelve una página de error intermedia: se repite una vez
    if (r.codigo === 'RESPUESTA_INVALIDA' && intento === 1) { await new Promise((res) => setTimeout(res, 1500)); continue; }
    if (!r.ok && r.codigo === 'NO_AUTH') window.dispatchEvent(new CustomEvent(EVENTO_SESION_CADUCADA, { detail: r.mensaje }));
    return r as T & Respuesta;
  }
  return { ok: false, codigo: 'RESPUESTA_INVALIDA' } as T & Respuesta;
}

async function unaVez(accion: string, datos: Record<string, unknown>, timeoutMs: number): Promise<Respuesta> {
  const control = new AbortController();
  const temporizador = setTimeout(() => control.abort(), timeoutMs);
  try {
    const respuesta = await fetch(URL_API, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ accion, token: tokenGuardado(), ...datos }),
      signal: control.signal,
      cache: 'no-store',
    });
    const texto = await respuesta.text();
    try {
      return JSON.parse(texto);
    } catch {
      return { ok: false, codigo: 'RESPUESTA_INVALIDA', mensaje: 'El servidor ha devuelto una respuesta no válida (HTTP ' + respuesta.status + '). Vuelva a intentarlo.' };
    }
  } catch (e: any) {
    return {
      ok: false,
      codigo: 'SIN_CONEXION',
      mensaje: e && e.name === 'AbortError'
        ? 'El servidor ha tardado demasiado en responder.'
        : 'No se ha podido conectar con el servidor. Compruebe la conexión a Internet.',
    };
  } finally {
    clearTimeout(temporizador);
  }
}
