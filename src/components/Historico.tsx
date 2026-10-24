import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ExternalLink, RefreshCw } from 'lucide-react';
import { llamarApi } from '../services/api';
import { etiquetaGrupo, type Salida } from '../tipos';
import { duracion } from './Aula';

interface Props {
  avisar: (texto: string, error?: boolean) => void;
}

const ESTADOS: Record<Salida['estado'], [string, string]> = {
  ACTIVE: ['Fuera', 'bg-emerald-50 border-emerald-200 text-emerald-700'],
  COMPLETED: ['Volvió', 'bg-slate-100 border-slate-200 text-slate-600'],
  CANCELLED: ['Anulada', 'bg-slate-100 border-slate-200 text-slate-500'],
  NO_RETURN: ['Sin regreso registrado', 'bg-red-50 border-red-200 text-red-700'],
};
const MINUTOS_MAXIMOS = 5;

export default function Historico({ avisar }: Props) {
  const [fecha, setFecha] = useState(''); // vacío = hoy según el servidor
  const [grupo, setGrupo] = useState('');
  const [salidas, setSalidas] = useState<Salida[] | null>(null);
  const [urlHoja, setUrlHoja] = useState('');

  const cargar = useCallback(async () => {
    setSalidas(null);
    const r = await llamarApi<{ salidas: Salida[]; url_hoja: string; fecha: string }>('historico', { fecha });
    if (!r.ok) { avisar(r.mensaje || 'No se pudo cargar el histórico.', true); setSalidas([]); return; }
    setSalidas(r.salidas);
    if (!fecha) setFecha(r.fecha);
    setUrlHoja(r.url_hoja);
  }, [fecha, avisar]);

  const cargada = useRef('-');
  useEffect(() => {
    // Al recibir la fecha de hoy del servidor no hace falta volver a pedirla
    if (cargada.current === '' && fecha) { cargada.current = fecha; return; }
    cargada.current = fecha;
    cargar();
  }, [cargar, fecha]);

  const grupos = useMemo(() => [...new Set((salidas || []).map((s) => s.grupo))].sort(), [salidas]);
  const lista = (salidas || []).filter((s) => !grupo || s.grupo === grupo);
  const validas = lista.filter((s) => s.estado !== 'CANCELLED');
  const tarde = validas.filter((s) => s.fin && (s.fin - s.inicio) / 1000 > MINUTOS_MAXIMOS * 60).length;

  return (
    <section className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-bold mr-auto">Histórico de salidas</h2>
        <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} aria-label="Fecha"
          className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
        <select value={grupo} onChange={(e) => setGrupo(e.target.value)} aria-label="Grupo"
          className="rounded-xl border border-slate-200 px-3 py-2 text-sm">
          <option value="">Todos los grupos</option>
          {grupos.map((g) => <option key={g} value={g}>{etiquetaGrupo(g)}</option>)}
        </select>
        <button onClick={cargar} className="p-2 rounded-xl border border-slate-200 hover:bg-slate-50" title="Actualizar">
          <RefreshCw className="w-4 h-4" />
        </button>
        {urlHoja && (
          <a href={urlHoja} target="_blank" rel="noopener" className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 hover:bg-sky-50 text-sm font-semibold text-sky-800">
            <ExternalLink className="w-4 h-4" /> Hoja de cálculo
          </a>
        )}
      </div>

      {salidas && (
        <div className="flex flex-wrap gap-2 text-xs">
          <Dato texto="Salidas" valor={validas.length} />
          <Dato texto="Excepcionales" valor={validas.filter((s) => s.excepcional).length} />
          <Dato texto={'Más de ' + MINUTOS_MAXIMOS + ' min'} valor={tarde} />
          <Dato texto="Sin regreso registrado" valor={validas.filter((s) => s.estado === 'NO_RETURN').length} />
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-500 border-b border-slate-200">
              <th className="p-2 font-semibold">Hora</th><th className="p-2 font-semibold">Alumno</th><th className="p-2 font-semibold">Grupo</th>
              <th className="p-2 font-semibold">Duración</th><th className="p-2 font-semibold">Autoriza</th>
              <th className="p-2 font-semibold">Motivo</th><th className="p-2 font-semibold">Estado</th>
            </tr>
          </thead>
          <tbody>
            {salidas === null ? (
              <tr><td colSpan={7} className="p-4 text-slate-500">Cargando…</td></tr>
            ) : lista.length === 0 ? (
              <tr><td colSpan={7} className="p-4 text-slate-500">No hay salidas registradas ese día.</td></tr>
            ) : lista.map((s) => {
              const seg = s.fin ? Math.round((s.fin - s.inicio) / 1000) : null;
              const [txt, estilo] = ESTADOS[s.estado] || [s.estado, ''];
              let motivo = s.preferente && s.justificacion === 'Salida regular' ? 'Hora preferente' : s.justificacion;
              if (s.excepcional) motivo += ' · Excepcional: ' + s.justificacion_excepcional;
              return (
                <tr key={s.exit_id} className="border-b border-slate-100 align-top">
                  <td className="p-2 tabular-nums whitespace-nowrap">{s.hora}{s.hora_fin ? '–' + s.hora_fin : ''}</td>
                  <td className="p-2">{s.apellidos}, {s.nombre}</td>
                  <td className="p-2 whitespace-nowrap">{etiquetaGrupo(s.grupo)}</td>
                  <td className={'p-2 whitespace-nowrap ' + (seg !== null && seg > MINUTOS_MAXIMOS * 60 && s.estado === 'COMPLETED' ? 'text-red-600 font-semibold' : '')}>
                    {seg === null || s.estado !== 'COMPLETED' ? '—' : duracion(seg)}
                  </td>
                  <td className="p-2 break-all text-xs">{s.docente}</td>
                  <td className="p-2 text-xs">{motivo}</td>
                  <td className="p-2"><span className={'inline-block text-[11px] font-bold px-2 py-0.5 rounded-full border whitespace-nowrap ' + estilo}>{txt}</span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Dato({ texto, valor }: { texto: string; valor: number }) {
  return (
    <span className="px-2.5 py-1 rounded-lg bg-slate-50 border border-slate-200 text-slate-600">
      {texto}: <b className="text-slate-900">{valor}</b>
    </span>
  );
}
