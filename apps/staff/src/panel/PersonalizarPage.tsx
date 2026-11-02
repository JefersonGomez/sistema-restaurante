import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ImagePlus, PartyPopper, Upload } from 'lucide-react';
import { useState, type CSSProperties, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  acentoLegible,
  restauranteConfigSchema,
  type MenuPublico,
  type Moneda,
} from '@menu-qr/shared';
import { turnosDeHoy } from '@menu-qr/shared/horario';
import { Header, InfoLocal } from '@menu-qr/ui';
import { api, subirImagen, type ErrorApi } from '../api';
import { Boton, Campo, ErrorCarga, erroresDe, Esqueleto, Tarjeta, TituloPagina } from './comunes';

type Restaurante = MenuPublico['restaurante'] & {
  horarios: { diaSemana: number; abre: string; cierra: string }[];
  moneda: Moneda;
};
const MORADO = '#5b2db5';

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
    <Tarjeta className="space-y-3">
      <div>
        <h2 className="font-semibold">{titulo}</h2>
        {detalle && <p className="text-sm text-muted">{detalle}</p>}
      </div>
      {children}
    </Tarjeta>
  );
}

// Botón para subir una imagen (logo o banner) con estado de carga.
function SubirImagen({
  destino,
  texto,
  onSubida,
  onError,
}: {
  destino: 'logo' | 'banner';
  texto: string;
  onSubida: (url: string) => void;
  onError: (m: string) => void;
}) {
  const [subiendo, setSubiendo] = useState(false);
  return (
    <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-md bg-surface px-4 text-sm font-semibold hover:bg-surface-2">
      <Upload className="size-4" aria-hidden /> {subiendo ? 'Subiendo…' : texto}
      <input
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        disabled={subiendo}
        onChange={async (e) => {
          const archivo = e.target.files?.[0];
          if (!archivo) return;
          setSubiendo(true);
          try {
            onSubida((await subirImagen<{ url: string }>(archivo, destino)).url);
          } catch (err) {
            onError((err as Error).message);
          } finally {
            setSubiendo(false);
          }
        }}
      />
    </label>
  );
}

