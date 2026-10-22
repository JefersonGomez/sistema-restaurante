import { Hand, Plus, ReceiptText } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useLlamadas } from '../datos/acciones';
import { useMesa } from '../datos/mesa';
import { OrderCard, TotalsSummary } from '../componentes/cuenta';
import { BarraTitulo, Main } from '../componentes/estructura';
import { Pastilla, formatoPrecio } from '@menu-qr/ui';
import { useTextos } from '../estado/idioma';

export function AccountScreen() {
  const { menu, mesa, cuenta, tokenQr } = useMesa();
  const t = useTextos();
  const navegar = useNavigate();
  const { llamar, pedirCuenta, cuentaPedida } = useLlamadas();
  const r = menu!.restaurante;
  const precio = formatoPrecio(r.moneda);
  const irAlMenu = () => navegar(`/m/${tokenQr}`, { replace: true });
  const pedidos = cuenta?.pedidos ?? [];
  const boton =
    'flex h-14 w-full items-center justify-center gap-2.5 rounded-md text-[15.5px] font-semibold disabled:opacity-60';

  return (
    <Main>
      <BarraTitulo titulo={t.miCuenta}>
        <Pastilla tono="purple">
          {t.mesa} {mesa!.numero}
        </Pastilla>
      </BarraTitulo>

      {!cuenta ? (
        <div className="flex flex-col gap-3" aria-busy="true">
          {[0, 1].map((i) => (
            <div key={i} className="esqueleto h-40 rounded-md" />
          ))}
        </div>
      ) : pedidos.length === 0 ? (
        <>
          <p className="px-2.5 py-8 text-center text-muted">{t.sinPedidos}</p>
          <button type="button" onClick={irAlMenu} className={`${boton} bg-purple text-on-accent`}>
            {t.verMenu}
          </button>
        </>
      ) : (
        <>
          <div className="flex flex-col gap-3">
            {/* El más reciente arriba; el número sigue el orden en que se hicieron. */}
            {pedidos
              .map((p, i) => ({ p, n: i + 1 }))
              .reverse()
              .map(({ p, n }) => (
                <OrderCard key={p.id} pedido={p} numero={n} precio={precio} />
              ))}
          </div>
          <TotalsSummary totales={cuenta} config={r} precio={precio} etiquetaTotal={t.totalMesa} />
          <div className="grid grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={llamar}
              className={`${boton} bg-surface text-[14px] text-fg`}
            >
              <Hand className="size-4" aria-hidden /> {t.llamarMesero}
            </button>
            <button
              type="button"
              onClick={pedirCuenta}
              disabled={cuentaPedida}
              className={`${boton} bg-amber text-[14px] text-on-amber`}
            >
              <ReceiptText className="size-4" aria-hidden />{' '}
              {cuentaPedida ? t.cuentaPedida : t.pedirCuenta}
            </button>
          </div>
          <button type="button" onClick={irAlMenu} className={`${boton} bg-surface text-fg`}>
            <Plus className="size-4" aria-hidden /> {t.pedirMas}
          </button>
        </>
      )}
    </Main>
  );
}
