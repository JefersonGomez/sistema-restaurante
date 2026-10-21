import { useState, type FormEvent } from 'react';
import { useAuth } from './auth';

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
    <main className="grid min-h-dvh place-items-center p-4">
      <form
        onSubmit={enviar}
        className="w-full max-w-sm space-y-4 rounded-xl bg-white p-6 shadow-sm"
        aria-describedby={error ? 'error-login' : undefined}
      >
        <h1 className="text-xl font-semibold text-stone-800">Ingreso del personal</h1>
        <label className="block text-sm">
          <span className="text-stone-700">Email</span>
          <input
            type="email"
            required
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2 focus:border-teal-600 focus:outline-none"
          />
        </label>
        <label className="block text-sm">
          <span className="text-stone-700">Contraseña</span>
          <input
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2 focus:border-teal-600 focus:outline-none"
          />
        </label>
        {error && (
          <p id="error-login" role="alert" className="text-sm text-red-700">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={enviando}
          className="w-full rounded-md bg-teal-700 py-2 font-medium text-white hover:bg-teal-800 disabled:opacity-60"
        >
          {enviando ? 'Ingresando…' : 'Ingresar'}
        </button>
      </form>
    </main>
  );
}
