import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Copy, Globe, QrCode } from 'lucide-react';
import { useState } from 'react';
import { restauranteConfigSchema } from '@menu-qr/shared';
import { api, descargar, type ErrorApi } from '../api';
import { Boton, Campo, erroresDe, Interruptor, Tarjeta } from './comunes';
import { aCentimos, aColones } from './menu/PlatoForm';

export type ConfigEnLinea = {
  enLineaActivo: boolean;
  enLineaRecoger: boolean;
  enLineaDomicilio: boolean;
  costoEnvio: number;
  pedidoMinimo: number;
  zonaEntrega: string | null;
  sinpeNumero: string | null;
  sinpeNombre: string | null;
  tiempoEstimadoMin: number;
  enlaceEnLinea: string;
};

// Ajustes → Pedidos en línea: activar, tipos, envío, mínimo, SINPE y el enlace (con su QR).
export function AjustesEnLinea({ r }: { r: ConfigEnLinea }) {
  const qc = useQueryClient();
  const [f, setF] = useState({
    enLineaActivo: r.enLineaActivo,
    enLineaRecoger: r.enLineaRecoger,
    enLineaDomicilio: r.enLineaDomicilio,
    costoEnvio: aColones(r.costoEnvio),
    pedidoMinimo: r.pedidoMinimo ? aColones(r.pedidoMinimo) : '',
    zonaEntrega: r.zonaEntrega ?? '',
    sinpeNumero: r.sinpeNumero ?? '',
    sinpeNombre: r.sinpeNombre ?? '',
    tiempoEstimadoMin: String(r.tiempoEstimadoMin),
  });
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [aviso, setAviso] = useState('');
  const poner = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => {
    setAviso('');
    setErrores(({ [k]: _, ...resto }) => resto);
    setF((x) => ({ ...x, [k]: v }));
  };
  const guardar = useMutation({
    mutationFn: (body: object) => api('/restaurante', { method: 'PATCH', body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['restaurante'] });
      setAviso('Guardado');
    },
    onError: (e: ErrorApi) => setErrores({ general: e.message }),
  });
  const enviar = () => {
    const costo = aCentimos(f.costoEnvio);
    const minimo = aCentimos(f.pedidoMinimo);
    if (costo === null) return setErrores({ costoEnvio: 'Monto en colones, ej. 1000' });
    if (minimo === null) return setErrores({ pedidoMinimo: 'Monto en colones, ej. 5000' });
    if (f.enLineaActivo && !f.enLineaRecoger && !f.enLineaDomicilio)
      return setErrores({ general: 'Active "para recoger", "a domicilio" o las dos' });
    const datos = restauranteConfigSchema.safeParse({
      enLineaActivo: f.enLineaActivo,
      enLineaRecoger: f.enLineaRecoger,
      enLineaDomicilio: f.enLineaDomicilio,
      costoEnvio: costo,
      pedidoMinimo: minimo,
      zonaEntrega: f.zonaEntrega.trim() || null,
      sinpeNumero: f.sinpeNumero.trim() || null,
      sinpeNombre: f.sinpeNombre.trim() || null,
      tiempoEstimadoMin: Number(f.tiempoEstimadoMin),
    });
    if (!datos.success) return setErrores(erroresDe(datos.error));
    guardar.mutate(datos.data);
  };
  const fila = (texto: string, k: 'enLineaActivo' | 'enLineaRecoger' | 'enLineaDomicilio') => (
    <label className="flex min-h-11 items-center justify-between gap-3 text-sm">
      <span>{texto}</span>
      <Interruptor activo={f[k]} etiqueta={texto} onCambio={(v) => poner(k, v)} />
    </label>
  );

  return (
    <Tarjeta className="space-y-3">
      <div className="flex items-start gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-full bg-purple-soft text-purple">
          <Globe className="size-5" aria-hidden />
        </span>
        <div>
          <h2 className="font-semibold">Pedidos en línea</h2>
          <p className="text-sm text-muted">
            Sus clientes piden desde la casa, para recoger o a domicilio. Usted los acepta o rechaza
            en la pantalla «En línea». Pagan en efectivo o por SINPE Móvil (usted verifica el pago).
          </p>
        </div>
      </div>
      {fila('Recibir pedidos en línea', 'enLineaActivo')}
      {f.enLineaActivo && (
        <>
          <div className="grid gap-x-6 sm:grid-cols-2">
            {fila('Para recoger', 'enLineaRecoger')}
            {fila('A domicilio', 'enLineaDomicilio')}
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Campo
              etiqueta="Tiempo estimado (min)"
              type="number"
              min={5}
              max={240}
              value={f.tiempoEstimadoMin}
              onChange={(e) => poner('tiempoEstimadoMin', e.target.value)}
              error={errores.tiempoEstimadoMin}
            />
            <Campo
              etiqueta="Pedido mínimo (₡, opcional)"
              inputMode="decimal"
              placeholder="0"
              value={f.pedidoMinimo}
              onChange={(e) => poner('pedidoMinimo', e.target.value)}
              error={errores.pedidoMinimo}
            />
            {f.enLineaDomicilio && (
              <Campo
                etiqueta="Costo de envío (₡)"
                inputMode="decimal"
                value={f.costoEnvio}
                onChange={(e) => poner('costoEnvio', e.target.value)}
                error={errores.costoEnvio}
              />
            )}
          </div>
          {f.enLineaDomicilio && (
            <Campo
              etiqueta="Zona de entrega (opcional)"
              placeholder="San José centro y Barrio Escalante"
              value={f.zonaEntrega}
              onChange={(e) => poner('zonaEntrega', e.target.value)}
              error={errores.zonaEntrega}
            />
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo
              etiqueta="SINPE Móvil: número (opcional)"
              type="tel"
              placeholder="8888 8888"
              value={f.sinpeNumero}
              onChange={(e) => poner('sinpeNumero', e.target.value)}
              error={errores.sinpeNumero}
              ayuda="Sin número, el cliente solo puede pagar en efectivo"
            />
            <Campo
              etiqueta="SINPE Móvil: a nombre de"
              value={f.sinpeNombre}
              onChange={(e) => poner('sinpeNombre', e.target.value)}
              error={errores.sinpeNombre}
            />
          </div>

          <div className="rounded-md bg-surface p-3">
            <p className="text-sm font-medium">Enlace para compartir (redes, WhatsApp, Google)</p>
            <p className="mt-1 text-sm break-all text-purple">{r.enlaceEnLinea}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Boton
                variante="suave"
                onClick={async () => {
                  await navigator.clipboard?.writeText(r.enlaceEnLinea).catch(() => {});
                  setAviso('Enlace copiado');
                }}
              >
                <Copy className="size-4" aria-hidden /> Copiar enlace
              </Boton>
              <Boton
                variante="suave"
                onClick={() =>
                  descargar('/restaurante/qr-enlinea.png', 'qr-pedidos-en-linea.png').catch(
                    (e: Error) => setErrores({ general: e.message }),
                  )
                }
              >
                <QrCode className="size-4" aria-hidden /> Descargar QR
              </Boton>
            </div>
          </div>
        </>
      )}
      {errores.general && <p className="text-sm text-danger">{errores.general}</p>}
      <div className="flex items-center gap-3">
        <Boton onClick={enviar} disabled={guardar.isPending}>
          Guardar pedidos en línea
        </Boton>
        {aviso && (
          <span role="status" className="text-sm text-ok">
            {aviso}
          </span>
        )}
      </div>
    </Tarjeta>
  );
}
