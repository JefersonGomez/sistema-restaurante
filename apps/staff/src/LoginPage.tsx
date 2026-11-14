import { useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Cargando } from '@menu-qr/ui';
import { useAuth } from './auth';
import { Boton, Campo } from './panel/comunes';

export function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [params] = useSearchParams();

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setEnviando(true);
    try {
      await login(email, password);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <main className="grid min-h-dvh place-items-center bg-bg p-4">
      {enviando && (
        <div className="anim-aparecer fixed inset-0 z-50">
          <Cargando texto="Entrando…" />
        </div>
      )}
      <form
        onSubmit={enviar}
        className="w-full max-w-sm space-y-4 rounded-[26px] bg-app p-6 shadow-app"
        aria-describedby={error ? 'error-login' : undefined}
      >
        <div>
          <p className="mb-3 font-display text-lg font-extrabold tracking-[-0.02em] text-purple">
            KitchaGo
          </p>
          <h1 className="text-[22px] font-semibold">Ingreso del personal</h1>
          <p className="mt-1 text-sm text-muted">
            Use el correo y la contraseña que le dio el dueño.
          </p>
        </div>
        <Campo
          etiqueta="Correo"
          type="email"
          required
          autoComplete="username"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <Campo
          etiqueta="Contraseña"
          type="password"
          required
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {params.has('restablecida') && !error && (
          <p role="status" className="rounded-md bg-ok-soft p-3 text-sm text-ok">
            Contraseña cambiada. Entre con la nueva.
          </p>
        )}
        {error && (
          <p
            id="error-login"
            role="alert"
            className="rounded-md bg-danger-soft p-3 text-sm text-danger"
          >
            {error}
          </p>
        )}
        <Boton type="submit" disabled={enviando} className="h-14 w-full text-[15.5px]">
          {enviando ? 'Ingresando…' : 'Ingresar'}
        </Boton>
        <Link to="/olvide" className="block text-center text-sm text-muted underline">
          ¿Olvidó su contraseña?
        </Link>
        <p className="text-center text-sm text-muted">
          ¿Tiene un restaurante o una soda?{' '}
          <Link to="/registro" className="font-semibold text-purple underline">
            Cree su cuenta
          </Link>
        </p>
        <Link to="/tablet" className="block min-h-11 text-center text-sm text-muted underline">
          ¿Es una tablet de cocina? Entrar con PIN
        </Link>
      </form>
    </main>
  );
}