function Formulario({ r }: { r: Restaurante }) {
  const qc = useQueryClient();
  const [f, setF] = useState({
    nombre: r.nombre,
    eslogan: r.eslogan ?? '',
    logoUrl: r.logoUrl,
    bannerUrl: r.bannerUrl,
    colorAcento: r.colorAcento,
    telefono: r.telefono ?? '',
    direccion: r.direccion ?? '',
    ubicacionUrl: r.ubicacionUrl ?? '',
  });
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [guardado, setGuardado] = useState(false);
  const poner = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => {
    setGuardado(false);
    setErrores(({ [k]: _, ...resto }) => resto);
    setF((x) => ({ ...x, [k]: v }));
  };
  const guardar = useMutation({
    mutationFn: (body: object) => api<Restaurante>('/restaurante', { method: 'PATCH', body }),
    onSuccess: (nuevo) => {
      qc.setQueryData(['restaurante'], nuevo);
      setGuardado(true);
    },
    onError: (e: ErrorApi) => setErrores({ general: e.message }),
  });
  const enviar = () => {
    const datos = restauranteConfigSchema.safeParse({
      nombre: f.nombre,
      eslogan: f.eslogan.trim() || null,
      logoUrl: f.logoUrl,
      bannerUrl: f.bannerUrl,
      colorAcento: f.colorAcento,
      telefono: f.telefono.trim() || null,
      direccion: f.direccion.trim() || null,
      ubicacionUrl: f.ubicacionUrl.trim() || null,
    });
    if (!datos.success) return setErrores(erroresDe(datos.error));
    guardar.mutate(datos.data);
  };

  const acento = f.colorAcento ?? MORADO;
  const legible = acentoLegible(acento);
  // Vista previa: el mismo encabezado y la misma tarjeta de ubicación del menú del cliente.
  const previa: MenuPublico['restaurante'] = {
    ...r,
    nombre: f.nombre || 'Su restaurante',
    eslogan: f.eslogan.trim() || null,
    logoUrl: f.logoUrl,
    bannerUrl: f.bannerUrl,
    colorAcento: f.colorAcento,
    telefono: f.telefono.trim() || null,
    direccion: f.direccion.trim() || null,
    ubicacionUrl: f.ubicacionUrl.trim() || null,
    abierto: true,
    horarioHoy: turnosDeHoy(r.horarios, new Date(), r.zonaHoraria),
  };

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_400px]">
      <div className="space-y-4">
        <Seccion titulo="Nombre y eslogan">
          <Campo
            etiqueta="Nombre del restaurante"
            value={f.nombre}
            onChange={(e) => poner('nombre', e.target.value)}
            error={errores.nombre}
          />
          <Campo
            etiqueta="Eslogan (opcional)"
            placeholder="La sazón de la abuela, desde 1998"
            maxLength={120}
            value={f.eslogan}
            onChange={(e) => poner('eslogan', e.target.value)}
            error={errores.eslogan}
          />
        </Seccion>

        <Seccion
          titulo="Logo y banner"
          detalle="El banner va arriba del menú. Ideal: foto horizontal de 1600 × 600 px."
        >
          <div className="flex flex-wrap items-center gap-3">
            {f.logoUrl ? (
              <img
                src={f.logoUrl}
                alt="Logo actual"
                className="size-16 rounded-full bg-surface object-cover"
              />
            ) : (
              <span className="grid size-16 place-items-center rounded-full bg-surface text-xs text-muted">
                Sin logo
              </span>
            )}
            <SubirImagen
              destino="logo"
              texto="Subir logo"
              onSubida={(url) => poner('logoUrl', url)}
              onError={(m) => setErrores({ logoUrl: m })}
            />
            {f.logoUrl && (
              <Boton variante="suave" onClick={() => poner('logoUrl', null)}>
                Quitar
              </Boton>
            )}
          </div>
          {errores.logoUrl && <p className="text-sm text-danger">{errores.logoUrl}</p>}
          <div className="overflow-hidden rounded-md bg-surface">
            {f.bannerUrl ? (
              <img
                src={f.bannerUrl}
                alt="Banner actual"
                className="aspect-[16/6] w-full object-cover"
              />
            ) : (
              <div className="grid aspect-[16/6] place-items-center text-muted">
                <ImagePlus className="size-8" aria-hidden />
              </div>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <SubirImagen
              destino="banner"
              texto={f.bannerUrl ? 'Cambiar banner' : 'Subir banner'}
              onSubida={(url) => poner('bannerUrl', url)}
              onError={(m) => setErrores({ bannerUrl: m })}
            />
            {f.bannerUrl && (
              <Boton variante="suave" onClick={() => poner('bannerUrl', null)}>
                Quitar banner
              </Boton>
            )}
          </div>
          {errores.bannerUrl && <p className="text-sm text-danger">{errores.bannerUrl}</p>}
        </Seccion>

        <Seccion
          titulo="Color del menú"
          detalle="El color de los botones que ve el cliente. Tiene que ser oscuro para que el texto blanco se lea."
        >
          <div className="flex flex-wrap items-center gap-3">
            <input
              type="color"
              aria-label="Elegir color"
              value={acento}
              onChange={(e) => poner('colorAcento', e.target.value)}
              className="h-11 w-16 cursor-pointer rounded-md border border-line bg-surface"
            />
            <Campo
              etiqueta="Código"
              className="w-32"
              value={f.colorAcento ?? ''}
              placeholder={MORADO}
              onChange={(e) => poner('colorAcento', e.target.value || null)}
            />
            {f.colorAcento && (
              <Boton variante="suave" onClick={() => poner('colorAcento', null)}>
                Usar el morado original
              </Boton>
            )}
          </div>
          {(errores.colorAcento || !legible) && (
            <p role="alert" className="text-sm text-danger">
              {errores.colorAcento ??
                'Ese color no contrasta con el texto blanco; elija uno más oscuro'}
            </p>
          )}
        </Seccion>

        <Seccion
          titulo="Ubicación y contacto"
          detalle="El cliente ve el mapa, la dirección y el botón «Cómo llegar» al final del menú."
        >
          <Campo
            etiqueta="Teléfono"
            type="tel"
            placeholder="8888 8888"
            value={f.telefono}
            onChange={(e) => poner('telefono', e.target.value)}
            error={errores.telefono}
          />
          <Campo
            etiqueta="Dirección"
            placeholder="100 m norte de la iglesia, San José"
            value={f.direccion}
            onChange={(e) => poner('direccion', e.target.value)}
            error={errores.direccion}
            ayuda="Con la dirección se dibuja el mapa"
          />
          <Campo
            etiqueta="Enlace de Google Maps (opcional)"
            placeholder="https://maps.app.goo.gl/…"
            value={f.ubicacionUrl}
            onChange={(e) => poner('ubicacionUrl', e.target.value)}
            error={errores.ubicacionUrl}
            ayuda="En Google Maps: busque su local → Compartir → Copiar enlace"
          />
        </Seccion>

        <div className="sticky bottom-4 z-10 flex items-center gap-3 rounded-lg bg-app p-3 shadow-tarjeta">
          <Boton onClick={enviar} disabled={guardar.isPending || !legible}>
            Guardar cambios
          </Boton>
          {guardado && (
            <span role="status" className="text-sm text-ok">
              Cambios guardados: ya se ven en el menú
            </span>
          )}
          {errores.general && (
            <span role="alert" className="text-sm text-danger">
              {errores.general}
            </span>
          )}
        </div>
      </div>

      <aside className="lg:sticky lg:top-6" aria-label="Vista previa del menú">
        <p className="mb-2 text-sm font-semibold text-muted">Así lo ve el cliente</p>
        <div
          style={{ '--purple': acento, '--on-accent': '#ffffff' } as CSSProperties}
          className="max-h-[75dvh] overflow-y-auto rounded-[28px] border-8 border-fg/90 bg-app shadow-app"
        >
          <div className="pointer-events-none flex flex-col gap-[22px] px-5 pt-[22px] pb-6">
            <Header restaurante={previa} mesa={1} onLlamar={() => {}} onCambiarIdioma={() => {}} />
            <InfoLocal restaurante={previa} />
          </div>
        </div>
      </aside>
    </div>
  );
}

