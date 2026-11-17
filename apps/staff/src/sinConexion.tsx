import { CloudOff, RefreshCw, X } from 'lucide-react';
import { useEffect, useSyncExternalStore } from 'react';
import {
  describirAccion,
  esEncolable,
  vaciarCola,
  type AccionEnCola,
  type ResultadoEnvio,
} from '@menu-qr/shared/cola';
import { api, ErrorApi, FOTO, guardarFoto, leerFoto } from './api';

// Aguantar cortes cortos (Fase 18): las acciones de cocina y mesero que no llegan por falta de
// internet se guardan en este equipo y se envían solas, en orden, al volver la conexión.

const CLAVE = 'kitchago:cola';
type Estado = {
  sinRed: boolean;
  cola: AccionEnCola[];
  enviando: boolean;
  descartadas: AccionEnCola[];
  fotoEn: number | null; // si la pantalla muestra datos guardados: de cuándo son
};

function leerCola(): AccionEnCola[] {
  try {
    return JSON.parse(localStorage.getItem(CLAVE) ?? '[]') as AccionEnCola[];
  } catch {
    return [];
  }
}

let estado: Estado = {
  sinRed: !navigator.onLine,
  cola: leerCola(),
  enviando: false,
  descartadas: [],
  fotoEn: null,
};
const oyentes = new Set<() => void>();
function cambiar(parcial: Partial<Estado>) {
  estado = { ...estado, ...parcial };
  if (parcial.cola) {
    try {
      localStorage.setItem(CLAVE, JSON.stringify(parcial.cola));
    } catch {
      // Sin almacenamiento (modo privado): la cola vive solo mientras la pestaña esté abierta.
    }
  }
  oyentes.forEach((o) => o());
}

export const useConexion = () =>
  useSyncExternalStore(
    (o) => {
      oyentes.add(o);
      return () => oyentes.delete(o);
    },
    () => estado,
  );

export const esSinRed = (e: unknown) => e instanceof ErrorApi && e.status === 0;

// Lectura que guarda una foto de cada respuesta. Sin internet y con `usarFoto` (la primera carga de
// la pantalla) devuelve la última foto; si no, falla y la pantalla se queda con lo que ya tenía
// (así no se pierde lo que se marcó sin conexión).
export async function leerConFoto<T>(ruta: string, usarFoto: boolean): Promise<T> {
  try {
    const d = await api<T>(ruta);
    guardarFoto(ruta, d);
    if (estado.sinRed || estado.fotoEn) cambiar({ sinRed: false, fotoEn: null });
    return d;
  } catch (e) {
    if (!esSinRed(e)) throw e;
    const f = usarFoto ? leerFoto<T>(ruta) : null;
    cambiar({ sinRed: true, ...(f && { fotoEn: Math.min(f.en, estado.fotoEn ?? f.en) }) });
    if (f) return f.d;
    throw e;
  }
}

// Al cerrar sesión se borran las fotos (no la cola: son acciones ya hechas por el personal).
export function borrarFotos() {
  try {
    for (const k of Object.keys(localStorage)) if (k.startsWith(FOTO)) localStorage.removeItem(k);
  } catch {
    // Sin almacenamiento: no hay nada que borrar.
  }
  cambiar({ fotoEn: null });
}

const sinRed = (e: unknown) => e instanceof ErrorApi && (e.status === 0 || e.status >= 500);

// Como `api`, pero si no hay internet y la acción se puede repetir, la guarda y no falla.
// Si ya hay acciones esperando, la nueva va detrás de ellas para respetar el orden.
export async function apiOEncolar(ruta: string, init: { method: string; body?: unknown }) {
  const encolable = esEncolable(init.method, ruta);
  const encolar = () => {
    const accion: AccionEnCola = {
      id: crypto.randomUUID(),
      method: init.method.toUpperCase(),
      ruta,
      body: init.body,
      texto: describirAccion(init.method, ruta),
      creada: Date.now(),
    };
    cambiar({ cola: [...estado.cola, accion], sinRed: estado.sinRed || !navigator.onLine });
    return { encolada: true as const };
  };
  if (encolable && estado.cola.length > 0) {
    const r = encolar();
    if (navigator.onLine) void enviarPendientes();
    return r;
  }
  try {
    const r = await api(ruta, init);
    if (estado.sinRed) cambiar({ sinRed: false });
    return { encolada: false as const, datos: r };
  } catch (e) {
    if (e instanceof ErrorApi && e.status === 0) {
      cambiar({ sinRed: true });
      if (encolable) return encolar();
    }
    throw e;
  }
}

