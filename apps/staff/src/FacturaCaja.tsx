import { FileText, RotateCw, Search } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import {
  receptorSchema,
  TIPOS_IDENTIFICACION,
  type ComprobanteResumen,
  type ComprobantesCaja,
  type Contribuyente,
  type ReceptorInput,
} from '@menu-qr/shared';
import { api } from './api';
import { hora, TituloColumna } from './ui';

// --- Factura electrónica en la caja (Fase 15.3) ---

export type FormReceptor = {
  tipoId: ReceptorInput['tipoId'];
  numero: string;
  nombre: string;
  correo: string;
};
export const RECEPTOR_VACIO: FormReceptor = { tipoId: '01', numero: '', nombre: '', correo: '' };

// Lo que va en el cuerpo del cobro: nada (tiquete), el receptor (factura) o un error que impide cobrar.
export function receptorDelCobro(r: FormReceptor | null): {
  receptor?: ReceptorInput;
  error: string | null;
} {
  if (!r) return { error: null };
  const p = receptorSchema.safeParse({
    tipoId: r.tipoId,
    numero: r.numero.replace(/\D/g, ''),
    nombre: r.nombre,
    correo: r.correo.trim() || undefined,
  });
  return p.success
    ? { receptor: p.data, error: null }
    : { error: p.error.issues[0]?.message ?? 'Revise los datos de la factura' };
}

export function useComprobantes(version: number) {
  const [datos, setDatos] = useState<ComprobantesCaja | null>(null);
  const cargar = useCallback(async () => {
    setDatos(await api<ComprobantesCaja>('/comprobantes').catch(() => null));
  }, []);
  useEffect(() => {
    cargar();
  }, [cargar, version]);
  // Mientras alguno espera a Hacienda, se vuelve a consultar cada 10 s.
  const esperando = datos?.comprobantes.some(
    (c) => c.estado === 'PENDIENTE' || c.estado === 'ENVIADO',
  );
  useEffect(() => {
    if (!esperando) return;
    const t = setInterval(cargar, 10_000);
    return () => clearInterval(t);
  }, [esperando, cargar]);
  return { datos, setDatos, cargar };
}

const campo = 'mt-1 h-11 w-full rounded-xl border border-line bg-surface px-3';

