/**
 * Configuración del entorno, igual que en la app de convivencia.
 *
 * PRUEBAS: hoja de cálculo con alumnado ficticio en la cuenta de Miguel Ángel.
 * PRODUCCION: hoja de cálculo del centro (14007180.aplicaciones@g.educaand.es).
 * La dirección del servidor (urlApi) es la de la implementación de Apps Script de cada hoja.
 */

export type Entorno = 'PRUEBAS' | 'PRODUCCION';

export const ENTORNO: Entorno = 'PRUEBAS' as Entorno; // 'PRUEBAS' o 'PRODUCCION'

const CONFIG: Record<Entorno, { urlApi: string; cuenta: string }> = {
  PRUEBAS: {
    urlApi: '', // pegar aquí la URL /exec de la implementación de pruebas
    cuenta: 'mgonruz857@g.educaand.es',
  },
  PRODUCCION: {
    urlApi: '', // pegar aquí la URL /exec de la implementación del centro
    cuenta: '14007180.aplicaciones@g.educaand.es',
  },
};

export const ES_ENTORNO_PRUEBAS = ENTORNO === 'PRUEBAS';
/** En desarrollo local se puede apuntar a otro servidor con VITE_URL_API (p. ej. el simulador). */
export const URL_API: string = import.meta.env.VITE_URL_API || CONFIG[ENTORNO].urlApi;
export const CUENTA_DATOS = CONFIG[ENTORNO].cuenta;
