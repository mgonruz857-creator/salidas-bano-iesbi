import { useCallback, useEffect, useMemo, useState } from 'react';
import { FileUp, KeyRound, Save } from 'lucide-react';
import { llamarApi } from '../services/api';
import { buscarDocente, grupoAutomatico, interpretarPagina, type PaginaHorario } from '../services/horarioSeneca';
import { etiquetaGrupo } from '../tipos';

interface Props {
  avisar: (texto: string, error?: boolean) => void;
}

interface Docente { email: string; nombre: string; aula: string; directivo: boolean; tieneClave: boolean; tramos: number }

const CLAVE_EQUIVALENCIAS = 'gbcs_equivalencias_grupos';
const NOMBRES_DIA = ['', 'L', 'M', 'X', 'J', 'V'];

export default function Profesorado({ avisar }: Props) {
  const [docentes, setDocentes] = useState<Docente[] | null>(null);
  const [grupos, setGrupos] = useState<string[]>([]);
  const [filtro, setFiltro] = useState('');

  const cargar = useCallback(async () => {
    const r = await llamarApi<{ profesorado: Docente[]; grupos: string[] }>('profesorado');
    if (!r.ok) { avisar(r.mensaje || 'No se pudo cargar el profesorado.', true); return; }
    setDocentes(r.profesorado);
    setGrupos(r.grupos);
  }, [avisar]);

  useEffect(() => { cargar(); }, [cargar]);

  async function restablecer(d: Docente) {
    if (!confirm('¿Restablecer la contraseña de ' + d.nombre + '? En su próximo acceso escribirá una nueva.')) return;
    const r = await llamarApi('restablecerClave', { email: d.email });
    avisar(r.ok ? 'Contraseña restablecida.' : r.mensaje || 'No se pudo restablecer.', !r.ok);
    cargar();
  }

  const q = filtro.toLowerCase();
  const lista = (docentes || []).filter((d) => !q || (d.nombre + ' ' + d.email).toLowerCase().includes(q));

  return (
    <div className="space-y-4">
      <ImportarHorario docentes={docentes || []} grupos={grupos} avisar={avisar} alGuardar={cargar} />

      <section className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3">
        <div className="flex flex-wrap gap-2 items-center">
          <h2 className="text-sm font-bold mr-auto">Profesorado</h2>
          <input type="search" value={filtro} onChange={(e) => setFiltro(e.target.value)} placeholder="Buscar…"
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm" aria-label="Buscar docente" />
        </div>
        <p className="text-xs text-slate-500">
          Para dar de alta o de baja a un docente, edite la pestaña <b>Profesorado</b> de la hoja de cálculo.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500 border-b border-slate-200">
                <th className="p-2 font-semibold">Docente</th><th className="p-2 font-semibold">Aula</th>
                <th className="p-2 font-semibold">Horario</th><th className="p-2 font-semibold">Acceso</th><th className="p-2"></th>
              </tr>
            </thead>
            <tbody>
              {docentes === null ? (
                <tr><td colSpan={5} className="p-4 text-slate-500">Cargando…</td></tr>
              ) : lista.map((d) => (
                <tr key={d.email} className="border-b border-slate-100">
                  <td className="p-2">
                    <div className="font-semibold">{d.nombre}{d.directivo && <span className="ml-1.5 text-[10px] font-bold px-1.5 py-0.5 rounded bg-sky-100 text-sky-800">DIRECTIVO</span>}</div>
                    <div className="text-xs text-slate-500 break-all">{d.email}</div>
                  </td>
                  <td className="p-2 whitespace-nowrap">{d.aula ? etiquetaGrupo(d.aula) : '—'}</td>
                  <td className="p-2 whitespace-nowrap text-xs">{d.tramos ? d.tramos + (d.tramos === 1 ? ' hora' : ' horas') : <span className="text-amber-700">Sin horario</span>}</td>
                  <td className="p-2 whitespace-nowrap text-xs">{d.tieneClave ? 'Activada' : <span className="text-slate-500">Pendiente del primer acceso</span>}</td>
                  <td className="p-2 text-right">
                    {d.tieneClave && (
                      <button onClick={() => restablecer(d)} title="Restablecer contraseña"
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-slate-200 text-xs hover:bg-slate-50">
                        <KeyRound className="w-3.5 h-3.5" /> Restablecer
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

// ───────── Importar horario desde los PDF de Séneca ─────────

interface ImportarProps {
  docentes: Docente[];
  grupos: string[];
  avisar: (texto: string, error?: boolean) => void;
  alGuardar: () => void;
}

function leerEquivalencias(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(CLAVE_EQUIVALENCIAS) || '{}'); } catch { return {}; }
}

function ImportarHorario({ docentes, grupos, avisar, alGuardar }: ImportarProps) {
  const [paginas, setPaginas] = useState<PaginaHorario[]>([]);
  const [leyendo, setLeyendo] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [docenteDe, setDocenteDe] = useState<Record<string, string>>({});   // nombre Séneca → correo
  const [grupoDe, setGrupoDe] = useState<Record<string, string>>(leerEquivalencias); // texto Séneca → código

  async function leer(archivos: File[]) {
    if (!archivos.length) return;
    setLeyendo(true);
    try {
      const { textosDelPdf } = await import('../services/leerPdf');
      const leidas: PaginaHorario[] = [];
      for (const a of archivos) {
        for (const textos of await textosDelPdf(await a.arrayBuffer())) {
          const p = interpretarPagina(textos);
          if (p && p.tramos.length) leidas.push(p);
        }
      }
      // Si un docente aparece dos veces, se queda la última lectura
      const porDocente = new Map(leidas.map((p) => [p.profesor, p]));
      setPaginas([...porDocente.values()]);
      const auto: Record<string, string> = {};
      porDocente.forEach((_, nombre) => { auto[nombre] = buscarDocente(nombre, docentes); });
      setDocenteDe(auto);
      if (!leidas.length) avisar('No se ha encontrado ningún horario de profesorado en el PDF.', true);
    } catch (e: any) {
      avisar('No se pudo leer el PDF: ' + (e && e.message || e), true);
    }
    setLeyendo(false);
  }

  // Textos de grupo de Séneca que aparecen, con el código propuesto
  const textosGrupo = useMemo(() => {
    const s = new Set<string>();
    paginas.forEach((p) => p.tramos.forEach((t) => t.grupos.forEach((g) => s.add(g))));
    return [...s].sort();
  }, [paginas]);

  const codigo = (texto: string) => grupoDe[texto] ?? grupoAutomatico(texto, grupos);

  const filas = useMemo(() => {
    const out: [string, number, string, string, string][] = [];
    paginas.forEach((p) => {
      const email = docenteDe[p.profesor];
      if (!email) return;
      p.tramos.forEach((t) => {
        const g = t.grupos.map(codigo).find(Boolean);
        if (g) out.push([email, t.dia, t.desde, t.hasta, g]);
      });
    });
    return out;
  }, [paginas, docenteDe, grupoDe, grupos]); // eslint-disable-line react-hooks/exhaustive-deps

  function elegirGrupo(texto: string, g: string) {
    const nuevo = { ...grupoDe, [texto]: g };
    setGrupoDe(nuevo);
    try { localStorage.setItem(CLAVE_EQUIVALENCIAS, JSON.stringify(nuevo)); } catch { /* nada */ }
  }

  async function guardar() {
    const correos = [...new Set(paginas.map((p) => docenteDe[p.profesor]).filter(Boolean))];
    if (!correos.length) { avisar('Asigne al menos un docente.', true); return; }
    setGuardando(true);
    const r = await llamarApi<{ guardados: number; docentes: number }>('guardarHorario', { filas, docentes: correos }, 60000);
    setGuardando(false);
    if (!r.ok) { avisar(r.mensaje || 'No se pudo guardar el horario.', true); return; }
    avisar('Horario guardado: ' + r.guardados + ' horas de ' + r.docentes + ' docentes.');
    setPaginas([]);
    alGuardar();
  }

  const sinDocente = paginas.filter((p) => !docenteDe[p.profesor]).length;

  return (
    <section className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3">
      <h2 className="text-sm font-bold">Horario del profesorado</h2>
      <p className="text-xs text-slate-600">
        Suba el PDF <b>Horarios de profesores</b> de Séneca (uno con todo el claustro o varios, uno por docente).
        El PDF se lee en este navegador; solo se guarda en la hoja del centro qué grupo tiene cada docente a cada hora.
        Así la app propone el grupo correcto al entrar.
      </p>
      <label className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-sky-200 bg-sky-50 hover:bg-sky-100 text-sm font-semibold text-sky-900 cursor-pointer">
        <FileUp className="w-4 h-4" /> {leyendo ? 'Leyendo…' : 'Elegir PDF de horarios'}
        <input type="file" accept="application/pdf" multiple className="hidden" onChange={(e) => { leer(Array.from(e.target.files || [])); e.target.value = ''; }} />
      </label>

      {paginas.length > 0 && (
        <div className="space-y-4">
          <div>
            <h3 className="text-xs font-bold text-slate-700 mb-1.5">
              Docentes leídos: {paginas.length}{sinDocente ? ' · ' + sinDocente + ' sin identificar (no se guardarán)' : ''}
            </h3>
            <div className="grid gap-1.5 sm:grid-cols-2">
              {paginas.map((p) => (
                <div key={p.profesor} className={'flex items-center gap-2 rounded-lg border px-2 py-1.5 text-xs ' + (docenteDe[p.profesor] ? 'border-slate-200' : 'border-amber-200 bg-amber-50')}>
                  <span className="font-semibold flex-1 min-w-0 truncate" title={p.profesor}>{p.profesor}</span>
                  <select value={docenteDe[p.profesor] || ''} onChange={(e) => setDocenteDe({ ...docenteDe, [p.profesor]: e.target.value })}
                    className="rounded-lg border border-slate-200 px-1.5 py-1 max-w-[55%]" aria-label={'Docente para ' + p.profesor}>
                    <option value="">— Sin identificar —</option>
                    {docentes.map((d) => <option key={d.email} value={d.email}>{d.nombre}</option>)}
                  </select>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h3 className="text-xs font-bold text-slate-700 mb-1.5">Grupos de Séneca → grupos de la app</h3>
            <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
              {textosGrupo.map((t) => (
                <div key={t} className={'flex items-center gap-2 rounded-lg border px-2 py-1.5 text-xs ' + (codigo(t) ? 'border-slate-200' : 'border-amber-200 bg-amber-50')}>
                  <span className="font-semibold flex-1">{t}</span>
                  <select value={codigo(t)} onChange={(e) => elegirGrupo(t, e.target.value)} className="rounded-lg border border-slate-200 px-1.5 py-1" aria-label={'Grupo para ' + t}>
                    <option value="">— No es un grupo —</option>
                    {grupos.map((g) => <option key={g} value={g}>{etiquetaGrupo(g)}</option>)}
                  </select>
                </div>
              ))}
            </div>
          </div>

          <details className="text-xs">
            <summary className="cursor-pointer font-semibold text-slate-700">Ver lo que se va a guardar ({filas.length} horas)</summary>
            <div className="max-h-64 overflow-auto mt-2 border border-slate-200 rounded-lg">
              <table className="w-full">
                <tbody>
                  {filas.map((f, i) => (
                    <tr key={i} className="border-b border-slate-100">
                      <td className="px-2 py-1 break-all">{f[0]}</td><td className="px-2 py-1">{NOMBRES_DIA[f[1]]}</td>
                      <td className="px-2 py-1 tabular-nums">{f[2]}–{f[3]}</td><td className="px-2 py-1">{etiquetaGrupo(f[4])}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>

          <div className="flex gap-2 justify-end">
            <button onClick={() => setPaginas([])} className="px-4 py-2 rounded-xl border border-slate-200 text-sm font-semibold hover:bg-slate-50">Descartar</button>
            <button onClick={guardar} disabled={guardando || !filas.length}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-sm font-semibold disabled:opacity-50">
              <Save className="w-4 h-4" /> {guardando ? 'Guardando…' : 'Guardar horario en la hoja'}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
