import { ArrowDownToLine, ArrowUpFromLine, Lock, Printer, Wallet, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import type { TurnoCajaDetalle } from '@menu-qr/shared';
import { api } from './api';
import { hora } from './ui';
import { confirmar } from './dialogos';

// Billetes y monedas de Costa Rica (céntimos) para ayudar a contar la gaveta.
const DENOMINACIONES = [
  2000000, 1000000, 500000, 200000, 100000, 50000, 10000, 5000, 2500, 1000, 500,
];

const aCentimos = (v: string) => {
  const n = Number(v.replace(/[\s,]/g, ''));
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : 0;
};
const campo = 'h-11 w-full rounded-xl border border-line bg-surface px-3 tabular-nums';
const botonSuave =
  'inline-flex min-h-11 items-center justify-center gap-1.5 rounded-md bg-surface px-3 text-sm font-medium hover:bg-surface-2 disabled:opacity-50';
const botonFuerte =
  'inline-flex min-h-11 items-center justify-center gap-1.5 rounded-md bg-purple px-4 text-sm font-semibold text-on-accent disabled:opacity-50';

type Props = {
  precio: (c: number) => string;
  billetes: boolean; // conteo por billetes (solo en colones)
  version: number; // cambia cuando hay ventas nuevas: recalcula el esperado
  onImprimir: (t: TurnoCajaDetalle) => void;
};

// Arqueo de caja (Fase 14): abrir con fondo, entradas/salidas y cierre contando el efectivo.
export function TurnoCaja({ precio, billetes, version, onImprimir }: Props) {
  const [turno, setTurno] = useState<TurnoCajaDetalle | null | undefined>(undefined);
  const [modo, setModo] = useState<'nada' | 'movimiento' | 'cerrar'>('nada');
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [fondo, setFondo] = useState('');
  const [cerrado, setCerrado] = useState<TurnoCajaDetalle | null>(null);

  const cargar = useCallback(async () => {
    try {
      setTurno(await api<TurnoCajaDetalle | null>('/caja/turno'));
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  useEffect(() => {
    cargar();
  }, [cargar, version]);

  const accion = async (fn: () => Promise<void>) => {
    setOcupado(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setOcupado(false);
    }
  };

  const cancelar = useCallback(() => setModo('nada'), []);

  if (turno === undefined) return null;

  if (!turno)
    return (
      <div className="space-y-3 rounded-lg border-2 border-dashed border-amber bg-app p-4">
        <p className="flex items-center gap-2 font-semibold">
          <Lock className="size-5 text-amber" aria-hidden /> Caja cerrada
        </p>
        {cerrado && (
          <div className="rounded-md bg-surface p-3 text-sm">
            <p>
              Último cierre: <Diferencia valor={cerrado.diferencia ?? 0} precio={precio} />
            </p>
            <button
              type="button"
              onClick={() => onImprimir(cerrado)}
              className={`${botonSuave} mt-2`}
            >
              <Printer className="size-4" aria-hidden /> Imprimir cierre
            </button>
          </div>
        )}
        <label className="block text-sm">
          <span className="font-medium">Fondo inicial (el sencillo con que empieza)</span>
          <input
            type="number"
            inputMode="decimal"
            min={0}
            value={fondo}
            placeholder="0"
            onChange={(e) => setFondo(e.target.value)}
            className={`${campo} mt-1`}
          />
        </label>
        {error && <p className="text-sm text-danger">{error}</p>}
        <button
          type="button"
          disabled={ocupado}
          onClick={() =>
            accion(async () => {
              setTurno(
                await api<TurnoCajaDetalle>('/caja/turno/abrir', {
                  method: 'POST',
                  body: { fondoInicial: aCentimos(fondo) },
                }),
              );
              setFondo('');
              setCerrado(null);
            })
          }
          className={`${botonFuerte} w-full`}
        >
          Abrir caja
        </button>
      </div>
    );

  const r = turno.resumen;
  const fila = (texto: string, monto: number, signo = '') => (
    <div className="flex justify-between">
      <span className="text-muted">{texto}</span>
      <span className="tabular-nums">
        {signo}
        {precio(monto)}
      </span>
    </div>
  );

  return (
    <div className="space-y-3 rounded-lg bg-app p-4 shadow-tarjeta">
      <div className="flex items-start justify-between gap-2">
        <p className="flex items-center gap-2 font-semibold">
          <Wallet className="size-5 text-ok" aria-hidden /> Caja abierta
        </p>
        <span className="text-right text-xs text-muted">
          desde {hora(turno.abiertoEn)}
          <br />
          {turno.abiertoPorNombre}
        </span>
      </div>
      <div>
        <p className="text-xs text-muted">Efectivo que debe haber</p>
        <p className="font-display text-3xl font-extrabold tabular-nums">
          {precio(r.efectivoEsperado)}
        </p>
      </div>
      <div className="space-y-0.5 text-sm">
        {fila('Fondo inicial', turno.fondoInicial)}
        {fila('Ventas en efectivo', r.ventasEfectivo, '+ ')}
        {r.entradas > 0 && fila('Entradas', r.entradas, '+ ')}
        {r.salidas > 0 && fila('Salidas', r.salidas, '− ')}
        <hr className="my-1 border-line" />
        {fila('Tarjeta', r.ventasTarjeta)}
        {fila('SINPE Móvil', r.ventasSinpe)}
        <p className="text-xs text-muted">
          {r.cuentas === 1 ? '1 cuenta cobrada' : `${r.cuentas} cuentas cobradas`}
        </p>
      </div>

      {modo === 'nada' && (
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setModo('movimiento')} className={botonSuave}>
            Entrada / salida
          </button>
          <button
            type="button"
            onClick={() => setModo('cerrar')}
            className={`${botonFuerte} flex-1`}
          >
            Cerrar caja
          </button>
        </div>
      )}
      {modo === 'movimiento' && (
        <FormMovimiento
          ocupado={ocupado}
          onCancelar={() => setModo('nada')}
          onGuardar={(body) =>
            accion(async () => {
              setTurno(
                await api<TurnoCajaDetalle>('/caja/turno/movimientos', { method: 'POST', body }),
              );
              setModo('nada');
            })
          }
        />
      )}
      {modo === 'cerrar' && (
        <FormCierre
          turno={turno}
          precio={precio}
          billetes={billetes}
          ocupado={ocupado}
          error={error}
          onCancelar={cancelar}
          onCerrar={(body) =>
            accion(async () => {
              const t = await api<TurnoCajaDetalle>('/caja/turno/cerrar', {
                method: 'POST',
                body,
              });
              setModo('nada');
              setTurno(null);
              setCerrado(t);
              onImprimir(t);
            })
          }
        />
      )}
      {error && <p className="text-sm text-danger">{error}</p>}

      {turno.movimientos.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-muted">
            Movimientos ({turno.movimientos.length})
          </summary>
          <ul className="mt-1 space-y-1">
            {turno.movimientos.map((m) => (
              <li key={m.id} className="flex justify-between gap-2">
                <span>
                  {hora(m.createdAt)} · {m.motivo}
                </span>
                <span className={`tabular-nums ${m.tipo === 'SALIDA' ? 'text-danger' : 'text-ok'}`}>
                  {m.tipo === 'SALIDA' ? '−' : '+'}
                  {precio(m.monto)}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function FormMovimiento({
  ocupado,
  onCancelar,
  onGuardar,
}: {
  ocupado: boolean;
  onCancelar: () => void;
  onGuardar: (b: { tipo: 'ENTRADA' | 'SALIDA'; monto: number; motivo: string }) => void;
}) {
  const [tipo, setTipo] = useState<'ENTRADA' | 'SALIDA'>('SALIDA');
  const [monto, setMonto] = useState('');
  const [motivo, setMotivo] = useState('');
  const opcion = (t: typeof tipo, texto: string, Icono: typeof ArrowUpFromLine) => (
    <button
      type="button"
      aria-pressed={tipo === t}
      onClick={() => setTipo(t)}
      className={`inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-md text-sm font-medium ${tipo === t ? 'bg-purple text-on-accent' : 'bg-surface'}`}
    >
      <Icono className="size-4" aria-hidden /> {texto}
    </button>
  );
  return (
    <div className="space-y-2 rounded-md bg-surface/50 p-3">
      <div className="flex gap-2">
        {opcion('SALIDA', 'Sale dinero', ArrowUpFromLine)}
        {opcion('ENTRADA', 'Entra dinero', ArrowDownToLine)}
      </div>
      <input
        type="number"
        inputMode="decimal"
        min={0}
        value={monto}
        placeholder="Monto"
        aria-label="Monto"
        onChange={(e) => setMonto(e.target.value)}
        className={campo}
      />
      <input
        value={motivo}
        maxLength={120}
        placeholder={
          tipo === 'SALIDA' ? 'Motivo: pago del gas, retiro…' : 'Motivo: cambio que trajo el dueño…'
        }
        aria-label="Motivo"
        onChange={(e) => setMotivo(e.target.value)}
        className={campo}
      />
      <div className="flex gap-2">
        <button type="button" onClick={onCancelar} className={botonSuave}>
          Cancelar
        </button>
        <button
          type="button"
          disabled={ocupado || !aCentimos(monto) || !motivo.trim()}
          onClick={() => onGuardar({ tipo, monto: aCentimos(monto), motivo: motivo.trim() })}
          className={`${botonFuerte} flex-1`}
        >
          Guardar
        </button>
      </div>
    </div>
  );
}

const BILLETES = DENOMINACIONES.filter((d) => d >= 100000);
const MONEDAS = DENOMINACIONES.filter((d) => d < 100000);

// Cierre de caja a pantalla completa: conteo a la izquierda, resumen a la derecha (en celular,
// uno debajo del otro y una barra fija abajo con la diferencia y el botón).
function FormCierre({
  turno,
  precio,
  billetes,
  ocupado,
  error,
  onCancelar,
  onCerrar,
}: {
  turno: TurnoCajaDetalle;
  precio: (c: number) => string;
  billetes: boolean;
  ocupado: boolean;
  error: string | null;
  onCancelar: () => void;
  onCerrar: (b: { efectivoContado: number; nota?: string }) => void;
}) {
  const [conteo, setConteo] = useState<Record<number, string>>({});
  const [total, setTotal] = useState('');
  const [nota, setNota] = useState('');
  const r = turno.resumen;
  const cantidad = (d: number) => Math.max(0, Math.floor(Number(conteo[d] || 0)));
  const sumaConteo = DENOMINACIONES.reduce((n, d) => n + d * cantidad(d), 0);
  // Si escribe el total a mano, manda ese; si no, la suma del conteo.
  const contado = total.trim() ? aCentimos(total) : sumaConteo;
  const hayConteo = total.trim() !== '' || sumaConteo > 0;
  const cerrar = async () =>
    hayConteo &&
    (await confirmar(`¿Cerrar la caja con ${precio(contado)} contados?`, {
      boton: 'Cerrar caja',
    })) &&
    onCerrar({ efectivoContado: contado, nota: nota.trim() || undefined });

  // Bloquea el scroll de atrás y cierra con Escape.
  useEffect(() => {
    const antes = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancelar();
    };
    window.addEventListener('keydown', tecla);
    return () => {
      document.body.style.overflow = antes;
      window.removeEventListener('keydown', tecla);
    };
  }, [onCancelar]);

  const grupo = (titulo: string, lista: number[]) => (
    <fieldset>
      <legend className="mb-2 text-sm font-semibold tracking-wide text-muted uppercase">
        {titulo}
      </legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {lista.map((d) => (
          <label
            key={d}
            className={`flex items-center gap-3 rounded-lg p-2 ${cantidad(d) ? 'bg-surface-2' : 'bg-surface'}`}
          >
            <span className="w-[4.5rem] shrink-0 text-right font-semibold tabular-nums">
              {precio(d)}
            </span>
            <span aria-hidden className="text-muted">
              ×
            </span>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              value={conteo[d] ?? ''}
              placeholder="0"
              aria-label={`Cantidad de ${precio(d)}`}
              onChange={(e) => setConteo((c) => ({ ...c, [d]: e.target.value }))}
              className="h-12 w-20 shrink-0 rounded-lg border border-line bg-app px-2 text-center text-lg tabular-nums"
            />
            <span className="ml-auto min-w-0 truncate text-sm text-muted tabular-nums">
              {cantidad(d) ? precio(d * cantidad(d)) : ''}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
  const fila = (texto: string, monto: number, fuerte = false) => (
    <div className={`flex justify-between gap-2 ${fuerte ? 'font-semibold' : ''}`}>
      <span className={fuerte ? '' : 'text-muted'}>{texto}</span>
      <span className="tabular-nums">{precio(monto)}</span>
    </div>
  );

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="titulo-cierre"
      className="tema-operacion fixed inset-0 z-50 overflow-y-auto print:hidden"
    >
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-line bg-[var(--bg)] px-4 py-3">
        <div className="min-w-0 flex-1">
          <h2 id="titulo-cierre" className="font-display text-2xl font-extrabold">
            Cerrar caja
          </h2>
          <p className="truncate text-sm text-muted">
            Abierta desde {hora(turno.abiertoEn)} por {turno.abiertoPorNombre}
          </p>
        </div>
        <button
          type="button"
          onClick={onCancelar}
          aria-label="Volver sin cerrar"
          className="grid size-11 place-items-center rounded-md bg-surface hover:bg-surface-2"
        >
          <X className="size-5" aria-hidden />
        </button>
      </header>

      <div className="mx-auto grid max-w-7xl gap-4 p-4 pb-28 lg:grid-cols-[1fr_400px] lg:pb-4">
        <section className="space-y-5 rounded-lg bg-app p-4 shadow-tarjeta">
          <div>
            <h3 className="text-lg font-semibold">1. Cuente el efectivo de la gaveta</h3>
            <p className="text-sm text-muted">
              {billetes
                ? 'Anote cuántos hay de cada billete y moneda, o escriba el total abajo.'
                : 'Escriba el total contado.'}
            </p>
          </div>
          {billetes && grupo('Billetes', BILLETES)}
          {billetes && grupo('Monedas', MONEDAS)}
          <label className="block max-w-sm">
            <span className="font-medium">
              {billetes ? 'O escriba el total contado' : 'Total contado'}
            </span>
            <input
              type="number"
              inputMode="decimal"
              min={0}
              value={total}
              placeholder={billetes && sumaConteo ? String(sumaConteo / 100) : '0'}
              onChange={(e) => setTotal(e.target.value)}
              className={`${campo} mt-1 h-12 text-lg`}
            />
          </label>
        </section>

        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <section className="space-y-3 rounded-lg bg-app p-4 shadow-tarjeta">
            <h3 className="text-lg font-semibold">2. Compare</h3>
            <div className="space-y-1 text-sm">
              {fila('Fondo inicial', turno.fondoInicial)}
              {fila('Ventas en efectivo', r.ventasEfectivo)}
              {r.entradas > 0 && fila('Entradas', r.entradas)}
              {r.salidas > 0 && fila('Salidas', -r.salidas)}
              <hr className="border-line" />
              {fila('Efectivo esperado', r.efectivoEsperado, true)}
              {fila('Efectivo contado', contado, true)}
            </div>
            <p className="rounded-md bg-surface p-3 text-center font-display text-2xl font-extrabold">
              {hayConteo ? (
                <Diferencia valor={contado - r.efectivoEsperado} precio={precio} />
              ) : (
                <span className="text-muted">Falta contar</span>
              )}
            </p>
            <div className="space-y-1 text-sm">
              <p className="font-medium">Para cuadrar con el datáfono y los comprobantes</p>
              {fila('Tarjeta', r.ventasTarjeta)}
              {fila('SINPE Móvil', r.ventasSinpe)}
              <p className="text-xs text-muted">
                {r.cuentas === 1 ? '1 cuenta cobrada' : `${r.cuentas} cuentas cobradas`}
              </p>
            </div>
            <label className="block text-sm">
              <span className="font-medium">Nota (opcional)</span>
              <textarea
                value={nota}
                maxLength={300}
                placeholder="Por qué hay diferencia…"
                onChange={(e) => setNota(e.target.value)}
                className="mt-1 min-h-20 w-full rounded-xl border border-line bg-surface p-3"
              />
            </label>
            {error && <p className="text-sm text-danger">{error}</p>}
            <div className="hidden gap-2 lg:flex">
              <button type="button" onClick={onCancelar} className={botonSuave}>
                Volver
              </button>
              <button
                type="button"
                disabled={ocupado || !hayConteo}
                onClick={cerrar}
                className={`${botonFuerte} flex-1`}
              >
                <Printer className="size-4" aria-hidden /> Cerrar e imprimir
              </button>
            </div>
          </section>
        </aside>
      </div>

      {/* Celular y tableta: diferencia y botón siempre a la vista. */}
      <div className="fixed inset-x-0 bottom-0 flex items-center gap-3 border-t border-line bg-[var(--bg)] p-3 lg:hidden">
        <p className="min-w-0 flex-1 text-sm font-semibold">
          {hayConteo ? (
            <Diferencia valor={contado - r.efectivoEsperado} precio={precio} />
          ) : (
            <span className="text-muted">Esperado {precio(r.efectivoEsperado)}</span>
          )}
        </p>
        <button
          type="button"
          disabled={ocupado || !hayConteo}
          onClick={cerrar}
          className={botonFuerte}
        >
          <Printer className="size-4" aria-hidden /> Cerrar e imprimir
        </button>
      </div>
    </div>
  );
}

export function Diferencia({ valor, precio }: { valor: number; precio: (c: number) => string }) {
  if (valor === 0) return <span className="text-ok">Cuadra exacto</span>;
  return valor > 0 ? (
    <span className="text-amber-ink">Sobran {precio(valor)}</span>
  ) : (
    <span className="text-danger">Faltan {precio(-valor)}</span>
  );
}

// Ticket de 80 mm del cierre (se imprime con el mismo estilo .ticket de la caja).
export function TicketCierre({
  t,
  restaurante,
  precio,
}: {
  t: TurnoCajaDetalle;
  restaurante: string;
  precio: (c: number) => string;
}) {
  const r = t.resumen;
  const fila = (texto: string, monto: number) => (
    <div className="flex justify-between gap-2">
      <span>{texto}</span>
      <span>{precio(monto)}</span>
    </div>
  );
  const fecha = (iso: string | null) => (iso ? new Date(iso).toLocaleString('es-CR') : '');
  return (
    <div className="ticket hidden print:block">
      <p className="text-center font-bold">{restaurante}</p>
      <p className="text-center">CIERRE DE CAJA</p>
      <p>
        Abrió: {t.abiertoPorNombre} · {fecha(t.abiertoEn)}
      </p>
      <p>
        Cerró: {t.cerradoPorNombre} · {fecha(t.cerradoEn)}
      </p>
      <hr />
      {fila('Fondo inicial', t.fondoInicial)}
      {fila('Ventas efectivo', r.ventasEfectivo)}
      {fila('Entradas', r.entradas)}
      {fila('Salidas', -r.salidas)}
      {fila('Efectivo esperado', r.efectivoEsperado)}
      {fila('Efectivo contado', t.efectivoContado ?? 0)}
      <p className="font-bold">
        {(t.diferencia ?? 0) === 0
          ? 'Cuadra exacto'
          : (t.diferencia ?? 0) > 0
            ? `Sobrante: ${precio(t.diferencia!)}`
            : `Faltante: ${precio(-t.diferencia!)}`}
      </p>
      <hr />
      {fila('Tarjeta', r.ventasTarjeta)}
      {fila('SINPE Móvil', r.ventasSinpe)}
      <p>Cuentas cobradas: {r.cuentas}</p>
      {t.movimientos.length > 0 && (
        <>
          <hr />
          {t.movimientos.map((m) => (
            <div key={m.id} className="flex justify-between gap-2">
              <span>
                {m.tipo === 'SALIDA' ? 'Sale' : 'Entra'}: {m.motivo}
              </span>
              <span>{precio(m.monto)}</span>
            </div>
          ))}
        </>
      )}
      {t.nota && <p>Nota: {t.nota}</p>}
      <hr />
      <p className="mt-4">Firma: ____________________</p>
    </div>
  );
}
