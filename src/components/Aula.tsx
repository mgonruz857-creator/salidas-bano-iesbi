import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CalendarClock, Search, Timer, Undo2, UserCheck } from 'lucide-react';
import { llamarApi } from '../services/api';
import { etiquetaGrupo, type AlumnoGrupo, type Estado, type Salida, type Usuario } from '../tipos';
import DialogoSalida from './DialogoSalida';

interface Props {
  usuario: Usuario;
  avisar: (texto: string, error?: boolean) => void;
}

const CLAVE_GRUPO = 'gbcs_grupo';
const REFRESCO_MS = 15000;

export default function Aula({ usuario, avisar }: Props) {
  const [estado, setEstado] = useState<Estado | null>(null);
  const [error, setError] = useState('');
  const [buscar, setBuscar] = useState('');
  const [seleccionado, setSeleccionado] = useState<AlumnoGrupo | null>(null);
  const [ocupado, setOcupado] = useState<string>('');
  const [, setTic] = useState(0);
  // Grupo elegido a mano en esta sesión; vacío = el que toca según el horario
  const grupoElegido = useRef<string>(leerGrupo());
  const desfase = useRef(0);
  const abierto = useRef(false);
  abierto.current = !!seleccionado;

  const cargar = useCallback(async () => {
    const r = await llamarApi<Estado>('estado', { grupo: grupoElegido.current });
    if (!r.ok) { if (r.codigo !== 'NO_AUTH') setError(r.mensaje || 'No se pudo cargar.'); return; }
    desfase.current = r.ahora - Date.now();
    setError('');
    setEstado(r);
  }, []);

  useEffect(() => {
    cargar();
    const refresco = setInterval(() => { if (!document.hidden && !abierto.current) cargar(); }, REFRESCO_MS);
    const reloj = setInterval(() => setTic((t) => t + 1), 1000);
    const visible = () => { if (!document.hidden) cargar(); };
    document.addEventListener('visibilitychange', visible);
    return () => { clearInterval(refresco); clearInterval(reloj); document.removeEventListener('visibilitychange', visible); };
  }, [cargar]);

  const fueraPorAlumno = useMemo(() => {
    const m: Record<string, Salida> = {};
    estado?.activas.forEach((s) => { m[s.alumno] = s; });
    return m;
  }, [estado]);

  if (!estado) {
    return <div className="text-center text-slate-500 py-16">{error || 'Cargando…'}</div>;
  }

  const ahora = Date.now() + desfase.current;
  const { franja, cupo, activas } = estado;
  const lleno = activas.length >= cupo.global;
  const q = normalizar(buscar);
  const alumnos = estado.alumnos.filter((a) => !q || normalizar(a.apellidos + ' ' + a.nombre).includes(q));

  function cambiarGrupo(g: string) {
    grupoElegido.current = g;
    try { sessionStorage.setItem(CLAVE_GRUPO, g); } catch { /* nada */ }
    setBuscar('');
    cargar();
  }

  async function regreso(s: Salida) {
    setOcupado(s.exit_id);
    const r = await llamarApi<{ duration_seconds: number }>('regreso', { exit_id: s.exit_id });
    setOcupado('');
    if (r.ok) avisar(s.nombre + ' ha vuelto (' + duracion(r.duration_seconds) + ').');
    else avisar(r.mensaje || 'No se pudo registrar el regreso.', true);
    cargar();
  }

  async function anular(s: Salida) {
    if (!confirm('¿Anular la salida de ' + s.nombre + '? Úselo solo si se autorizó por error.')) return;
    setOcupado(s.exit_id);
    const r = await llamarApi('anular', { exit_id: s.exit_id });
    setOcupado('');
    avisar(r.ok ? 'Salida anulada.' : r.mensaje || 'No se pudo anular.', !r.ok);
    cargar();
  }

  return (
    <div className="space-y-4">
      {error && <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl p-3">{error}</p>}
      {estado.reloj_simulado && (
        <p className="text-xs font-semibold text-amber-900 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
          Modo pruebas: la app usa un reloj simulado ({new Date(ahora).toLocaleString('es-ES', { timeZone: 'Europe/Madrid', weekday: 'long', hour: '2-digit', minute: '2-digit' })}).
        </p>
      )}

      {/* Franja actual y cupo del centro */}
      <section className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-wrap items-center gap-4 justify-between">
        <div className="flex items-start gap-3">
          <CalendarClock className="w-5 h-5 text-sky-600 mt-0.5 shrink-0" />
          <div>
            <ChipFranja franja={franja} />
            <p className="text-xs text-slate-500 mt-1.5">
              {franja.bloque === 'RECREO' ? 'De 11:30 a 12:00' :
                franja.bloque === 'FUERA' ? 'Lunes a viernes, de 08:30 a 15:00' :
                  (franja.bloque === 'BLOCK_1' ? 'Bloque 1' : 'Bloque 2') + ' · de ' + franja.desde + ' a ' + franja.hasta +
                  ' · máximo 1 salida por alumno en el bloque'}
            </p>
          </div>
        </div>
        <div className="text-center" aria-label={'Fuera en todo el centro: ' + activas.length + ' de ' + cupo.global}>
          <div className={'text-3xl font-extrabold tabular-nums leading-none ' + (lleno ? 'text-red-600' : 'text-slate-900')}>
            {activas.length}/{cupo.global}
          </div>
          <div className="flex gap-1 justify-center mt-1.5">
            {Array.from({ length: cupo.global }, (_, i) => (
              <span key={i} className={'w-3 h-3 rounded-full ' + (i < activas.length ? (lleno ? 'bg-red-500' : 'bg-sky-500') : 'bg-slate-200')} />
            ))}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">fuera en todo el centro</div>
        </div>
      </section>

      {/* Alumnado fuera ahora */}
      <section className="bg-white border border-slate-200 rounded-2xl p-4">
        <h2 className="text-sm font-bold flex items-center gap-2 mb-3">
          <Timer className="w-4 h-4 text-sky-600" /> Fuera del aula ahora
          {activas.length > 0 && <span className="text-xs font-medium text-slate-500">({activas.length})</span>}
        </h2>
        {activas.length === 0 ? (
          <p className="text-sm text-slate-500">No hay ningún alumno fuera del aula.</p>
        ) : (
          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {activas.map((s) => {
              const resto = cupo.minutos * 60 - Math.floor((ahora - s.inicio) / 1000);
              const tarde = resto < 0;
              const mia = s.docente === usuario.email;
              return (
                <div key={s.exit_id} className={'rounded-xl border p-3 space-y-2 ' +
                  (tarde ? 'border-red-200 bg-red-50' : mia ? 'border-sky-200 bg-sky-50/60' : 'border-slate-200')}>
                  <div className="flex justify-between gap-2 items-baseline">
                    <span className="font-bold text-sm">{s.apellidos}, {s.nombre}</span>
                    <span className={'tabular-nums font-extrabold text-lg ' + (tarde ? 'text-red-600' : 'text-slate-800')}>
                      {(tarde ? '+' : '') + reloj(Math.abs(resto))}
                    </span>
                  </div>
                  <div className="text-xs text-slate-500 break-words">
                    {etiquetaGrupo(s.grupo)} · salió a las {s.hora} · {s.docente}{s.excepcional ? ' · excepcional' : ''}
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => regreso(s)} disabled={ocupado === s.exit_id}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold disabled:opacity-50">
                      <UserCheck className="w-4 h-4" /> Ha vuelto
                    </button>
                    {s.puede_anular && (
                      <button onClick={() => anular(s)} disabled={ocupado === s.exit_id} title="Anular si se autorizó por error"
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold disabled:opacity-50">
                        <Undo2 className="w-4 h-4" /> Anular
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Alumnado del grupo */}
      <section className="bg-white border border-slate-200 rounded-2xl p-4">
        <h2 className="text-sm font-bold mb-3">Alumnado del grupo</h2>
        <div className="flex flex-wrap gap-2 mb-3">
          <select value={estado.grupo} onChange={(e) => cambiarGrupo(e.target.value)} aria-label="Grupo"
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">
            {!estado.grupo && <option value="">Elija un grupo…</option>}
            {estado.grupos.map((g) => (
              <option key={g} value={g}>{etiquetaGrupo(g)}{g === estado.grupo_horario ? ' (según su horario)' : ''}</option>
            ))}
          </select>
          {grupoElegido.current && estado.grupo_horario && grupoElegido.current !== estado.grupo_horario && (
            <button onClick={() => cambiarGrupo('')} className="text-xs font-semibold text-sky-700 hover:underline">
              Volver a mi grupo según el horario ({etiquetaGrupo(estado.grupo_horario)})
            </button>
          )}
          <div className="relative flex-1 min-w-48">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input type="search" value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Buscar alumno…"
              className="w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 py-2 text-sm" aria-label="Buscar alumno" />
          </div>
        </div>
        {!estado.grupo ? (
          <p className="text-sm text-slate-500">Elija el grupo con el que está ahora.</p>
        ) : alumnos.length === 0 ? (
          <p className="text-sm text-slate-500">No hay alumnos que coincidan.</p>
        ) : (
          <div className="grid gap-2 grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {alumnos.map((a) => {
              const fuera = fueraPorAlumno[a.id];
              const ultima = a.salidas[a.salidas.length - 1];
              return (
                <button key={a.id} onClick={() => setSeleccionado(a)}
                  className={'text-left rounded-xl border p-3 transition-colors hover:border-sky-300 hover:bg-sky-50/60 ' +
                    (fuera ? 'border-sky-200 bg-sky-50/60' : ultima ? 'border-amber-200' : 'border-slate-200 bg-white')}>
                  <div className="font-bold text-sm">{a.apellidos}</div>
                  <div className="text-sm text-slate-600">{a.nombre}</div>
                  {fuera ? (
                    <span className="inline-block mt-1.5 text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700">
                      Fuera desde las {fuera.hora}
                    </span>
                  ) : ultima ? (
                    <span className="inline-block mt-1.5 text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-amber-700">
                      Ya salió a las {ultima.hora}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        )}
      </section>

      {seleccionado && (
        <DialogoSalida alumno={seleccionado} estado={estado} cerrar={() => setSeleccionado(null)}
          hecho={(texto) => { setSeleccionado(null); avisar(texto); cargar(); }}
          fallo={(texto) => { avisar(texto, true); cargar(); }} />
      )}
    </div>
  );
}

function ChipFranja({ franja }: { franja: Estado['franja'] }) {
  const base = 'inline-block text-xs font-bold px-2.5 py-1 rounded-full border ';
  if (franja.bloque === 'RECREO') return <span className={base + 'bg-red-50 border-red-200 text-red-700'}>Recreo: no se conceden salidas</span>;
  if (franja.bloque === 'FUERA') return <span className={base + 'bg-slate-100 border-slate-200 text-slate-600'}>Fuera de la jornada lectiva</span>;
  if (franja.preferente) return <span className={base + 'bg-emerald-50 border-emerald-200 text-emerald-700'}>{franja.nombre}: autorización directa</span>;
  return <span className={base + 'bg-amber-50 border-amber-200 text-amber-700'}>{franja.nombre}: hay que indicar el motivo</span>;
}

function leerGrupo(): string {
  try { return sessionStorage.getItem(CLAVE_GRUPO) || ''; } catch { return ''; }
}

function normalizar(t: string) {
  return t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function reloj(seg: number) {
  return Math.floor(seg / 60) + ':' + String(seg % 60).padStart(2, '0');
}

export function duracion(seg: number) {
  return Math.floor(seg / 60) + ' min ' + (seg % 60) + ' s';
}
