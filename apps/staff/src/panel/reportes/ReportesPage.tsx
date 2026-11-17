import { useQuery } from '@tanstack/react-query';
import { Download } from 'lucide-react';
import { lazy, Suspense, useState, type ReactNode } from 'react';
import type { Moneda, Reporte, TurnoCajaDetalle } from '@menu-qr/shared';
import { formatoPrecio } from '@menu-qr/ui';
import { api } from '../../api';
import { Diferencia } from '../../TurnoCaja';
import {
  Boton,
  Campo,
  ErrorCarga,
  Esqueleto,
  EstadoVacio,
  Tarjeta,
  TituloPagina,
} from '../comunes';

const Barras = lazy(() => import('./Graficos'));

type Rango = 'hoy' | 'ayer' | '7' | '30' | 'otro';
const RANGOS: { id: Rango; texto: string }[] = [
  { id: 'hoy', texto: 'Hoy' },
  { id: 'ayer', texto: 'Ayer' },
  { id: '7', texto: '7 días' },
  { id: '30', texto: '30 días' },
  { id: 'otro', texto: 'Personalizado' },
];
const CANALES: Record<string, string> = {
  MESA: 'En mesa',
  RECOGER: 'Para recoger',
  DOMICILIO: 'A domicilio',
};
// Plazo para entregar el servicio a los saloneros (según la información del usuario; a confirmar).
const PLAZO_SERVICIO: Record<string, string> = {
  EFECTIVO: 'En 1 semana',
  TARJETA: 'En 1 mes',
};
const METODOS: Record<string, string> = {
  EFECTIVO: 'Efectivo',
  TARJETA: 'Tarjeta',
  SINPE: 'SINPE',
  MIXTO: 'Mixto',
  SIN_DATO: 'Sin dato',
};

// "AAAA-MM-DD" del día local del restaurante, `dias` atrás.
const diaLocal = (zona: string, dias = 0) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: zona }).format(
    new Date(Date.now() - dias * 86_400_000),
  );

function fechas(rango: Rango, zona: string, otro: { desde: string; hasta: string }) {
  if (rango === 'otro') return otro;
  if (rango === 'ayer') return { desde: diaLocal(zona, 1), hasta: diaLocal(zona, 1) };
  const atras = rango === 'hoy' ? 0 : Number(rango) - 1;
  return { desde: diaLocal(zona, atras), hasta: diaLocal(zona) };
}

const minutos = (seg: number) => (seg < 60 ? `${seg} s` : `${Math.round(seg / 60)} min`);
const diaCorto = (dia: string) =>
  new Date(`${dia}T12:00:00`).toLocaleDateString('es-CR', { day: 'numeric', month: 'short' });

