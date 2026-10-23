import { UserPlus, Users } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Cargando, Modal, QuantityStepper } from '@menu-qr/ui';
import * as api from '../api';
import { useMesa } from '../datos/mesa';
import { useTextos } from '../estado/idioma';
import { Main } from './estructura';

const boton =
  'flex h-14 w-full items-center justify-center gap-2 rounded-md text-[15.5px] font-semibold disabled:opacity-60';

// Cupo lleno al escanear: "¿Está usted en esta mesa?" → se pide permiso a los de la mesa y se
// espera la respuesta (se consulta cada 2 s).
export function MesaLlenaScreen() {
  const { llena, tokenQr, entrar } = useMesa();
  const t = useTextos();
  const [fase, setFase] = useState<
    'pregunta' | 'esperando' | 'rechazado' | 'vencido' | 'bloqueada' | 'otraMesa'
  >(llena?.bloqueada ? 'bloqueada' : 'pregunta');
  const [error, setError] = useState('');
  const solicitud = useRef<api.Solicitud | null>(null);

  const pedir = async () => {
    setError('');
    try {
      solicitud.current = await api.pedirIngreso(tokenQr);
      setFase('esperando');
    } catch (e) {
      const err = e as api.ErrorApi;
      if (err.status === 423) setFase('bloqueada');
      else setError(err.message);
    }
  };

  useEffect(() => {
    if (fase !== 'esperando') return;
    const consultar = setInterval(async () => {
      if (!solicitud.current) return;
      const r = await api.estadoIngreso(tokenQr, solicitud.current).catch(() => null);
      if (!r) return;
      if (r.estado === 'ACEPTADA') entrar(r.token);
      else if (r.estado === 'RECHAZADA') setFase('rechazado');
      else if (r.estado === 'VENCIDA') setFase('vencido');
    }, 2000);
    return () => clearInterval(consultar);
  }, [fase, tokenQr, entrar]);

  if (fase === 'esperando') return <Cargando texto={t.esperandoIngreso} />;
  const mensaje = {
    pregunta: `${llena ? t.mesaLlena(llena.numero, llena.personas) : ''} ${t.mesaLlenaPregunta}`,
    rechazado: t.ingresoRechazado,
    vencido: t.ingresoVencido,
    bloqueada: t.mesaBloqueada,
    otraMesa: t.noEstoyDetalle,
  }[fase];
  return (
    <Main>
      <div className="anim-entrar mx-auto my-auto flex w-full max-w-sm flex-col items-center gap-4 py-12 text-center">
        <span className="grid size-20 place-items-center rounded-full bg-purple-soft text-purple">
          <Users className="size-9" aria-hidden />
        </span>
        <p className="text-lg font-semibold text-balance">{mensaje}</p>
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
        {(fase === 'pregunta' || fase === 'vencido' || fase === 'rechazado') && (
          <button type="button" onClick={pedir} className={`${boton} bg-purple text-on-accent`}>
            <UserPlus className="size-5" aria-hidden />
            {fase === 'pregunta' ? t.siEstoy : t.volverAPedir}
          </button>
        )}
        {fase === 'pregunta' && (
          <button
            type="button"
            onClick={() => setFase('otraMesa')}
            className={`${boton} bg-surface text-fg`}
          >
            {t.noEstoy}
          </button>
        )}
      </div>
    </Main>
  );
}

// "¿Cuántas personas son?": lo responde el primero que escanea (y se puede cambiar en Mi cuenta).
export function PersonasModal({ onCerrar }: { onCerrar?: () => void }) {
  const { mesa, cuenta, refrescarCuenta } = useMesa();
  const t = useTextos();
  const [n, setN] = useState(cuenta?.personas ?? mesa?.personas ?? 2);
  const [guardando, setGuardando] = useState(false);
  const guardar = async () => {
    if (!mesa) return;
    setGuardando(true);
    await api.fijarPersonas(mesa.token, n).catch(() => {});
    refrescarCuenta();
    setGuardando(false);
    onCerrar?.();
  };
  return (
    <Modal etiqueta={t.personasTitulo} onCerrar={onCerrar ?? (() => {})}>
      <div className="flex flex-col items-center gap-4 py-6 text-center">
        <span className="grid size-16 place-items-center rounded-full bg-purple-soft text-purple">
          <Users className="size-8" aria-hidden />
        </span>
        <h2 className="text-xl font-semibold text-balance">{t.personasTitulo}</h2>
        <p className="text-sm text-muted">{t.personasDetalle}</p>
        <div className="scale-125 py-2">
          <QuantityStepper valor={n} onCambio={setN} min={1} max={30} />
        </div>
        <button
          type="button"
          onClick={guardar}
          disabled={guardando}
          className={`${boton} mt-2 bg-purple text-on-accent`}
        >
          {t.listo} · {t.somos(n)}
        </button>
      </div>
    </Modal>
  );
}

// A los de la mesa: alguien con el cupo lleno pide unirse.
export function SolicitudesIngreso() {
  const { mesa, solicitudes, responder } = useMesa();
  const t = useTextos();
  const id = solicitudes[0];
  if (!id || !mesa) return null;
  return (
    <Modal etiqueta={t.alguienQuiereEntrar(mesa.numero)} onCerrar={() => {}}>
      <div className="flex flex-col items-center gap-3 py-6 text-center">
        <span className="grid size-16 place-items-center rounded-full bg-amber-soft text-amber-ink">
          <UserPlus className="size-8" aria-hidden />
        </span>
        <h2 className="text-xl font-semibold text-balance">{t.alguienQuiereEntrar(mesa.numero)}</h2>
        <p className="text-sm text-muted">{t.alguienDetalle}</p>
        <div className="mt-2 grid w-full grid-cols-2 gap-2.5">
          <button
            type="button"
            onClick={() => responder(id, false)}
            className={`${boton} bg-surface text-fg`}
          >
            {t.rechazar}
          </button>
          <button
            type="button"
            onClick={() => responder(id, true)}
            className={`${boton} bg-purple text-on-accent`}
          >
            {t.aceptar}
          </button>
        </div>
      </div>
    </Modal>
  );
}
