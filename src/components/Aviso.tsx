import { useEffect, useState } from 'react';

export interface AvisoDatos {
  texto: string;
  error: boolean;
  id: number;
}

/** Mensaje breve en la parte inferior de la pantalla. */
export function Aviso({ aviso }: { aviso: AvisoDatos | null }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!aviso) return;
    setVisible(true);
    const t = setTimeout(() => setVisible(false), aviso.error ? 6000 : 3000);
    return () => clearTimeout(t);
  }, [aviso]);
  if (!aviso || !visible) return null;
  return (
    <div role="status" className={'fixed left-1/2 bottom-5 -translate-x-1/2 z-50 max-w-[calc(100%-2rem)] px-4 py-2.5 rounded-xl text-sm text-white shadow-lg ' +
      (aviso.error ? 'bg-red-600' : 'bg-slate-900')}>
      {aviso.texto}
    </div>
  );
}
