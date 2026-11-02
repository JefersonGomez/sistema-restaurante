import { useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { pedirEnlace, restablecerPassword } from './api';
import { Boton, Campo } from './panel/comunes';

function Marco({
  titulo,
  detalle,
  children,
}: {
  titulo: string;
  detalle: string;
  children: ReactNode;
}) {
  return (
    <main className="grid min-h-dvh place-items-center bg-bg p-4">
      <div className="w-full max-w-sm space-y-4 rounded-[26px] bg-app p-6 shadow-app">
        <div>
          <h1 className="text-[22px] font-semibold">{titulo}</h1>
          <p className="mt-1 text-sm text-muted">{detalle}</p>
        </div>
        {children}
        <Link to="/login" className="block min-h-11 text-center text-sm text-muted underline">
          Volver al ingreso
        </Link>
      </div>
    </main>
  );
}

// /olvide: pide el enlace por correo (la respuesta es la misma exista o no la cuenta).
export function OlvidePage() {
  const [email, setEmail] = useState('');
  const [listo, setListo] = useState(false);
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    setEnviando(true);
    setError('');
    try {
      await pedirEnlace(email.trim());
      setListo(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Marco
      titulo="¿Olvidó su contraseña?"
      detalle="Escriba su correo y le enviamos un enlace para crear una nueva."
    >
      {listo ? (
        <p role="status" className="rounded-md bg-ok-soft p-3 text-sm text-ok">
          Si ese correo tiene una cuenta, le llegará un enlace en unos minutos. Revise también la
          carpeta de correo no deseado. El enlace vence en 1 hora.
        </p>
      ) : (
        <form onSubmit={enviar} className="space-y-4">
          <Campo
            etiqueta="Correo"
            type="email"
            required
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          {error && (
            <p role="alert" className="rounded-md bg-danger-soft p-3 text-sm text-danger">
              {error}
            </p>
          )}
          <Boton type="submit" disabled={enviando} className="h-12 w-full">
            Enviar enlace
          </Boton>
        </form>
      )}
    </Marco>
  );
}

// /restablecer?token=…: la contraseña nueva con el enlace del correo.
export function RestablecerPage() {
  const [params] = useSearchParams();
  const navegar = useNavigate();
  const [password, setPassword] = useState('');
  const [repetir, setRepetir] = useState('');
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);
  const token = params.get('token') ?? '';

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    if (password !== repetir) return setError('Las dos contraseñas no coinciden');
    setEnviando(true);
    setError('');
    try {
      await restablecerPassword(token, password);
      navegar('/login?restablecida', { replace: true });
    } catch (err) {
      setError((err as Error).message);
      setEnviando(false);
    }
  };

  return (
    <Marco
      titulo="Contraseña nueva"
      detalle="Mínimo 8 caracteres. Al guardarla se cierran las sesiones abiertas."
    >
      <form onSubmit={enviar} className="space-y-4">
        <Campo
          etiqueta="Contraseña nueva"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <Campo
          etiqueta="Repítala"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          value={repetir}
          onChange={(e) => setRepetir(e.target.value)}
        />
        {error && (
          <p role="alert" className="rounded-md bg-danger-soft p-3 text-sm text-danger">
            {error}{' '}
            {error.includes('enlace') && (
              <Link to="/olvide" className="font-semibold underline">
                Pedir otro
              </Link>
            )}
          </p>
        )}
        <Boton type="submit" disabled={enviando || !token} className="h-12 w-full">
          Guardar contraseña
        </Boton>
      </form>
    </Marco>
  );
}
