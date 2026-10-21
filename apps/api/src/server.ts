import { createServer } from 'node:http';
import { app } from './app';
import { env } from './lib/env';
import { logger } from './lib/logger';

const server = createServer(app);
server.listen(env.PORT, () => logger.info(`API escuchando en http://localhost:${env.PORT}`));
