export interface Usuario {
  email: string;
  nombre: string;
  aula: string;
  directivo: boolean;
}

export interface Franja {
  bloque: 'BLOCK_1' | 'BLOCK_2' | 'RECREO' | 'FUERA';
  preferente: boolean;
  nombre: string;
  desde: string;
  hasta: string;
}

export interface Salida {
  exit_id: string;
  alumno: string;
  nombre: string;
  apellidos: string;
  grupo: string;
  docente: string;
  inicio: number;
  fin: number | null;
  hora: string;
  hora_fin: string;
  bloque: string;
  preferente: boolean;
  justificacion: string;
  excepcional: boolean;
  justificacion_excepcional: string;
  estado: 'ACTIVE' | 'COMPLETED' | 'CANCELLED' | 'NO_RETURN';
  cerrado_por: string;
  puede_anular: boolean;
}

export interface AlumnoGrupo {
  id: string;
  nombre: string;
  apellidos: string;
  salidas: { hora: string; docente: string; estado: string }[];
}

export interface Estado {
  ok: true;
  ahora: number;
  usuario: Usuario;
  franja: Franja;
  reloj_simulado: boolean;
  cupo: { global: number; aula: number; minutos: number; min_justificacion: number; min_excepcional: number };
  grupos: string[];
  grupo: string;
  grupo_horario: string;
  alumnos: AlumnoGrupo[];
  activas: Salida[];
}

/** "1ESO_A" → "1º ESO A", "2_FRIO" → "2º FRIO" (mismos códigos que convivencia). */
export function etiquetaGrupo(g: string): string {
  let m = /^(\d)(ESO|BACH)_([A-Z])$/.exec(g);
  if (m) return m[1] + 'º ' + m[2] + ' ' + m[3];
  m = /^(\d)_(.+)$/.exec(g);
  if (m) return m[1] + 'º ' + m[2];
  return g;
}