// "Factura a nombre de…": si se llena, se emite factura en vez de tiquete.
export function FacturaA({
  valor,
  onCambio,
}: {
  valor: FormReceptor | null;
  onCambio: (r: FormReceptor | null) => void;
}) {
  const [buscando, setBuscando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  if (!valor)
    return (
      <button
        type="button"
        onClick={() => onCambio(RECEPTOR_VACIO)}
        className="mt-3 inline-flex min-h-11 items-center gap-1.5 rounded-md px-3 text-sm font-medium hover:bg-surface"
      >
        <FileText className="size-4" aria-hidden /> Factura a nombre de…
      </button>
    );
  const poner = (cambio: Partial<FormReceptor>) => onCambio({ ...valor, ...cambio });
  const buscar = async () => {
    setBuscando(true);
    setAviso(null);
    try {
      const c = await api<Contribuyente>(
        `/comprobantes/contribuyente?id=${valor.numero.replace(/\D/g, '')}`,
      );
      poner({
        nombre: c.nombre,
        tipoId: (['01', '02', '03', '04'].includes(c.tipoId)
          ? c.tipoId
          : valor.tipoId) as FormReceptor['tipoId'],
      });
    } catch (e) {
      setAviso((e as Error).message);
    } finally {
      setBuscando(false);
    }
  };
  return (
    <fieldset className="mt-3 space-y-2 rounded-lg bg-surface/60 p-3 text-sm">
      <div className="flex items-center justify-between">
        <legend className="font-semibold">Factura electrónica a nombre de</legend>
        <button
          type="button"
          onClick={() => onCambio(null)}
          className="min-h-11 rounded-md px-3 text-muted hover:bg-surface"
        >
          Quitar (tiquete)
        </button>
      </div>
      <div className="grid gap-2 sm:grid-cols-[160px_1fr]">
        <label>
          <span className="font-medium">Tipo</span>
          <select
            value={valor.tipoId}
            onChange={(e) => poner({ tipoId: e.target.value as FormReceptor['tipoId'] })}
            className={campo}
          >
            {TIPOS_IDENTIFICACION.map((t) => (
              <option key={t.id} value={t.id}>
                {t.texto}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="font-medium">Número (sin guiones)</span>
          <span className="mt-1 flex gap-2">
            <input
              inputMode="numeric"
              maxLength={12}
              value={valor.numero}
              onChange={(e) => poner({ numero: e.target.value.replace(/\D/g, '') })}
              className={`${campo} mt-0 tabular-nums`}
            />
            <button
              type="button"
              disabled={buscando || valor.numero.length < 9}
              onClick={buscar}
              className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-md bg-surface px-3 font-medium hover:bg-surface-2 disabled:opacity-50"
            >
              <Search className="size-4" aria-hidden /> {buscando ? '…' : 'Buscar'}
            </button>
          </span>
        </label>
      </div>
      {aviso && <p className="text-amber-ink">{aviso}</p>}
      <label className="block">
        <span className="font-medium">Nombre</span>
        <input
          value={valor.nombre}
          maxLength={100}
          onChange={(e) => poner({ nombre: e.target.value })}
          className={campo}
        />
      </label>
      <label className="block">
        <span className="font-medium">Correo (para enviarle la factura)</span>
        <input
          type="email"
          value={valor.correo}
          maxLength={160}
          onChange={(e) => poner({ correo: e.target.value })}
          className={campo}
        />
      </label>
    </fieldset>
  );
}

const ESTADO: Record<ComprobanteResumen['estado'], [string, string]> = {
  PENDIENTE: ['Por enviar', 'bg-surface-2 text-muted'],
  ENVIADO: ['En Hacienda', 'bg-info-soft text-info'],
  ACEPTADO: ['Aceptado', 'bg-ok-soft text-ok'],
  RECHAZADO: ['Rechazado', 'bg-danger-soft text-danger'],
  ERROR: ['Con error', 'bg-danger-soft text-danger'],
};
const TIPO: Record<ComprobanteResumen['tipo'], string> = {
  TE: 'Tiquete',
  FE: 'Factura',
  NC: 'Nota de crédito',
};

// Últimos comprobantes con su estado en Hacienda.
export function ListaComprobantes({
  datos,
  precio,
  onReintentar,
  ocupado,
}: {
  datos: ComprobantesCaja;
  precio: (c: number) => string;
  onReintentar: (id: string) => void;
  ocupado: boolean;
}) {
  const lista = datos.comprobantes.slice(0, 8);
  const conProblema = datos.comprobantes.filter(
    (c) => c.estado === 'ERROR' || c.estado === 'RECHAZADO',
  ).length;
  return (
    <div className="space-y-2 pt-4">
      <TituloColumna
        titulo="Factura electrónica"
        punto={conProblema ? 'bg-danger' : 'bg-ok'}
        cantidad={conProblema || undefined}
      />
      {!lista.length && (
        <p className="rounded-lg border border-dashed border-line p-4 text-center text-sm text-muted">
          Cada cobro genera su comprobante y se envía solo a Hacienda.
        </p>
      )}
      {lista.map((c) => {
        const [texto, clase] = ESTADO[c.estado];
        const problema = c.estado === 'ERROR' || c.estado === 'RECHAZADO';
        return (
          <div key={c.id} className="rounded-lg bg-app p-3 text-sm shadow-tarjeta">
            <div className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate font-semibold">
                {TIPO[c.tipo]} · {c.lugar}
              </span>
              <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${clase}`}>
                {texto}
              </span>
            </div>
            <p className="mt-0.5 text-xs text-muted">
              {hora(c.createdAt)} · {precio(c.total)}
              {c.receptorNombre ? ` · ${c.receptorNombre}` : ''} · N.º{' '}
              {c.consecutivo.slice(-10).replace(/^0+/, '')}
            </p>
            {problema && c.mensaje && (
              <p className="mt-1 line-clamp-3 text-xs text-danger">{c.mensaje}</p>
            )}
            {c.estado !== 'ACEPTADO' && (
              <button
                type="button"
                disabled={ocupado}
                onClick={() => onReintentar(c.id)}
                className="mt-2 inline-flex min-h-11 items-center gap-1.5 rounded-md bg-surface px-3 font-medium hover:bg-surface-2 disabled:opacity-50"
              >
                <RotateCw className="size-4" aria-hidden />
                {problema ? 'Volver a emitir' : 'Enviar ahora'}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
