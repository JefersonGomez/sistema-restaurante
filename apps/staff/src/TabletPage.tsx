import { Delete, Tablet } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiTablet, ErrorApi, guardarTokenTablet, tokenTablet } from './api';
import { useAuth, type Usuario } from './auth';
import { Boton, Campo } from './panel/comunes';

type InfoTablet = {
  nombre: string;
  restaurante: string;
  estacion: { nombre: string };
  personal: { id: string; nombre: string }[];
};

function Caja({ children }: { children: React.ReactNode }) {
  return (
    <main className="grid min-h-dvh place-items-center bg-bg p-4">
      <div className="w-full max-w-md space-y-5 rounded-[26px] bg-app p-6 shadow-app">
        {children}
      </div>
    </main>
  );
}

// Primer uso: el dueño genera un código en Panel → Dispositivos y se escribe aquí.
function Vincular({ alVincular }: { alVincular: () => void }) {
  const [codigo, setCodigo] = useState('');
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);
  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    setEnviando(true);
    setError('');
    try {
      const r = await apiTablet<{ tokenDispositivo: string }>('/vincular', { codigo });
      guardarTokenTablet(r.tokenDispositivo);
      alVincular();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setEnviando(false);
    }
  };
  return (
    <Caja>
      <form onSubmit={enviar} className="space-y-4">
        <div className="flex items-center gap-3">
          <span className="grid size-12 place-items-center rounded-full bg-purple-soft text-purple">
            <Tablet className="size-6" aria-hidden />
          </span>
          <div>
            <h1 className="text-[22px] font-semibold">Vincular esta tablet</h1>
            <p className="text-sm text-muted">
              Escriba el código de 6 números que aparece en Panel → Dispositivos.
            </p>
          </div>
        </div>
        <Campo
          etiqueta="Código"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          required
          value={codigo}
          onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ''))}
          className="[&_input]:h-14 [&_input]:text-center [&_input]:text-2xl [&_input]:tracking-[0.4em]"
        />
        {error && (
          <p role="alert" className="rounded-md bg-danger-soft p-3 text-sm text-danger">
            {error}
          </p>
        )}
        <Boton type="submit" disabled={enviando || codigo.length !== 6} className="h-14 w-full">
          {enviando ? 'Vinculando…' : 'Vincular'}
        </Boton>
      </form>
    </Caja>
  );
}

// Teclado grande de 4 dígitos; al completar el cuarto se envía solo.
function TecladoPin({
  nombre,
  onEnviar,
  onVolver,
}: {
  nombre: string;
  onEnviar: (pin: string) => Promise<string | null>;
  onVolver: () => void;
}) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);

  const enviar = useRef(onEnviar);
  enviar.current = onEnviar;
  useEffect(() => {
    if (pin.length !== 4) return;
    setEnviando(true);
    enviar.current(pin).then((e) => {
      setEnviando(false);
      if (e) {
        setError(e);
        setPin('');
      }
    });
  }, [pin]);

  const tecla = (d: string) => !enviando && setPin((p) => (p.length < 4 ? p + d : p));
  // Teclado físico también.
  useEffect(() => {
    const f = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) tecla(e.key);
      if (e.key === 'Backspace') setPin((p) => p.slice(0, -1));
    };
    window.addEventListener('keydown', f);
    return () => window.removeEventListener('keydown', f);
  });

  const clase =
    'grid h-16 place-items-center rounded-xl bg-surface text-2xl font-semibold hover:bg-surface-2 active:scale-95 disabled:opacity-50';
  return (
    <Caja>
      <div className="text-center">
        <h1 className="text-[22px] font-semibold">Hola, {nombre}</h1>
        <p className="text-sm text-muted">Escriba su PIN de 4 números</p>
      </div>
      <div
        className="flex justify-center gap-4"
        aria-label={`${pin.length} de 4 números`}
        role="status"
      >
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            className={`size-4 rounded-full ${i < pin.length ? 'bg-purple' : 'bg-line'}`}
          />
        ))}
      </div>
      {error && (
        <p role="alert" className="rounded-md bg-danger-soft p-3 text-center text-sm text-danger">
          {error}
        </p>
      )}
      <div className="grid grid-cols-3 gap-3">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
          <button
            key={d}
            type="button"
            className={clase}
            disabled={enviando}
            onClick={() => tecla(d)}
          >
            {d}
          </button>
        ))}
        <button type="button" className={`${clase} text-base`} onClick={onVolver}>
          Volver
        </button>
        <button type="button" className={clase} disabled={enviando} onClick={() => tecla('0')}>
          0
        </button>
        <button
          type="button"
          aria-label="Borrar"
          className={clase}
          onClick={() => setPin((p) => p.slice(0, -1))}
        >
          <Delete className="size-6" aria-hidden />
        </button>
      </div>
    </Caja>
  );
}

