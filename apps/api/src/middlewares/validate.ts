import type { RequestHandler } from 'express';
import type { ZodType } from 'zod';

type Esquemas = { body?: ZodType; params?: ZodType; query?: ZodType };

// Reemplaza body/params/query por la versión validada (y transformada) por Zod.
export const validate =
  (s: Esquemas): RequestHandler =>
  (req, _res, next) => {
    if (s.body) req.body = s.body.parse(req.body);
    if (s.params) req.params = s.params.parse(req.params) as typeof req.params;
    // En Express 5 req.query es un getter: hay que redefinirlo.
    if (s.query) Object.defineProperty(req, 'query', { value: s.query.parse(req.query) });
    next();
  };
