import { useQuery } from '@tanstack/react-query';
import { PLANES, suspensionDe, type EstadoSuscripcion, type Plan } from '@menu-qr/shared';
import { api } from '../api';

type Suscripcion = {
  plan: Plan;
  venceEn: string | null;
  estado: EstadoSuscripcion;
  soporteWhatsApp: string | null;
};

// Aviso del plan arriba del panel del dueño: mes de prueba, por vencer o vencido.
export function AvisoPlan() {
  const { data: s } = useQuery({
    queryKey: ['suscripcion'],
    queryFn: () => api<Suscripcion>('/restaurante/suscripcion'),
    staleTime: 10 * 60_000,
  });
  if (!s || s.estado === 'AL_DIA' || s.estado === 'SUSPENDIDO') return null;
  const dias = s.venceEn ? Math.ceil((Date.parse(s.venceEn) - Date.now()) / 86_400_000) : 0;
  const fecha = s.venceEn
    ? new Date(s.venceEn).toLocaleDateString('es-CR', { day: 'numeric', month: 'long' })
    : '';
  const texto =
    s.estado === 'PRUEBA'
      ? `Está en su mes de prueba del plan ${PLANES[s.plan].nombre}: le quedan ${dias} ${dias === 1 ? 'día' : 'días'} (hasta el ${fecha}).`
      : s.estado === 'POR_VENCER'
        ? `Su plan ${PLANES[s.plan].nombre} vence el ${fecha}. Renuévelo para no perder el servicio.`
        : `Su plan venció el ${fecha}. Si no se registra el pago, el servicio se suspende el ${s.venceEn ? suspensionDe(s.venceEn).toLocaleDateString('es-CR', { day: 'numeric', month: 'long' }) : ''}.`;
  const tono =
    s.estado === 'VENCIDO'
      ? 'bg-danger-soft text-danger'
      : s.estado === 'POR_VENCER'
        ? 'bg-amber-soft text-amber-ink'
        : 'bg-info-soft text-info';
  const whatsapp = s.soporteWhatsApp?.replace(/\D/g, '');
  return (
    <p
      role="status"
      className={`mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md p-3 text-sm ${tono}`}
    >
      <span className="flex-1">{texto}</span>
      {whatsapp && (
        <a
          href={`https://wa.me/${whatsapp}?text=${encodeURIComponent('Hola, quiero pagar la mensualidad de mi restaurante.')}`}
          target="_blank"
          rel="noreferrer"
          className="font-semibold underline"
        >
          Escribir a soporte
        </a>
      )}
    </p>
  );
}
