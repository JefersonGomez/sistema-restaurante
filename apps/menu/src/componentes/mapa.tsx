import { LocateFixed, MapPin, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { Map as MapaLeaflet, Marker } from 'leaflet';
import { useTextos } from '../estado/idioma';

export type Punto = { lat: number; lng: number };

// San José: centro del mapa cuando todavía no hay punto.
const CENTRO: Punto = { lat: 9.9333, lng: -84.0833 };

// Mapa con un pin que se arrastra (o se mueve tocando el mapa). Leaflet se carga solo al abrirlo.
function Mapa({ punto, onCambio }: { punto: Punto | null; onCambio: (p: Punto) => void }) {
  const caja = useRef<HTMLDivElement>(null);
  const mapa = useRef<MapaLeaflet | null>(null);
  const pin = useRef<Marker | null>(null);
  const cambiar = useRef(onCambio);
  cambiar.current = onCambio;

  useEffect(() => {
    let vivo = true;
    let tamano: ResizeObserver | undefined;
    (async () => {
      const L = (await import('leaflet')).default;
      await import('leaflet/dist/leaflet.css');
      if (!vivo || !caja.current) return;
      const inicio = punto ?? CENTRO;
      const m = L.map(caja.current).setView([inicio.lat, inicio.lng], punto ? 17 : 13);
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '© OpenStreetMap',
      }).addTo(m);
      // Pin dibujado con CSS: sin imágenes que el empaquetador tenga que resolver.
      // El giro va en un elemento interno: Leaflet mueve el exterior con `transform` y un `rotate`
      // ahí también giraría ese desplazamiento (el pin se salía del mapa).
      const icono = L.divIcon({
        className: 'pin-caja',
        html: '<span class="pin-entrega"></span>',
        iconSize: [28, 28],
        iconAnchor: [14, 28],
      });
      const p = L.marker([inicio.lat, inicio.lng], { draggable: true, icon: icono }).addTo(m);
      const avisar = () => {
        const { lat, lng } = p.getLatLng();
        cambiar.current({ lat: +lat.toFixed(6), lng: +lng.toFixed(6) });
      };
      p.on('dragend', avisar);
      m.on('click', (e) => {
        p.setLatLng(e.latlng);
        avisar();
      });
      if (!punto) avisar();
      mapa.current = m;
      pin.current = p;
      // Leaflet mide el recuadro al crearse; si su tamaño cambia después (CSS que llega tarde,
      // el teclado del celular…), recalcula y vuelve a centrar el pin para que no quede afuera.
      tamano = new ResizeObserver(() => {
        m.invalidateSize();
        m.panTo(p.getLatLng(), { animate: false });
      });
      tamano.observe(caja.current);
    })();
    return () => {
      vivo = false;
      tamano?.disconnect();
      mapa.current?.remove();
      mapa.current = null;
    };
    // El mapa se crea una vez; los cambios de punto se aplican abajo.
  }, []);

  // "Usar mi ubicación" con el mapa abierto: mover el pin y centrar.
  useEffect(() => {
    if (!punto || !pin.current || !mapa.current) return;
    const actual = pin.current.getLatLng();
    if (actual.lat === punto.lat && actual.lng === punto.lng) return;
    pin.current.setLatLng([punto.lat, punto.lng]);
    mapa.current.setView([punto.lat, punto.lng], 17);
  }, [punto]);

  return (
    <div
      ref={caja}
      className="relative z-0 h-64 w-full overflow-hidden rounded-xl border border-line"
    />
  );
}

