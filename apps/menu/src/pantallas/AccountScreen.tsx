import { Hand, Plus, ReceiptText, Users } from 'lucide-react';
import { useState } from 'react';
import * as api from '../api';
import { PersonasModal } from '../componentes/ingreso';
import { useNavigate } from 'react-router-dom';
import { useLlamadas } from '../datos/acciones';
import { useMesa } from '../datos/mesa';
import { OrderCard, TotalsSummary } from '../componentes/cuenta';
import { BarraTitulo, Main } from '../componentes/estructura';
import { Pastilla, formatoPrecio } from '@menu-qr/ui';
import { useTextos } from '../estado/idioma';

export function AccountScreen() {
  const { menu, mesa, cuenta, tokenQr, refrescarCuenta } = useMesa();
  const [editando, setEditando] = useState(false);
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

      {cuenta && (
        <div className="flex items-center justify-between gap-3 rounded-md bg-surface px-4 py-2 text-sm md:mx-auto md:w-full md:max-w-md">
          <span className="flex items-center gap-2">
            <Users className="size-4 text-muted" aria-hidden />
            {cuenta.personas ? t.somos(cuenta.personas) : t.personasTitulo}
          </span>
          <button
            type="button"
            onClick={() => setEditando(true)}
            className="min-h-11 px-2 font-semibold text-purple"
          >
            {t.cambiar}
          </button>
        </div>
      )}
      {cuenta?.ingresoBloqueado && (
        <div
          role="status"
          className="flex items-center gap-3 rounded-md bg-amber-soft px-4 py-3 text-sm text-amber-ink md:mx-auto md:w-full md:max-w-md"
        >
          <span className="flex-1">{t.ingresoBloqueadoAviso}</span>
          <button
            type="button"
            onClick={async () => {
              await api.desbloquearIngreso(mesa!.token).catch(() => {});
              refrescarCuenta();
            }}
            className="min-h-11 rounded-md bg-amber px-3 font-semibold text-on-amber"
          >
            {t.desbloquear}
          </button>
        </div>
      )}
      {editando && <PersonasModal onCerrar={() => setEditando(false)} />}

      {!cuenta ? (
        <div className="flex flex-col gap-3" aria-busy="true">
          {[0, 1].map((i) => (
            <div key={i} className="esqueleto h-40 rounded-md" />
          ))}
        </div>
      ) : pedidos.length === 0 ? (
        <>
          <p className="px-2.5 py-8 text-center text-muted">{t.sinPedidos}</p>
          <button
            type="button"
            onClick={irAlMenu}
            className={`${boton} bg-purple text-on-accent md:mx-auto md:w-80`}
          >
            {t.verMenu}
          </button>
        </>
      ) : (
        <div className="flex flex-col gap-[22px] md:grid md:grid-cols-[minmax(0,1fr)_360px] md:items-start md:gap-8">
          <div className="flex flex-col gap-3">
            {/* El más reciente arriba; el número sigue el orden en que se hicieron. */}
            {pedidos
              .map((p, i) => ({ p, n: i + 1 }))
              .reverse()
              .map(({ p, n }) => (
                <OrderCard key={p.id} pedido={p} numero={n} precio={precio} />
              ))}
          </div>
          <div className="flex flex-col gap-[22px] md:sticky md:top-20">
            <TotalsSummary
              totales={cuenta}
              config={r}
              precio={precio}
              etiquetaTotal={t.totalMesa}
            />
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
          </div>
        </div>
      )}
    </Main>
  );
}