export function TabletPage() {
  const { entrarTablet } = useAuth();
  const navegar = useNavigate();
  const [vinculada, setVinculada] = useState(!!tokenTablet());
  const [info, setInfo] = useState<InfoTablet | null>(null);
  const [error, setError] = useState('');
  const [quien, setQuien] = useState<{ id: string; nombre: string } | null>(null);

  useEffect(() => {
    if (!vinculada) return;
    apiTablet<InfoTablet>('/tablet')
      .then(setInfo)
      .catch((e: ErrorApi) => {
        if (e.code === 'DISPOSITIVO_REVOCADO') {
          guardarTokenTablet(null);
          setVinculada(false);
        } else setError(e.message);
      });
  }, [vinculada]);

  if (!vinculada) return <Vincular alVincular={() => setVinculada(true)} />;

  if (quien)
    return (
      <TecladoPin
        nombre={quien.nombre}
        onVolver={() => setQuien(null)}
        onEnviar={async (pin) => {
          try {
            const r = await apiTablet<{ accessToken: string; usuario: Usuario }>('/tablet/entrar', {
              usuarioId: quien.id,
              pin,
            });
            entrarTablet(r.accessToken, r.usuario);
            navegar('/cocina', { replace: true });
            return null;
          } catch (e) {
            const err = e as ErrorApi;
            const quedan = err.details?.intentosRestantes;
            return quedan ? `${err.message}. Le quedan ${quedan} intentos.` : err.message;
          }
        }}
      />
    );

  return (
    <Caja>
      {error ? (
        <p role="alert" className="rounded-md bg-danger-soft p-3 text-sm text-danger">
          {error}
        </p>
      ) : !info ? (
        <div className="esqueleto h-40 rounded-md" aria-busy="true" />
      ) : (
        <>
          <div>
            <h1 className="text-[22px] font-semibold">{info.estacion.nombre}</h1>
            <p className="text-sm text-muted">
              {info.restaurante} · {info.nombre}
            </p>
          </div>
          <p className="font-medium">¿Quién va a trabajar?</p>
          {info.personal.length ? (
            <div className="grid grid-cols-2 gap-3">
              {info.personal.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setQuien(p)}
                  className="flex min-h-20 items-center justify-center rounded-xl bg-surface p-3 text-lg font-semibold hover:bg-purple-soft hover:text-purple"
                >
                  {p.nombre}
                </button>
              ))}
            </div>
          ) : (
            <p className="rounded-md bg-amber-soft p-3 text-sm text-amber-ink">
              Nadie de cocina tiene PIN todavía. El dueño lo pone en Panel → Personal.
            </p>
          )}
        </>
      )}
      <button
        type="button"
        onClick={() => {
          guardarTokenTablet(null);
          setVinculada(false);
          setInfo(null);
        }}
        className="min-h-11 w-full text-sm text-muted underline"
      >
        Desvincular esta tablet
      </button>
    </Caja>
  );
}