// CSV con lo mismo que muestra la pantalla (se arma con los mismos datos). Montos en la moneda.
function csv(r: Reporte, moneda: Moneda) {
  const m = (c: number) => (c / 100).toFixed(2);
  const filas: (string | number)[][] = [
    [`Reporte ${r.desde} a ${r.hasta}`, `Montos en ${moneda}`],
    [],
    ['Total vendido', 'Cuentas', 'Ticket promedio'],
    [m(r.resumen.totalVendido), r.resumen.cuentas, m(r.resumen.ticketPromedio)],
    [],
    ['Día', 'Ventas', 'Cuentas'],
    ...r.porDia.map((d) => [d.dia, m(d.total), d.cuentas]),
    [],
    ['Hora', 'Ventas', 'Cuentas'],
    ...r.porHora.map((h) => [`${h.hora}:00`, m(h.total), h.cuentas]),
    [],
    ['Método de pago', 'Ventas', 'Cuentas'],
    ...r.porMetodo.map((x) => [METODOS[x.metodo] ?? x.metodo, m(x.total), x.cuentas]),
    [],
    ['Servicio a repartir (10 %)', 'Monto', 'Entregar'],
    ...r.servicio.porMetodo.map((x) => [
      METODOS[x.metodo] ?? x.metodo,
      m(x.total),
      PLAZO_SERVICIO[x.metodo] ?? '',
    ]),
    ['Total servicio', m(r.servicio.total)],
    [],
    ['Canal', 'Ventas', 'Cuentas'],
    ...r.porCanal.map((c) => [CANALES[c.canal] ?? c.canal, m(c.total), c.cuentas]),
    [],
    ['Categoría', 'Unidades', 'Ventas'],
    ...r.porCategoria.map((c) => [c.categoria, c.cantidad, m(c.total)]),
    [],
    ['Plato', 'Unidades', 'Ventas'],
    ...r.topPlatos.map((p) => [p.nombre, p.cantidad, m(p.total)]),
    [],
    ['Plato', 'Vistas', 'Pedidos'],
    ...r.vistasVsPedidos.map((p) => [p.nombre, p.vistas, p.pedidos]),
    [],
    ['Estación', 'Ítems listos', 'Preparación promedio (s)', 'Demorados'],
    ...r.preparacion.map((p) => [p.estacion, p.items, p.promedioSeg, p.demorados]),
    [],
    ['Motivo de cancelación', 'Ítems'],
    ...r.cancelaciones.map((c) => [c.motivo, c.items]),
  ];
  const celda = (v: string | number) => {
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  // BOM para que Excel abra bien las tildes.
  const texto = '﻿' + filas.map((f) => f.map(celda).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob([texto], { type: 'text/csv;charset=utf-8' }));
  const a = Object.assign(document.createElement('a'), {
    href: url,
    download: `reporte-${r.desde}-a-${r.hasta}.csv`,
  });
  a.click();
  URL.revokeObjectURL(url);
}

function Dato({ titulo, valor, detalle }: { titulo: string; valor: string; detalle?: string }) {
  return (
    <Tarjeta>
      <p className="text-sm text-muted">{titulo}</p>
      <p className="mt-1 text-[26px] font-semibold tabular-nums">{valor}</p>
      {detalle && <p className="text-xs text-muted">{detalle}</p>}
    </Tarjeta>
  );
}

function Seccion({
  titulo,
  detalle,
  children,
}: {
  titulo: string;
  detalle?: string;
  children: ReactNode;
}) {
  return (
    <Tarjeta className="min-w-0">
      <h2 className="font-semibold">{titulo}</h2>
      {detalle && <p className="text-sm text-muted">{detalle}</p>}
      <div className="mt-3">{children}</div>
    </Tarjeta>
  );
}

// Tabla con una barra de proporción por fila (la tabla misma es la vista accesible).
function TablaBarras({
  filas,
  columnas,
}: {
  filas: { clave: string; nombre: string; valores: string[]; proporcion: number }[];
  columnas: string[];
}) {
  if (!filas.length) return <p className="py-4 text-sm text-muted">Sin datos en este rango.</p>;
  return (
    <table className="w-full text-sm">
      <thead className="text-left text-xs text-muted">
        <tr>
          {columnas.map((c, i) => (
            <th key={c} className={`pb-2 font-medium ${i ? 'text-right' : ''}`}>
              {c}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {filas.map((f) => (
          <tr key={f.clave} className="border-t border-line">
            <td className="py-2 pr-3">
              <span className="block">{f.nombre}</span>
              <span aria-hidden className="mt-1 block h-1.5 rounded-full bg-surface-2">
                <span
                  className="block h-full rounded-full bg-purple"
                  style={{ width: `${Math.max(2, f.proporcion * 100)}%` }}
                />
              </span>
            </td>
            {f.valores.map((v, i) => (
              <td key={i} className="py-2 pl-3 text-right tabular-nums whitespace-nowrap">
                {v}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function ReportesPage() {
  const [rango, setRango] = useState<Rango>('7');
  const config = useQuery({
    queryKey: ['restaurante'],
    queryFn: () => api<{ moneda: Moneda; zonaHoraria: string }>('/restaurante'),
  });
  const zona = config.data?.zonaHoraria ?? 'America/Costa_Rica';
  const [otro, setOtro] = useState(() => ({ desde: diaLocal(zona, 29), hasta: diaLocal(zona) }));
  const { desde, hasta } = fechas(rango, zona, otro);
  const valido = desde <= hasta;
  const reporte = useQuery({
    queryKey: ['reporte', desde, hasta],
    queryFn: () => api<Reporte>(`/reportes?desde=${desde}&hasta=${hasta}`),
    enabled: !!config.data && valido,
    placeholderData: (previo) => previo, // al cambiar de rango no parpadea
  });
  const moneda = config.data?.moneda ?? 'CRC';
  const precio = formatoPrecio(moneda);
  const r = reporte.data;
  const maximo = (xs: number[]) => Math.max(1, ...xs);

  return (
    <>
      <TituloPagina
        titulo="Reportes"
        detalle="Ventas de las cuentas cerradas, por día local del restaurante."
        acciones={
          <Boton variante="suave" disabled={!r} onClick={() => r && csv(r, moneda)}>
            <Download className="size-4" aria-hidden /> Exportar CSV
          </Boton>
        }
      />

      <div className="mb-4 flex flex-wrap items-end gap-2">
        <div
          role="group"
          aria-label="Rango de fechas"
          className="flex flex-wrap gap-1 rounded-md bg-app p-1 shadow-tarjeta"
        >
          {RANGOS.map((x) => (
            <button
              key={x.id}
              type="button"
              aria-pressed={rango === x.id}
              onClick={() => setRango(x.id)}
              className={`min-h-11 rounded-md px-3 text-sm font-medium ${rango === x.id ? 'bg-purple text-on-accent' : 'text-muted hover:bg-surface'}`}
            >
              {x.texto}
            </button>
          ))}
        </div>
        {rango === 'otro' && (
          <>
            <Campo
              etiqueta="Desde"
              type="date"
              className="w-44"
              value={otro.desde}
              max={otro.hasta}
              onChange={(e) => setOtro((o) => ({ ...o, desde: e.target.value }))}
            />
            <Campo
              etiqueta="Hasta"
              type="date"
              className="w-44"
              value={otro.hasta}
              min={otro.desde}
              onChange={(e) => setOtro((o) => ({ ...o, hasta: e.target.value }))}
              error={valido ? undefined : 'Tiene que ser después de "Desde"'}
            />
          </>
        )}
      </div>

      {reporte.isError ? (
        <ErrorCarga mensaje="No se pudo cargar el reporte" onReintentar={() => reporte.refetch()} />
      ) : !r ? (
        <div className="grid gap-4 sm:grid-cols-3">
          <Esqueleto className="h-28" />
          <Esqueleto className="h-28" />
          <Esqueleto className="h-28" />
          <Esqueleto className="h-72 sm:col-span-3" />
        </div>
      ) : (
        <div
          className={`space-y-4 ${reporte.isFetching ? 'opacity-70' : ''}`}
          aria-busy={reporte.isFetching}
        >
          <div className="grid gap-4 sm:grid-cols-3">
            <Dato
              titulo="Total vendido"
              valor={precio(r.resumen.totalVendido)}
              detalle="Con impuestos y servicio"
            />
            <Dato titulo="Cuentas cerradas" valor={String(r.resumen.cuentas)} />
            <Dato titulo="Ticket promedio" valor={precio(r.resumen.ticketPromedio)} />
          </div>

          {r.resumen.cuentas === 0 ? (
            <EstadoVacio titulo="Sin ventas en este rango" detalle="Elija otro rango de fechas." />
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              {r.porDia.length > 1 && (
                <div className="lg:col-span-2">
                  <Seccion titulo="Ventas por día">
                    <Suspense fallback={<Esqueleto className="h-60" />}>
                      <Barras
                        etiqueta="Día"
                        precio={precio}
                        datos={r.porDia.map((d) => ({
                          x: diaCorto(d.dia),
                          total: d.total,
                          cuentas: d.cuentas,
                        }))}
                      />
                    </Suspense>
                  </Seccion>
                </div>
              )}
              <div className="lg:col-span-2">
                <Seccion
                  titulo="Horas pico"
                  detalle="Ventas según la hora en que se cerró la cuenta."
                >
                  <Suspense fallback={<Esqueleto className="h-60" />}>
                    <Barras
                      etiqueta="Hora"
                      precio={precio}
                      datos={r.porHora.map((h) => ({
                        x: `${h.hora}h`,
                        total: h.total,
                        cuentas: h.cuentas,
                      }))}
                    />
                  </Suspense>
                </Seccion>
              </div>
              <Seccion titulo="Platos más vendidos">
                <TablaBarras
                  columnas={['Plato', 'Unidades', 'Ventas']}
                  filas={r.topPlatos.map((p) => ({
                    clave: p.platoId,
                    nombre: p.nombre,
                    valores: [String(p.cantidad), precio(p.total)],
                    proporcion: p.cantidad / maximo(r.topPlatos.map((x) => x.cantidad)),
                  }))}
                />
              </Seccion>
              <Seccion titulo="Por categoría">
                <TablaBarras
                  columnas={['Categoría', 'Unidades', 'Ventas']}
                  filas={r.porCategoria.map((c) => ({
                    clave: c.categoria,
                    nombre: c.categoria,
                    valores: [String(c.cantidad), precio(c.total)],
                    proporcion: c.total / maximo(r.porCategoria.map((x) => x.total)),
                  }))}
                />
              </Seccion>
              <Seccion titulo="Métodos de pago">
                <TablaBarras
                  columnas={['Método', 'Cuentas', 'Ventas']}
                  filas={r.porMetodo.map((x) => ({
                    clave: x.metodo,
                    nombre: METODOS[x.metodo] ?? x.metodo,
                    valores: [String(x.cuentas), precio(x.total)],
                    proporcion: x.total / maximo(r.porMetodo.map((y) => y.total)),
                  }))}
                />
              </Seccion>
              <Seccion
                titulo="Servicio a repartir (10 %)"
                detalle="Es de los saloneros (Ley 9116). Plazo de entrega según cómo se cobró; confírmelo con su contador."
              >
                <p className="font-display text-3xl font-extrabold tabular-nums">
                  {precio(r.servicio.total)}
                </p>
                <TablaBarras
                  columnas={['Método', 'Entregar', 'Servicio']}
                  filas={r.servicio.porMetodo.map((x) => ({
                    clave: x.metodo,
                    nombre: METODOS[x.metodo] ?? x.metodo,
                    valores: [PLAZO_SERVICIO[x.metodo] ?? '—', precio(x.total)],
                    proporcion: x.total / maximo(r.servicio.porMetodo.map((y) => y.total)),
                  }))}
                />
                {r.servicio.porDia.length > 1 && (
                  <details className="mt-3 text-sm">
                    <summary className="cursor-pointer text-muted">Por día</summary>
                    <ul className="mt-2 divide-y divide-line">
                      {r.servicio.porDia.map((d) => (
                        <li key={d.dia} className="flex justify-between py-1.5">
                          <span>{d.dia}</span>
                          <span className="tabular-nums">{precio(d.total)}</span>
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </Seccion>
              <Seccion
                titulo="Vistos vs. pedidos"
                detalle="Cuántas veces se abrió el plato en el menú y cuántas unidades se pidieron."
              >
                <TablaBarras
                  columnas={['Plato', 'Vistas', 'Pedidos']}
                  filas={r.vistasVsPedidos.map((p) => ({
                    clave: p.platoId,
                    nombre: p.nombre,
                    valores: [String(p.vistas), String(p.pedidos)],
                    proporcion: p.vistas / maximo(r.vistasVsPedidos.map((x) => x.vistas)),
                  }))}
                />
              </Seccion>
              <Seccion titulo="Por canal" detalle="En mesa, para recoger y a domicilio.">
                <TablaBarras
                  columnas={['Canal', 'Cuentas', 'Ventas']}
                  filas={r.porCanal.map((c) => ({
                    clave: c.canal,
                    nombre: CANALES[c.canal] ?? c.canal,
                    valores: [String(c.cuentas), precio(c.total)],
                    proporcion: c.total / maximo(r.porCanal.map((x) => x.total)),
                  }))}
                />
              </Seccion>
            </div>
          )}

          <div className="grid gap-4 lg:grid-cols-2">
            <Seccion
              titulo="Tiempo de preparación"
              detalle="Demorado: listo más de 20 min después de confirmado."
            >
              <TablaBarras
                columnas={['Estación', 'Promedio', 'Demorados']}
                filas={r.preparacion.map((p) => ({
                  clave: p.estacion,
                  nombre: `${p.estacion} · ${p.items} ítems`,
                  valores: [
                    minutos(p.promedioSeg),
                    `${p.demorados} (${Math.round((p.demorados / p.items) * 100)} %)`,
                  ],
                  proporcion: p.demorados / maximo([p.items]),
                }))}
              />
            </Seccion>
            <Seccion titulo="Cancelaciones">
              <TablaBarras
                columnas={['Motivo', 'Ítems']}
                filas={r.cancelaciones.map((c) => ({
                  clave: c.motivo,
                  nombre: c.motivo,
                  valores: [String(c.items)],
                  proporcion: c.items / maximo(r.cancelaciones.map((x) => x.items)),
                }))}
              />
            </Seccion>
          </div>
        </div>
      )}
      <CierresCaja precio={precio} />
    </>
  );
}

// Arqueo (Fase 14): últimos cierres de caja, sin depender del rango elegido.
function CierresCaja({ precio }: { precio: (c: number) => string }) {
  const cierres = useQuery({
    queryKey: ['cierres-caja'],
    queryFn: () => api<TurnoCajaDetalle[]>('/caja/turnos'),
  });
  const fecha = (iso: string | null) =>
    iso
      ? new Date(iso).toLocaleString('es-CR', {
          day: 'numeric',
          month: 'short',
          hour: 'numeric',
          minute: '2-digit',
        })
      : '';
  return (
    <div className="mt-4">
      <Seccion titulo="Cierres de caja" detalle="Los últimos 60 arqueos hechos en Caja.">
        {!cierres.data?.length ? (
          <p className="py-4 text-sm text-muted">
            Todavía no hay cierres. Se abre y cierra la caja en la pantalla de Caja.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="text-left text-muted">
                <tr>
                  <th className="py-1.5 font-medium">Turno</th>
                  <th className="py-1.5 font-medium">Cerró</th>
                  <th className="py-1.5 text-right font-medium">Esperado</th>
                  <th className="py-1.5 text-right font-medium">Contado</th>
                  <th className="py-1.5 text-right font-medium">Diferencia</th>
                  <th className="py-1.5 text-right font-medium">Tarjeta</th>
                  <th className="py-1.5 text-right font-medium">SINPE</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {cierres.data.map((t) => (
                  <tr key={t.id} title={t.nota ?? undefined}>
                    <td className="py-1.5">
                      {fecha(t.abiertoEn)} → {fecha(t.cerradoEn)}
                    </td>
                    <td className="py-1.5">{t.cerradoPorNombre}</td>
                    <td className="py-1.5 text-right tabular-nums">
                      {precio(t.resumen.efectivoEsperado)}
                    </td>
                    <td className="py-1.5 text-right tabular-nums">
                      {precio(t.efectivoContado ?? 0)}
                    </td>
                    <td className="py-1.5 text-right tabular-nums">
                      <Diferencia valor={t.diferencia ?? 0} precio={precio} />
                    </td>
                    <td className="py-1.5 text-right tabular-nums">
                      {precio(t.resumen.ventasTarjeta)}
                    </td>
                    <td className="py-1.5 text-right tabular-nums">
                      {precio(t.resumen.ventasSinpe)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Seccion>
    </div>
  );
}
