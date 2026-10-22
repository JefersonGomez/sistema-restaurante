import { Check, Clock, NotebookPen, Trash2 } from 'lucide-react';
import { useState } from 'react';
import type { ConfigImpuestos, PedidoDetalle, Totales } from '@menu-qr/shared';
import type { LineaCarrito } from '../estado/carrito';
import { useIdioma, useTextos } from '../estado/idioma';
import { pasoPedido, QuantityStepper, FotoPlato } from '@menu-qr/ui';

export function NoteEditor({
  nota,
  onGuardar,
}: {
  nota: string;
  onGuardar: (nota: string) => void;
}) {
  const t = useTextos();
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState(nota);
  const boton =
    'flex min-h-8 items-center gap-1.5 self-start text-left text-[13px] font-medium text-amber-ink';
  if (editando)
    return (
      <div className="flex flex-col gap-1.5">
        <textarea
          autoFocus
          value={texto}
          maxLength={200}
          onChange={(e) => setTexto(e.target.value)}
          placeholder={t.notaEjemplo}
          aria-label={t.nota}
          className="min-h-[72px] w-full resize-y rounded-xl border border-line bg-app p-3 text-sm text-fg placeholder:text-muted"
        />
        <button
          type="button"
          className={boton}
          onClick={() => {
            onGuardar(texto.trim());
            setEditando(false);
          }}
        >
          <Check className="size-4" aria-hidden /> {t.guardarNota}
        </button>
      </div>
    );
  return (
    <>
      {nota && (
        <span className="rounded-lg bg-amber-soft px-2.5 py-1.5 text-[12.5px] text-amber-ink">
          {nota}
        </span>
      )}
      <button
        type="button"
        className={boton}
        onClick={() => {
          setTexto(nota);
          setEditando(true);
        }}
      >
        <NotebookPen className="size-4" aria-hidden /> {nota ? t.editarNota : t.agregarNota}
      </button>
    </>
  );
}

export function CartItem({
  linea: l,
  agotado,
  precio,
  onCantidad,
  onQuitar,
  onNota,
}: {
  linea: LineaCarrito;
  agotado: boolean;
  precio: (c: number) => string;
  onCantidad: (n: number) => void;
  onQuitar: () => void;
  onNota: (nota: string) => void;
}) {
  const t = useTextos();
  const idioma = useIdioma((s) => s.idioma);
  const nombre = idioma === 'en' ? l.nombreEn : l.nombreEs;
  const mods = idioma === 'en' ? l.modsEn : l.modsEs;
  return (
    <div
      className={`flex gap-3.5 rounded-md bg-surface p-3.5 ${agotado ? 'ring-2 ring-danger' : ''}`}
    >
      <FotoPlato
        fotoUrl={l.fotoUrl}
        icono={l.icono}
        tam={88}
        clase="size-[88px] shrink-0 rounded-[14px]"
      />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-[15px] font-semibold">{nombre}</h3>
          <button
            type="button"
            onClick={onQuitar}
            aria-label={t.quitar(nombre)}
            className="-mt-2.5 -mr-2.5 grid size-11 shrink-0 place-items-center text-danger"
          >
            <Trash2 className="size-[22px]" strokeWidth={1.9} aria-hidden />
          </button>
        </div>
        {mods.length > 0 && <span className="text-xs text-muted">{mods.join(', ')}</span>}
        {agotado && (
          <span className="text-xs font-semibold text-danger">{t.platoAgotadoCarrito}</span>
        )}
        <NoteEditor nota={l.nota} onGuardar={onNota} />
        <div className="mt-0.5 flex items-center justify-between">
          <QuantityStepper valor={l.cantidad} onCambio={onCantidad} min={0} />
          <span className="font-semibold tabular-nums">
            {precio(l.precioUnitario * l.cantidad)}
          </span>
        </div>
      </div>
    </div>
  );
}

