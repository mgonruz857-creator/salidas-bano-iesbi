import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, X } from 'lucide-react';
import { llamarApi } from '../services/api';
import { etiquetaGrupo, type AlumnoGrupo, type Estado } from '../tipos';

interface Props {
  alumno: AlumnoGrupo;
  estado: Estado;
  cerrar: () => void;
  hecho: (texto: string) => void;
  fallo: (texto: string) => void;
}

interface Duplicado { previous_teacher: string; time: string }

export default function DialogoSalida({ alumno, estado, cerrar, hecho, fallo }: Props) {
  const { franja, cupo, activas } = estado;
  const previa = alumno.salidas[alumno.salidas.length - 1];
  const [duplicado, setDuplicado] = useState<Duplicado | null>(previa ? { previous_teacher: previa.docente, time: previa.hora } : null);
  const [justificacion, setJustificacion] = useState('');
  const [excepcional, setExcepcional] = useState('');
  const [enviando, setEnviando] = useState(false);
  const primerCampo = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    primerCampo.current?.focus();
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') cerrar(); };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [cerrar]);

  // Lo que se puede comprobar sin preguntar al servidor (el servidor lo vuelve a comprobar todo)
  let bloqueo = '';
  if (franja.bloque === 'RECREO') bloqueo = 'Durante el recreo no se conceden salidas.';
  else if (franja.bloque === 'FUERA') bloqueo = 'Fuera de la jornada lectiva no se conceden salidas.';
  else if (activas.some((s) => s.alumno === alumno.id)) bloqueo = 'Este alumno ya está fuera del aula.';
  else if (activas.length >= cupo.global) bloqueo = 'Cupo máximo alcanzado (' + cupo.global + '/' + cupo.global + '). Espere a que un alumno regrese.';
  else if (activas.filter((s) => s.grupo === estado.grupo).length >= cupo.aula) bloqueo = 'Ya hay un alumno de este grupo fuera del aula. Espere a que regrese.';

  const pideMotivo = !bloqueo && !franja.preferente;
  const pideExcepcional = !bloqueo && !!duplicado;
  const valido = !bloqueo &&
    (!pideMotivo || justificacion.trim().length >= cupo.min_justificacion) &&
    (!pideExcepcional || excepcional.trim().length >= cupo.min_excepcional);

  async function autorizar() {
    if (!valido || enviando) return;
    setEnviando(true);
    const r = await llamarApi<Duplicado>('autorizar', {
      alumno: alumno.id, grupo: estado.grupo, justificacion, justificacion_excepcional: duplicado ? excepcional : '',
    });
    setEnviando(false);
    if (r.ok) { hecho('Salida autorizada: ' + alumno.nombre + ' ' + alumno.apellidos + '.'); return; }
    if (r.codigo === 'DUPLICADO') { setDuplicado({ previous_teacher: r.previous_teacher, time: r.time }); return; }
    fallo(r.mensaje || 'No se pudo autorizar la salida.');
  }

  const area = 'w-full rounded-xl border border-slate-200 px-3 py-2 text-sm min-h-20 resize-y outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100';

  return (
    <div className="fixed inset-0 z-40 bg-slate-900/45 flex items-center justify-center p-4" onClick={(e) => { if (e.target === e.currentTarget) cerrar(); }}>
      <div role="dialog" aria-modal="true" aria-labelledby="titulo-salida" className="bg-white rounded-2xl w-full max-w-md max-h-[90vh] overflow-auto p-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 id="titulo-salida" className="text-lg font-bold">{alumno.apellidos}, {alumno.nombre}</h3>
            <p className="text-xs text-slate-500">{etiquetaGrupo(estado.grupo)} · {franja.nombre}</p>
          </div>
          <button onClick={cerrar} className="p-1 rounded-lg hover:bg-slate-100" aria-label="Cerrar"><X className="w-5 h-5" /></button>
        </div>

        {bloqueo && <Caja tono="rojo">{bloqueo}</Caja>}
        {!bloqueo && franja.preferente && !duplicado && <Caja tono="verde">Hora preferente: la salida se autoriza directamente.</Caja>}
        {pideExcepcional && duplicado && (
          <Caja tono="ambar">
            Este alumno ya salió en este bloque a las <b>{duplicado.time}</b>. Autorizó: <b className="break-all">{duplicado.previous_teacher}</b>.
            Solo puede conceder una salida excepcional justificada.
          </Caja>
        )}

        {pideMotivo && (
          <label className="block space-y-1">
            <span className="text-xs font-semibold text-slate-700">Motivo de la salida (fuera de la hora preferente)</span>
            <textarea ref={primerCampo} value={justificacion} maxLength={300} onChange={(e) => setJustificacion(e.target.value)} className={area} />
            <Contador texto={justificacion} minimo={cupo.min_justificacion} />
          </label>
        )}
        {pideExcepcional && (
          <label className="block space-y-1">
            <span className="text-xs font-semibold text-slate-700">Justificación de la salida excepcional</span>
            <textarea ref={pideMotivo ? undefined : primerCampo} value={excepcional} maxLength={300} onChange={(e) => setExcepcional(e.target.value)} className={area} />
            <Contador texto={excepcional} minimo={cupo.min_excepcional} />
          </label>
        )}

        <div className="flex justify-end gap-2">
          <button onClick={cerrar} className="px-4 py-2 rounded-xl border border-slate-200 text-sm font-semibold hover:bg-slate-50">Cancelar</button>
          <button onClick={autorizar} disabled={!valido || enviando}
            className="px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed">
            {enviando ? 'Autorizando…' : duplicado ? 'Autorizar salida excepcional' : 'Autorizar salida'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Caja({ tono, children }: { tono: 'rojo' | 'verde' | 'ambar'; children: React.ReactNode }) {
  const estilos = {
    rojo: 'bg-red-50 border-red-200 text-red-900',
    verde: 'bg-emerald-50 border-emerald-200 text-emerald-900',
    ambar: 'bg-amber-50 border-amber-200 text-amber-900',
  };
  const Icono = tono === 'verde' ? CheckCircle2 : AlertTriangle;
  return (
    <div className={'flex gap-2 rounded-xl border p-3 text-sm ' + estilos[tono]}>
      <Icono className="w-4 h-4 mt-0.5 shrink-0" />
      <div>{children}</div>
    </div>
  );
}

function Contador({ texto, minimo }: { texto: string; minimo: number }) {
  const n = texto.trim().length;
  if (n >= minimo) return null;
  return <div className="text-[11px] text-slate-500 text-right">Mínimo {minimo} caracteres ({n})</div>;
}
