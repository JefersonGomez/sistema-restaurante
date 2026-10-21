import { randomBytes } from 'node:crypto';

export const generarTokenQr = () => randomBytes(24).toString('base64url');