// Punto exacto de entrega (opcional): la ubicación del celular y/o un pin en el mapa.
export function PuntoEntrega({
  punto,
  onCambio,
}: {
  punto: Punto | null;
  onCambio: (p: Punto | null) => void;
}) {
  const t = useTextos();
  const [verMapa, setVerMapa] = useState(false);
  const [buscando, setBuscando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const usarUbicacion = () => {
    if (!('geolocation' in navigator)) return setError(t.ubicacionNoDisponible);
    setBuscando(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setBuscando(false);
        onCambio({ lat: +coords.latitude.toFixed(6), lng: +coords.longitude.toFixed(6) });
        setVerMapa(true); // para que pueda corregirlo
      },
      (e) => {
        setBuscando(false);
        setError(e.code === e.PERMISSION_DENIED ? t.ubicacionDenegada : t.ubicacionNoDisponible);
      },
      { enableHighAccuracy: true, timeout: 15_000 },
    );
  };

  return (
    <div className="flex flex-col gap-2 text-sm">
      <span className="font-medium">{t.ubicacionTitulo}</span>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={usarUbicacion}
          disabled={buscando}
          className="inline-flex min-h-11 items-center gap-2 rounded-md bg-surface px-3 font-semibold disabled:opacity-60"
        >
          <LocateFixed className="size-4" aria-hidden />
          {buscando ? t.buscandoUbicacion : t.usarMiUbicacion}
        </button>
        {!verMapa && (
          <button
            type="button"
            onClick={() => setVerMapa(true)}
            className="inline-flex min-h-11 items-center gap-2 rounded-md bg-surface px-3 font-semibold"
          >
            <MapPin className="size-4" aria-hidden /> {t.marcarEnMapa}
          </button>
        )}
        {punto && (
          <button
            type="button"
            onClick={() => {
              onCambio(null);
              setVerMapa(false);
            }}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-md px-3 text-muted"
          >
            <X className="size-4" aria-hidden /> {t.quitarPunto}
          </button>
        )}
      </div>
      {error && <p className="text-xs text-danger">{error}</p>}
      {verMapa && <Mapa punto={punto} onCambio={onCambio} />}
      {punto && <p className="text-xs text-muted">{t.ubicacionMarcada}</p>}
    </div>
  );
}

// Seguimiento (Fase 17.3): mapa de solo lectura con la moto del repartidor y el punto de entrega.
// La moto se mueve sola cuando llega una ubicación nueva (sin volver a crear el mapa).
export function MapaRastreo({ repartidor, destino }: { repartidor: Punto; destino: Punto | null }) {
  const caja = useRef<HTMLDivElement>(null);
  const mapa = useRef<MapaLeaflet | null>(null);
  const moto = useRef<Marker | null>(null);

  useEffect(() => {
    let vivo = true;
    let tamano: ResizeObserver | undefined;
    (async () => {
      const L = (await import('leaflet')).default;
      await import('leaflet/dist/leaflet.css');
      if (!vivo || !caja.current) return;
      const m = L.map(caja.current, { zoomControl: true, attributionControl: true });
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '© OpenStreetMap',
      }).addTo(m);
      const iconoMoto = L.divIcon({
        className: 'pin-caja',
        html: '<span class="moto-repartidor" aria-hidden="true">🛵</span>',
        iconSize: [40, 40],
        iconAnchor: [20, 20],
      });
      moto.current = L.marker([repartidor.lat, repartidor.lng], { icon: iconoMoto }).addTo(m);
      if (destino) {
        const iconoDestino = L.divIcon({
          className: 'pin-caja',
          html: '<span class="pin-entrega"></span>',
          iconSize: [28, 28],
          iconAnchor: [14, 28],
        });
        L.marker([destino.lat, destino.lng], { icon: iconoDestino }).addTo(m);
        m.fitBounds(
          L.latLngBounds([
            [repartidor.lat, repartidor.lng],
            [destino.lat, destino.lng],
          ]),
          { padding: [40, 40], maxZoom: 17 },
        );
      } else m.setView([repartidor.lat, repartidor.lng], 16);
      mapa.current = m;
      tamano = new ResizeObserver(() => m.invalidateSize());
      tamano.observe(caja.current);
    })();
    return () => {
      vivo = false;
      tamano?.disconnect();
      mapa.current?.remove();
      mapa.current = null;
    };
    // El mapa se crea una vez; la moto se mueve abajo.
  }, []);

  useEffect(() => {
    moto.current?.setLatLng([repartidor.lat, repartidor.lng]);
  }, [repartidor.lat, repartidor.lng]);

  return <div ref={caja} className="h-72 w-full overflow-hidden rounded-lg md:h-80" />;
}
