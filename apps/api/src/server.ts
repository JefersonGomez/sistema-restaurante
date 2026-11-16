import { createServer } from 'node:http';
import { app } from './app';
import { env } from './lib/env';
import { logger } from './lib/logger';
import { iniciarRealtime } from './realtime';
import { suspenderVencidos } from './modules/admin/admin.service';
import { procesarCola } from './modules/factura/factura.service';

const server = createServer(app);
iniciarRealtime(server);
server.listen(env.PORT, () => logger.info(`API escuchando en http://localhost:${env.PORT}`));

// Planes vencidos (más el día de gracia): se suspenden al arrancar y cada hora.
const revisarPlanes = () =>
  suspenderVencidos()
    .then((n) => n && logger.info(`Restaurantes suspendidos por falta de pago: ${n}`))
    .catch((e) => logger.error('No se pudieron revisar los planes vencidos', e));
void revisarPlanes();
setInterval(revisarPlanes, 60 * 60 * 1000).unref();

// Factura electrónica: envía a Hacienda los comprobantes pendientes y consulta su estado.
const enviarComprobantes = () =>
  procesarCola().catch((e) => logger.error('No se pudo procesar la cola de comprobantes', e));
void enviarComprobantes();
setInterval(enviarComprobantes, 30 * 1000).unref();
