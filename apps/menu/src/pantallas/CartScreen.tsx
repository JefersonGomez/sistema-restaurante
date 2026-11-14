import { useNavigate } from 'react-router-dom';
import { calcularTotales } from '@menu-qr/shared/totales';
import { useEnviarPedido, useEstadoEnvio } from '../datos/acciones';
import { useMesa } from '../datos/mesa';
import { CartItem, TotalsSummary } from '../componentes/cuenta';
import { BarraTitulo, Main } from '../componentes/estructura';
import { conTarifas, useCarrito } from '../estado/carrito';
import { useTextos } from '../estado/idioma';
import { formatoPrecio } from '@menu-qr/ui';

export function CartScreen() {
  const { menu, tokenQr } = useMesa();
  const t = useTextos();
  const navegar = useNavigate();
  const { lineas, cambiarCantidad, quitar, cambiarNota } = useCarrito();
  const { enviando, error } = useEstadoEnvio();
  const enviar = useEnviarPedido();
  const irAlMenu = () => navegar(`/m/${tokenQr}`, { replace: true });

  const r = menu!.restaurante;
  const precio = formatoPrecio(r.moneda);
  // Platos que se agotaron mientras estaban en el carrito (llega por menu:actualizado).
  const agotados = new Set(
    menu!.categorias
      .flatMap((c) => c.platos)
      .filter((p) => p.agotado)
      .map((p) => p.id),
  );
  const hayAgotados = lineas.some((l) => agotados.has(l.platoId));
  const estimado = calcularTotales(conTarifas(lineas, menu!), r);

  if (lineas.length === 0)
    return (
      <Main>
        <BarraTitulo titulo={t.miCarrito} onVolver={irAlMenu} />
        <p className="px-2.5 py-8 text-center text-muted">{t.carritoVacio}</p>
        <button
          type="button"
          onClick={irAlMenu}
          className="flex h-14 w-full items-center justify-center rounded-md bg-purple text-[15.5px] font-semibold text-on-accent md:mx-auto md:w-80"
        >
          {t.verMenu}
        </button>
      </Main>
    );

  return (
    <Main>
      <BarraTitulo titulo={t.miCarrito} onVolver={irAlMenu} />
      <div className="flex flex-col gap-[22px] md:grid md:grid-cols-[minmax(0,1fr)_360px] md:items-start md:gap-8">
        <div className="flex flex-col gap-3">
          {lineas.map((l) => (
            <CartItem
              key={l.clave}
              linea={l}
              agotado={agotados.has(l.platoId)}
              precio={precio}
              onCantidad={(n) => cambiarCantidad(l.clave, n)}
              onQuitar={() => quitar(l.clave)}
              onNota={(nota) => cambiarNota(l.clave, nota)}
            />
          ))}
        </div>
        <div className="flex flex-col gap-[22px] md:sticky md:top-20">
          <TotalsSummary
            totales={estimado}
            config={r}
            precio={precio}
            etiquetaTotal={t.total}
            estimado
          />
          {(error || hayAgotados) && (
            <p role="alert" className="rounded-md bg-danger-soft px-4 py-3 text-[13px] text-danger">
              {hayAgotados ? t.hayAgotados : error!.texto}
            </p>
          )}
          <button
            type="button"
            onClick={enviar}
            disabled={enviando || hayAgotados || !r.abierto}
            className="flex h-14 w-full items-center justify-center gap-2.5 rounded-md bg-purple text-[15.5px] font-semibold text-on-accent disabled:opacity-60"
          >
            {enviando
              ? t.enviando
              : error?.reintentable
                ? t.reintentar
                : `${t.enviar} · ${precio(estimado.total)}`}
          </button>
        </div>
      </div>
    </Main>
  );
}
