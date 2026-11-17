import { Ban, Download, FileText, Mail, RotateCw, Search, Undo2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import {
  type AnularComprobanteInput,
  type LineaAcreditable,
  type NotaParcialInput,
  receptorSchema,
  TIPOS_IDENTIFICACION,
  type ComprobanteResumen,
  type ComprobantesCaja,
  type Contribuyente,
  type ReceptorInput,
} from '@menu-qr/shared';
import { api, descargar } from './api';
import { hora } from './ui';

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
  onAnular,
  onEnviarCorreo,
  onNotaParcial,
  ocupado,
}: {
  datos: ComprobantesCaja;
  precio: (c: number) => string;
  onReintentar: (id: string) => void;
  onAnular: (id: string, datos: AnularComprobanteInput) => Promise<boolean>;
  onEnviarCorreo: (id: string, correo: string) => Promise<boolean>;
  onNotaParcial: (id: string, datos: NotaParcialInput) => Promise<boolean>;
  ocupado: boolean;
}) {
  const [parcial, setParcial] = useState<string | null>(null);
  const [anulando, setAnulando] = useState<string | null>(null);
  const [enviando, setEnviando] = useState<{ id: string; correo: string } | null>(null);
  const lista = datos.comprobantes;
  return (
    <div className="grid items-start gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
      {!lista.length && (
        <p className="col-span-full rounded-lg border border-dashed border-line p-6 text-center text-sm text-muted">
          No hay comprobantes en esta vista.
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
            {c.estado === 'ACEPTADO' && (
              <>
                {c.correoEnviadoEn ? (
                  <p className="mt-1 text-xs text-ok">Enviado por correo a {c.correoPara}</p>
                ) : (
                  c.correoError && (
                    <p className="mt-1 text-xs text-amber-ink">
                      Correo a {c.correoPara} sin enviar: {c.correoError}
                    </p>
                  )
                )}
                <div className="mt-2 flex flex-wrap gap-1">
                  <button
                    type="button"
                    onClick={() =>
                      descargar(`/comprobantes/${c.id}/pdf`, `${TIPO[c.tipo]}-${c.consecutivo}.pdf`)
                    }
                    className="inline-flex min-h-11 items-center gap-1.5 rounded-md bg-surface px-3 font-medium hover:bg-surface-2"
                  >
                    <Download className="size-4" aria-hidden /> PDF
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setEnviando({ id: c.id, correo: c.correoPara ?? c.receptorCorreo ?? '' })
                    }
                    className="inline-flex min-h-11 items-center gap-1.5 rounded-md bg-surface px-3 font-medium hover:bg-surface-2"
                  >
                    <Mail className="size-4" aria-hidden />
                    {c.correoEnviadoEn ? 'Reenviar copia' : 'Enviar copia al cliente'}
                  </button>
                </div>
                {enviando?.id === c.id && (
                  <form
                    className="mt-2 flex gap-2"
                    onSubmit={async (e) => {
                      e.preventDefault();
                      if (await onEnviarCorreo(c.id, enviando.correo.trim())) setEnviando(null);
                    }}
                  >
                    <input
                      type="email"
                      required
                      value={enviando.correo}
                      placeholder="correo@cliente.com"
                      aria-label="Correo del cliente"
                      onChange={(e) => setEnviando({ id: c.id, correo: e.target.value })}
                      className={`${campo} mt-0 h-11 min-w-0 flex-1`}
                    />
                    <button
                      type="submit"
                      disabled={ocupado}
                      className="min-h-11 rounded-md bg-purple px-3 text-xs font-semibold text-on-accent disabled:opacity-50"
                    >
                      Enviar
                    </button>
                  </form>
                )}
              </>
            )}
            {c.anulado && (
              <p className="mt-1 text-xs font-semibold text-amber-ink">
                Anulado con nota de crédito
              </p>
            )}
            {c.notasParciales > 0 && (
              <p className="mt-1 text-xs font-semibold text-amber-ink">
                {c.notasParciales === 1
                  ? '1 devolución parcial'
                  : `${c.notasParciales} devoluciones parciales`}
              </p>
            )}
            {c.estado === 'ACEPTADO' &&
              c.tipo !== 'NC' &&
              !c.anulado &&
              anulando !== c.id &&
              parcial !== c.id && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {/* Con devoluciones parciales ya no se anula todo: se acredita lo que queda. */}
                  {c.notasParciales === 0 && (
                    <button
                      type="button"
                      disabled={ocupado}
                      onClick={() => setAnulando(c.id)}
                      className="inline-flex min-h-11 items-center gap-1.5 rounded-md px-3 font-medium text-muted hover:bg-surface disabled:opacity-50"
                    >
                      <Ban className="size-4" aria-hidden /> Anular
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={ocupado}
                    onClick={() => setParcial(c.id)}
                    className="inline-flex min-h-11 items-center gap-1.5 rounded-md px-3 font-medium text-muted hover:bg-surface disabled:opacity-50"
                  >
                    <Undo2 className="size-4" aria-hidden /> Devolución parcial
                  </button>
                </div>
              )}
            {parcial === c.id && (
              <FormParcial
                id={c.id}
                precio={precio}
                ocupado={ocupado}
                onCancelar={() => setParcial(null)}
                onEmitir={async (d) => {
                  if (await onNotaParcial(c.id, d)) setParcial(null);
                }}
              />
            )}
            {anulando === c.id && (
              <FormAnular
                ocupado={ocupado}
                onCancelar={() => setAnulando(null)}
                onAnular={async (d) => {
                  if (await onAnular(c.id, d)) setAnulando(null);
                }}
              />
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

// Anular con nota de crédito: motivo y, si se quiere, emitir otro comprobante del mismo cobro.
function FormAnular({
  ocupado,
  onCancelar,
  onAnular,
}: {
  ocupado: boolean;
  onCancelar: () => void;
  onAnular: (d: AnularComprobanteInput) => void;
}) {
  const [razon, setRazon] = useState('');
  const [reemitir, setReemitir] = useState(false);
  const [receptor, setReceptor] = useState<FormReceptor | null>(null);
  const factura = receptorDelCobro(receptor);
  const error =
    razon.trim().length < 5
      ? 'Escriba el motivo (5 caracteres o más)'
      : reemitir
        ? factura.error
        : null;
  return (
    <div className="mt-2 space-y-2 rounded-md bg-surface/60 p-2">
      <label className="block">
        <span className="text-xs font-medium">Motivo de la anulación</span>
        <input
          value={razon}
          maxLength={180}
          placeholder="Ej.: datos del cliente equivocados"
          onChange={(e) => setRazon(e.target.value)}
          className={`${campo} h-10`}
        />
      </label>
      <label className="flex min-h-11 items-center gap-2 text-xs">
        <input
          type="checkbox"
          checked={reemitir}
          onChange={(e) => setReemitir(e.target.checked)}
          className="size-5 accent-purple"
        />
        Emitir de nuevo (por ejemplo, con los datos correctos)
      </label>
      {reemitir && <FacturaA valor={receptor} onCambio={setReceptor} />}
      {error && razon && <p className="text-xs text-amber-ink">{error}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onCancelar}
          className="min-h-11 rounded-md px-3 text-xs font-medium hover:bg-surface"
        >
          Cancelar
        </button>
        <button
          type="button"
          disabled={ocupado || !!error}
          onClick={() =>
            onAnular({
              razon: razon.trim(),
              reemitir,
              receptor: reemitir ? factura.receptor : undefined,
            })
          }
          className="min-h-11 flex-1 rounded-md bg-danger px-3 text-xs font-semibold text-on-accent disabled:opacity-50"
        >
          Emitir nota de crédito
        </button>
      </div>
    </div>
  );
}

// Devolución parcial: cuántas unidades de cada plato se acreditan, el tipo y el motivo.
function FormParcial({
  id,
  precio,
  ocupado,
  onCancelar,
  onEmitir,
}: {
  id: string;
  precio: (c: number) => string;
  ocupado: boolean;
  onCancelar: () => void;
  onEmitir: (d: NotaParcialInput) => void;
}) {
  const [lineas, setLineas] = useState<LineaAcreditable[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cantidades, setCantidades] = useState<Record<number, number>>({});
  const [tipo, setTipo] = useState<NotaParcialInput['tipo']>('devolucion');
  const [razon, setRazon] = useState('');
  useEffect(() => {
    api<LineaAcreditable[]>(`/comprobantes/${id}/lineas`).then(setLineas, (e: Error) =>
      setError(e.message),
    );
  }, [id]);
  const elegidas = Object.entries(cantidades)
    .filter(([, n]) => n > 0)
    .map(([indice, cantidad]) => ({ indice: Number(indice), cantidad }));
  const aviso = !elegidas.length
    ? 'Elija al menos un plato'
    : razon.trim().length < 5
      ? 'Escriba el motivo (5 caracteres o más)'
      : null;
  return (
    <div className="mt-2 space-y-2 rounded-md bg-surface/60 p-2 text-xs">
      {error && <p className="text-danger">{error}</p>}
      {!lineas && !error && <p className="text-muted">Cargando platos…</p>}
      {lineas?.map((l) => (
        <label key={l.indice} className="flex min-h-11 items-center gap-2">
          <span className="min-w-0 flex-1">
            <span className="block truncate font-medium">{l.detalle}</span>
            <span className="text-muted">
              {precio(l.precioUnitario)} c/u · quedan {l.disponible} de {l.cantidad}
            </span>
          </span>
          <select
            value={cantidades[l.indice] ?? 0}
            disabled={!l.disponible}
            aria-label={`Unidades de ${l.detalle} a acreditar`}
            onChange={(e) => setCantidades((c) => ({ ...c, [l.indice]: Number(e.target.value) }))}
            className="h-10 rounded-lg border border-line bg-surface px-2"
          >
            {Array.from({ length: l.disponible + 1 }, (_, n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
      ))}
      <label className="block">
        <span className="font-medium">Tipo</span>
        <select
          value={tipo}
          onChange={(e) => setTipo(e.target.value as NotaParcialInput['tipo'])}
          className={`${campo} h-10`}
        >
          <option value="devolucion">El cliente devolvió (devolución)</option>
          <option value="error">Se cobró de más (error en el monto)</option>
        </select>
      </label>
      <label className="block">
        <span className="font-medium">Motivo</span>
        <input
          value={razon}
          maxLength={180}
          placeholder="Ej.: devolvió un refresco"
          onChange={(e) => setRazon(e.target.value)}
          className={`${campo} h-10`}
        />
      </label>
      {aviso && (elegidas.length > 0 || razon) && <p className="text-amber-ink">{aviso}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onCancelar}
          className="min-h-11 rounded-md px-3 font-medium hover:bg-surface"
        >
          Cancelar
        </button>
        <button
          type="button"
          disabled={ocupado || !!aviso}
          onClick={() => onEmitir({ razon: razon.trim(), tipo, lineas: elegidas })}
          className="min-h-11 flex-1 rounded-md bg-danger px-3 font-semibold text-on-accent disabled:opacity-50"
        >
          Emitir nota de crédito
        </button>
      </div>
    </div>
  );
}
