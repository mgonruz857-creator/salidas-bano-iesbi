import { useState, type FormEvent } from 'react';
import { X } from 'lucide-react';
import { llamarApi } from '../services/api';

interface Props {
  cerrar: () => void;
  avisar: (texto: string, error?: boolean) => void;
}

export default function CambiarClave({ cerrar, avisar }: Props) {
  const [actual, setActual] = useState('');
  const [nueva, setNueva] = useState('');
  const [repetida, setRepetida] = useState('');
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    if (nueva !== repetida) { setError('Las dos contraseñas nuevas no coinciden.'); return; }
    setEnviando(true);
    const r = await llamarApi('cambiarClave', { actual, nueva });
    setEnviando(false);
    if (!r.ok) { setError(r.mensaje || 'No se pudo cambiar la contraseña.'); return; }
    avisar('Contraseña cambiada.');
    cerrar();
  }

  const campo = 'w-full mt-1 rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100';
  return (
    <div className="fixed inset-0 z-40 bg-slate-900/45 flex items-center justify-center p-4" onClick={(e) => { if (e.target === e.currentTarget) cerrar(); }}>
      <form onSubmit={enviar} className="bg-white rounded-2xl w-full max-w-sm p-5 space-y-3" role="dialog" aria-modal="true">
        <div className="flex justify-between items-center">
          <h3 className="font-bold">Cambiar mi contraseña</h3>
          <button type="button" onClick={cerrar} className="p-1 rounded-lg hover:bg-slate-100" aria-label="Cerrar"><X className="w-5 h-5" /></button>
        </div>
        <label className="block text-xs font-semibold text-slate-600">Contraseña actual
          <input type="password" required autoFocus autoComplete="current-password" value={actual} onChange={(e) => setActual(e.target.value)} className={campo} />
        </label>
        <label className="block text-xs font-semibold text-slate-600">Nueva contraseña (6 o más caracteres, letras y números)
          <input type="password" required autoComplete="new-password" value={nueva} onChange={(e) => setNueva(e.target.value)} className={campo} />
        </label>
        <label className="block text-xs font-semibold text-slate-600">Repita la nueva contraseña
          <input type="password" required autoComplete="new-password" value={repetida} onChange={(e) => setRepetida(e.target.value)} className={campo} />
        </label>
        {error && <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl p-3">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={cerrar} className="px-4 py-2 rounded-xl border border-slate-200 text-sm font-semibold hover:bg-slate-50">Cancelar</button>
          <button disabled={enviando} className="px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-sm font-semibold disabled:opacity-50">
            {enviando ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </form>
    </div>
  );
}