// Con IVA incluido en el menú: Subtotal (precios del menú) + Servicio = Total, y la leyenda del IVA.
// Sin IVA incluido: Subtotal + Servicio + IVA = Total.
export function TotalsSummary({
  totales: tt,
  config,
  precio,
  etiquetaTotal,
  estimado,
}: {
  totales: Totales;
  config: ConfigImpuestos;
  precio: (c: number) => string;
  etiquetaTotal: string;
  estimado?: boolean;
}) {
  const t = useTextos();
  const incluye = config.preciosIncluyenImpuestos;
  const fila = (texto: string, monto: number) => (
    <div className="flex justify-between text-muted">
      <span>{texto}</span>
      <span className="text-fg tabular-nums">{precio(monto)}</span>
    </div>
  );
  return (
    <div className="flex flex-col gap-2.5 rounded-md bg-surface p-4 text-sm">
      {fila(t.subtotal, incluye ? tt.subtotal + tt.montoIva : tt.subtotal)}
      {fila(t.servicio(config.porcentajeServicio), tt.montoServicio)}
      {!incluye && fila(t.iva(config.porcentajeIva), tt.montoIva)}
      <div className="flex justify-between border-t border-dashed border-line pt-3 text-[17px] font-semibold">
        <span>{etiquetaTotal}</span>
        <span className="tabular-nums">{precio(tt.total)}</span>
      </div>
      {incluye && (
        <small className="text-[11.5px] text-muted">{t.ivaIncluido(config.porcentajeIva)}</small>
      )}
      {estimado && <small className="text-[11.5px] text-muted">{t.estimado}</small>}
    </div>
  );
}

const TONO_PASO = [
  'bg-amber-soft text-amber-ink',
  'bg-purple-soft text-purple',
  'bg-purple-soft text-purple',
  'bg-ok-soft text-ok',
  'bg-ok-soft text-ok',
];

export function StatusSteps({ paso }: { paso: number }) {
  const t = useTextos();
  return (
    <div className="grid grid-cols-5 gap-1" role="img" aria-label={t.pasos[paso]}>
      {[0, 1, 2, 3, 4].map((k) => (
        <i
          key={k}
          className={`h-[5px] rounded-[3px] ${k > paso ? 'bg-line' : paso >= 3 ? 'bg-ok' : 'bg-purple'}`}
        />
      ))}
    </div>
  );
}

export function OrderCard({
  pedido: p,
  numero,
  precio,
}: {
  pedido: PedidoDetalle;
  numero: number;
  precio: (c: number) => string;
}) {
  const t = useTextos();
  const idioma = useIdioma((s) => s.idioma);
  const paso = pasoPedido(p);
  const hora = new Date(p.createdAt).toLocaleTimeString(idioma === 'en' ? 'en-US' : 'es-CR', {
    hour: 'numeric',
    minute: '2-digit',
  });
  return (
    <article
      className={`flex flex-col gap-3 rounded-md bg-surface p-4 ${paso === null ? 'opacity-60' : ''}`}
    >
      <div className="flex items-center justify-between gap-2">
        <strong className="text-[15px]">
          {t.pedido} #{numero}
        </strong>
        <span
          className={`rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap ${paso === null ? 'bg-danger-soft text-danger' : TONO_PASO[paso]}`}
        >
          {paso === null ? t.canceladoPedido : t.pasos[paso]}
        </span>
      </div>
      {paso !== null && <StatusSteps paso={paso} />}
      {paso === 0 && (
        <div className="flex items-center gap-2.5 rounded-xl bg-amber-soft px-3 py-2.5 text-[13px] text-amber-ink">
          <Clock className="size-4 shrink-0" aria-hidden /> <span>{t.esperandoMesero}</span>
        </div>
      )}
      {p.items.map((i) => {
        const mods = i.modificadores.map((m) =>
          idioma === 'en' ? (m.nombreEn ?? m.nombre) : m.nombre,
        );
        const detalle = [
          mods.join(', '),
          i.notas,
          i.cancelado
            ? `${t.cancelado}${i.motivoCancelacion ? `: ${i.motivoCancelacion}` : ''}`
            : null,
        ].filter(Boolean);
        return (
          <div
            key={i.id}
            className={`flex justify-between gap-2.5 text-[13.5px] ${i.cancelado ? 'opacity-60' : ''}`}
          >
            <span className="min-w-0">
              <span className={i.cancelado ? 'line-through' : ''}>
                {i.cantidad}× {idioma === 'en' ? i.nombreEn : i.nombreEs}
              </span>
              {detalle.length > 0 && (
                <span className="block text-xs text-muted">{detalle.join(' · ')}</span>
              )}
            </span>
            <span className="font-semibold tabular-nums">
              {precio(i.precioUnitario * i.cantidad)}
            </span>
          </div>
        );
      })}
      <time className="text-xs text-muted" dateTime={p.createdAt}>
        {hora}
      </time>
    </article>
  );
}