async function enviarUna(a: AccionEnCola): Promise<ResultadoEnvio> {
  try {
    await api(a.ruta, { method: a.method, body: a.body });
    return 'ok';
  } catch (e) {
    return sinRed(e) ? 'sin-red' : 'rechazada';
  }
}

// Envía lo pendiente. Al terminar avisa a las pantallas para que recarguen los datos.
export async function enviarPendientes() {
  if (estado.enviando || estado.cola.length === 0) return;
  cambiar({ enviando: true });
  const enviadas = estado.cola;
  const { pendientes, descartadas } = await vaciarCola(enviadas, enviarUna);
  // Lo que se encoló mientras se enviaba va detrás de lo que quedó pendiente.
  const nuevas = estado.cola.slice(enviadas.length);
  cambiar({
    cola: [...pendientes, ...nuevas],
    enviando: false,
    sinRed: pendientes.length > 0,
    descartadas: [...estado.descartadas, ...descartadas],
  });
  if (pendientes.length < enviadas.length) window.dispatchEvent(new Event('kitchago:cola-enviada'));
}

// Aviso abajo de la pantalla y reintentos: al volver la red y cada 10 s mientras haya pendientes.
export function AvisoConexion() {
  const { sinRed, cola, enviando, descartadas, fotoEn } = useConexion();
  useEffect(() => {
    const online = () => {
      cambiar({ sinRed: false });
      void enviarPendientes();
    };
    const offline = () => cambiar({ sinRed: true });
    window.addEventListener('online', online);
    window.addEventListener('offline', offline);
    const reloj = setInterval(() => void enviarPendientes(), 10_000);
    void enviarPendientes();
    return () => {
      window.removeEventListener('online', online);
      window.removeEventListener('offline', offline);
      clearInterval(reloj);
    };
  }, []);

  if (!sinRed && cola.length === 0 && descartadas.length === 0) return null;
  const n = cola.length;
  const acciones = (k: number) => `${k} ${k === 1 ? 'acción' : 'acciones'}`;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex flex-col items-center gap-2 p-3">
      {descartadas.length > 0 && (
        <div
          role="alert"
          className="pointer-events-auto flex w-full max-w-xl items-start gap-3 rounded-lg bg-danger-soft p-3 text-sm text-danger shadow-lg"
        >
          <div className="min-w-0 flex-1">
            <p className="font-semibold">
              {acciones(descartadas.length)} no se aplicaron: otro equipo ya las había cambiado.
            </p>
            <p className="truncate">{[...new Set(descartadas.map((d) => d.texto))].join(' · ')}</p>
          </div>
          <button
            type="button"
            onClick={() => cambiar({ descartadas: [] })}
            className="grid size-8 shrink-0 place-items-center rounded-md hover:bg-danger/10"
            aria-label="Cerrar aviso"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>
      )}
      {(sinRed || n > 0) && (
        <div
          role="status"
          className={`pointer-events-auto flex w-full max-w-xl items-start gap-3 rounded-lg p-3 text-sm shadow-lg ${
            sinRed ? 'bg-amber-soft text-amber-ink' : 'bg-info-soft text-info'
          }`}
        >
          {sinRed ? (
            <CloudOff className="mt-0.5 size-4 shrink-0" aria-hidden />
          ) : (
            <RefreshCw
              className={`mt-0.5 size-4 shrink-0 ${enviando ? 'animate-spin' : ''}`}
              aria-hidden
            />
          )}
          <p className="min-w-0 flex-1">
            {sinRed ? (
              <>
                <strong>Sin conexión.</strong> Lo de cocina y mesero se guarda en este equipo y se
                envía solo al volver{n > 0 && <> ({acciones(n)} esperando)</>}. Cobrar y la caja
                necesitan internet.
                {fotoEn && (
                  <>
                    {' '}
                    Lo que ve es de las{' '}
                    {new Date(fotoEn).toLocaleTimeString('es-CR', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                    .
                  </>
                )}
              </>
            ) : (
              <>Conexión de vuelta: enviando {acciones(n)}…</>
            )}
          </p>
          {n > 0 && !enviando && (
            <button
              type="button"
              onClick={() => void enviarPendientes()}
              className="shrink-0 font-semibold underline underline-offset-2"
            >
              Reintentar
            </button>
          )}
        </div>
      )}
    </div>
  );
}
