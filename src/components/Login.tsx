import { useState, type FormEvent } from 'react';
import { KeyRound, LogIn, Mail } from 'lucide-react';
import { llamarApi } from '../services/api';
import type { Usuario } from '../tipos';

interface Props {
  alEntrar: (token: string, usuario: Usuario, primerAcceso: boolean) => void;
}

type Paso = 'correo' | 'clave' | 'nueva';

export default function Login({ alEntrar }: Props) {
  const [paso, setPaso] = useState<Paso>('correo');
  const [email, setEmail] = useState('');
  const [clave, setClave] = useState('');
  const [repetida, setRepetida] = useState('');
  const [error, setError] = useState('');
  const [esperando, setEsperando] = useState(false);

  const correo = email.trim().toLowerCase();

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (paso === 'correo') {
      if (!/@g\.educaand\.es$/.test(correo)) { setError('Use su cuenta corporativa @g.educaand.es.'); return; }
      setEsperando(true);
      const r = await llamarApi<{ registrado: boolean; tieneClave: boolean }>('estadoCuenta', { email: correo });
      setEsperando(false);
      if (!r.ok) { setError(r.mensaje || 'No se pudo comprobar la cuenta.'); return; }
      if (!r.registrado) { setError('La cuenta "' + correo + '" no está dada de alta en la aplicación. Debe darla de alta Jefatura de Estudios.'); return; }
      setPaso(r.tieneClave ? 'clave' : 'nueva');
      return;
    }
    if (paso === 'nueva' && clave !== repetida) { setError('Las dos contraseñas no coinciden.'); return; }
    setEsperando(true);
    const r = await llamarApi<{ token: string; usuario: Usuario; primerAcceso: boolean }>('login', { email: correo, clave });
    setEsperando(false);
    if (!r.ok) { setError(r.mensaje || 'No se pudo iniciar sesión.'); return; }
    alEntrar(r.token, r.usuario, r.primerAcceso);
  }

  const campo = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 pl-10 text-sm outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100';

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10">
      <form onSubmit={enviar} className="w-full max-w-sm bg-white border border-slate-200 rounded-2xl shadow-sm p-6 space-y-5">
        <div className="flex items-center gap-3">
          <img src="./logo_rectangular.png" alt="IES Blas Infante" className="h-12 w-auto" />
          <div>
            <h1 className="text-lg font-bold text-sky-950 leading-tight">Salidas al baño</h1>
            <p className="text-xs text-slate-500">IES Blas Infante · Córdoba</p>
          </div>
        </div>

        <div className="space-y-3">
          <label className="block">
            <span className="text-xs font-semibold text-slate-600">Correo corporativo</span>
            <div className="relative mt-1">
              <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input type="email" autoComplete="username" required value={email} disabled={paso !== 'correo'}
                onChange={(e) => setEmail(e.target.value)} placeholder="nombre@g.educaand.es" className={campo + ' disabled:bg-slate-50'} />
            </div>
          </label>

          {paso !== 'correo' && (
            <>
              {paso === 'nueva' && (
                <p className="text-xs text-sky-900 bg-sky-50 border border-sky-200 rounded-xl p-3">
                  Es su primer acceso. Elija una contraseña (mínimo 6 caracteres, con letras y números) y escríbala dos veces.
                </p>
              )}
              <label className="block">
                <span className="text-xs font-semibold text-slate-600">{paso === 'nueva' ? 'Nueva contraseña' : 'Contraseña'}</span>
                <div className="relative mt-1">
                  <KeyRound className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input type="password" autoFocus required value={clave} onChange={(e) => setClave(e.target.value)}
                    autoComplete={paso === 'nueva' ? 'new-password' : 'current-password'} className={campo} />
                </div>
              </label>
              {paso === 'nueva' && (
                <label className="block">
                  <span className="text-xs font-semibold text-slate-600">Repita la contraseña</span>
                  <div className="relative mt-1">
                    <KeyRound className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input type="password" required value={repetida} onChange={(e) => setRepetida(e.target.value)}
                      autoComplete="new-password" className={campo} />
                  </div>
                </label>
              )}
            </>
          )}
        </div>

        {error && <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl p-3">{error}</p>}

        <div className="flex gap-2">
          {paso !== 'correo' && (
            <button type="button" onClick={() => { setPaso('correo'); setClave(''); setRepetida(''); setError(''); }}
              className="px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50">
              Atrás
            </button>
          )}
          <button type="submit" disabled={esperando}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-sm font-semibold disabled:opacity-60">
            <LogIn className="w-4 h-4" />
            {esperando ? 'Comprobando…' : paso === 'correo' ? 'Continuar' : 'Entrar'}
          </button>
        </div>
        <p className="text-[11px] text-slate-400 text-center">Solo para el personal del centro con cuenta @g.educaand.es</p>
      </form>
    </div>
  );
}
