import { useState, type FormEvent } from 'react';
import { api } from './api';
import { useAuth } from './auth';
import { Boton, Campo } from './panel/comunes';

// Se muestra cuando el dueño le dio una contraseña temporal: hay que cambiarla antes de seguir.
export function CambiarPasswordPage() {
  const { recargar, logout } = useAuth();
  const [actual, setActual] = useState('');
  const [nueva, setNueva] = useState('');
  const [repetir, setRepetir] = useState('');
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    if (nueva.length < 8) return setError('La nueva contraseña necesita al menos 8 caracteres');
    if (nueva !== repetir) return setError('Las dos contraseñas nuevas no coinciden');
    setError('');
    setEnviando(true);
    try {
      await api('/auth/cambiar-password', { method: 'POST', body: { actual, nueva } });
      await recargar();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <main className="grid min-h-dvh place-items-center bg-bg p-4">
      <form
        onSubmit={enviar}
        className="w-full max-w-sm space-y-4 rounded-[26px] bg-app p-6 shadow-app"
      >
        <div>
          <h1 className="text-[22px] font-semibold">Cambie su contraseña</h1>
          <p className="mt-1 text-sm text-muted">
            Está usando una contraseña temporal. Elija una nueva que solo usted conozca.
          </p>
        </div>
        <Campo
          etiqueta="Contraseña temporal"
          type="password"
          required
          autoComplete="current-password"
          value={actual}
          onChange={(e) => setActual(e.target.value)}
        />
        <Campo
          etiqueta="Nueva contraseña"
          type="password"
          required
          autoComplete="new-password"
          ayuda="Mínimo 8 caracteres"
          value={nueva}
          onChange={(e) => setNueva(e.target.value)}
        />
        <Campo
          etiqueta="Repita la nueva contraseña"
          type="password"
          required
          autoComplete="new-password"
          value={repetir}
          onChange={(e) => setRepetir(e.target.value)}
        />
        {error && (
          <p role="alert" className="rounded-md bg-danger-soft p-3 text-sm text-danger">
            {error}
          </p>
        )}
        <Boton type="submit" disabled={enviando} className="h-14 w-full text-[15.5px]">
          {enviando ? 'Guardando…' : 'Guardar y entrar'}
        </Boton>
        <Boton variante="suave" className="w-full" onClick={logout}>
          Salir
        </Boton>
      </form>
    </main>
  );
}
