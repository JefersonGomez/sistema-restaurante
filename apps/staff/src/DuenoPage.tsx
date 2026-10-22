import { useCallback, useEffect, useState } from 'react';
import type { ModoConfirmacion, Moneda, ReporteHoy } from '@menu-qr/shared';
import { api } from './api';
import { Encabezado, formatoPrecio } from './ui';

const MODOS: { id: ModoConfirmacion; titulo: string; detalle: string }[] = [
  {
    id: 'PRIMER_PEDIDO',
    titulo: 'Solo el primer pedido',
    detalle:
      'El mesero confirma el primer pedido de cada mesa; los siguientes van directo a cocina.',
  },
  {
    id: 'SIEMPRE',
    titulo: 'Siempre',
    detalle: 'Cada pedido del comensal espera la confirmación del mesero.',
  },
  { id: 'NUNCA', titulo: 'Nunca', detalle: 'Todos los pedidos van directo a cocina.' },
];

type Config = {
  modoConfirmacion: ModoConfirmacion;
  moneda: Moneda;
  cerradoManual: boolean;
};

export function DuenoPage() {
  const [reporte, setReporte] = useState<ReporteHoy>();
  const [config, setConfig] = useState<Config>();
  const [mensaje, setMensaje] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    const [r, c] = await Promise.all([
      api<ReporteHoy>('/reportes/hoy'),
      api<Config>('/restaurante'),
    ]);
    setReporte(r);
    setConfig(c);
  }, []);
  useEffect(() => {
    cargar().catch((e: Error) => setMensaje(e.message));
  }, [cargar]);

  const guardarAjuste = async (cambios: Partial<Config>) => {
    try {
      setConfig(await api<Config>('/restaurante', { method: 'PATCH', body: cambios }));
      setMensaje('Ajuste guardado.');
    } catch (e) {
      setMensaje((e as Error).message);
    }
  };

  const precio = formatoPrecio(config?.moneda ?? 'CRC');
  const minutos = reporte?.tiempoPromedioPreparacionSeg;
  return (
    <div className="min-h-dvh bg-stone-100">
      <Encabezado titulo="Hoy" />
      <main className="mx-auto max-w-4xl space-y-4 p-4">
        {mensaje && (
          <p role="status" className="rounded-md bg-stone-800 p-2 text-sm text-white">
            {mensaje}
          </p>
        )}

        <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {[
            ['Total vendido', reporte ? precio(reporte.totalVendido) : '—'],
            ['Cuentas cerradas', reporte?.cuentasCerradas ?? '—'],
            ['Ticket promedio', reporte ? precio(reporte.ticketPromedio) : '—'],
            ['Preparación promedio', minutos == null ? '—' : `${Math.round(minutos / 60)} min`],
          ].map(([titulo, valor]) => (
            <div key={titulo} className="rounded-xl bg-white p-4 shadow-sm">
              <p className="text-xs uppercase text-stone-500">{titulo}</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">{valor}</p>
            </div>
          ))}
        </section>

        <section className="rounded-xl bg-white p-4 shadow-sm">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="font-semibold">Platos más vendidos hoy</h2>
            <button
              type="button"
              onClick={() => cargar()}
              className="text-sm text-teal-800 underline"
            >
              Actualizar
            </button>
          </div>
          {reporte?.topPlatos.length ? (
            <ol className="space-y-1 text-sm">
              {reporte.topPlatos.map((p, i) => (
                <li key={p.platoId} className="flex justify-between">
                  <span>
                    {i + 1}. {p.nombreEs}
                  </span>
                  <span className="tabular-nums">{p.cantidad}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-sm text-stone-500">Todavía no hay ventas cerradas hoy.</p>
          )}
        </section>

        <section className="rounded-xl bg-white p-4 shadow-sm">
          <h2 className="mb-2 font-semibold">¿Quién confirma los pedidos de los comensales?</h2>
          <div className="space-y-2">
            {MODOS.map((m) => (
              <label
                key={m.id}
                className="flex cursor-pointer gap-3 rounded-lg border border-stone-200 p-3"
              >
                <input
                  type="radio"
                  name="modo"
                  checked={config?.modoConfirmacion === m.id}
                  onChange={() => guardarAjuste({ modoConfirmacion: m.id })}
                  className="mt-1 accent-teal-700"
                />
                <span>
                  <span className="font-medium">{m.titulo}</span>
                  <span className="block text-sm text-stone-500">{m.detalle}</span>
                </span>
              </label>
            ))}
          </div>
        </section>

        <section className="rounded-xl bg-white p-4 shadow-sm">
          <h2 className="mb-1 font-semibold">Atención al público</h2>
          <p className="mb-3 text-sm text-stone-500">
            {config?.cerradoManual
              ? 'Cerrado temporalmente: los comensales ven el menú pero no pueden pedir.'
              : 'Abierto según el horario. Cerrar temporalmente bloquea los pedidos de los comensales.'}
          </p>
          <button
            type="button"
            onClick={() => guardarAjuste({ cerradoManual: !config?.cerradoManual })}
            className="rounded-md bg-teal-700 px-4 py-2 text-sm font-medium text-white"
          >
            {config?.cerradoManual ? 'Volver a abrir' : 'Cerrar temporalmente'}
          </button>
        </section>
      </main>
    </div>
  );
}
