import { useState, type FormEvent } from 'react';
import { useAuth } from './auth';
import { Boton, Campo } from './panel/comunes';

export function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);

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
      <form
        onSubmit={enviar}
        className="w-full max-w-sm space-y-4 rounded-[26px] bg-app p-6 shadow-app"
        aria-describedby={error ? 'error-login' : undefined}
      >
        <div>
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
      </form>
    </main>
  );
}