export function PersonalizarPage() {
  const [params] = useSearchParams();
  const restaurante = useQuery({
    queryKey: ['restaurante'],
    queryFn: () => api<Restaurante>('/restaurante'),
  });
  if (restaurante.isError)
    return (
      <ErrorCarga
        mensaje="No se pudo cargar el restaurante"
        onReintentar={() => restaurante.refetch()}
      />
    );
  return (
    <>
      {params.has('bienvenida') && (
        <div className="anim-entrar mb-4 flex flex-wrap items-center gap-3 rounded-lg bg-purple-soft p-4 text-purple">
          <PartyPopper className="size-6 shrink-0" aria-hidden />
          <p className="flex-1 text-sm">
            <strong className="block text-base">¡Bienvenido! Su restaurante ya está creado.</strong>
            Personalice cómo lo ven sus clientes. Después cree su{' '}
            <Link to="/panel/menu" className="font-semibold underline">
              menú
            </Link>{' '}
            y sus{' '}
            <Link to="/panel/mesas" className="font-semibold underline">
              mesas con QR
            </Link>
            .
          </p>
        </div>
      )}
      <TituloPagina
        titulo="Personalizar"
        detalle="Logo, banner, eslogan, color y ubicación: todo lo que ve el cliente en el menú."
      />
      {restaurante.data ? <Formulario r={restaurante.data} /> : <Esqueleto className="h-96" />}
    </>
  );
}
