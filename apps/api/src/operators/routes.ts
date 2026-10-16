import { Hono } from 'hono';
import type { OperatorAppearance } from '@rpr/protocol';
import type { OperatorCatalog } from './catalog';
import { OPERATOR_SUPPLY, type OperatorRecord } from '../operator-seed';

export function operatorRoutes(catalog?: OperatorCatalog): Hono {
  const routes = new Hono();
  routes.use('*', async (c, next) => {
    c.header('Cache-Control', 'no-store');
    try {
      if (!catalog || !await catalog.ready()) return c.json({ error: 'Operator catalog unavailable. Please retry.' }, 503);
      await next();
    } catch {
      return c.json({ error: 'Operator catalog unavailable. Please retry.' }, 503);
    }
  });
  routes.get('/random', async (c) => {
    const raw = c.req.query('exclude');
    const exclude = raw === undefined ? undefined : parseId(raw);
    if (exclude === null) return c.json({ error: 'Invalid excluded Operator ID' }, 400);
    const operator = await catalog!.random(exclude);
    return operator ? c.json(appearance(operator)) : c.json({ error: 'Operator not found' }, 404);
  });
  routes.get('/:tokenId', async (c) => {
    const id = parseId(c.req.param('tokenId'));
    if (id === null) return c.json({ error: 'Operator ID must be an integer from 1 to 5555' }, 400);
    const operator = await catalog!.get(id);
    return operator ? c.json(appearance(operator)) : c.json({ error: 'Operator not found' }, 404);
  });
  routes.get('/:tokenId/image.svg', async (c) => {
    const id = parseId(c.req.param('tokenId'));
    if (id === null) return c.json({ error: 'Invalid Operator ID' }, 400);
    const operator = await catalog!.get(id);
    if (!operator || (c.req.query('v') && c.req.query('v') !== operator.artworkHash)) {
      return c.json({ error: 'Operator artwork not found' }, 404);
    }
    const etag = `"${operator.artworkHash}"`;
    c.header('ETag', etag);
    c.header('Cache-Control', 'public, max-age=3600, must-revalidate');
    c.header('Content-Security-Policy', "default-src 'none'; sandbox");
    c.header('X-Content-Type-Options', 'nosniff');
    if (c.req.header('If-None-Match') === etag) return c.body(null, 304);
    c.header('Content-Type', 'image/svg+xml; charset=utf-8');
    return c.body(operator.svg);
  });
  return routes;
}

function parseId(raw: string): number | null {
  const id = Number(raw);
  return /^[1-9]\d{0,3}$/.test(raw) && id <= OPERATOR_SUPPLY ? id : null;
}
function appearance(operator: OperatorRecord): OperatorAppearance {
  return {
    tokenId: operator.tokenId,
    name: `Operator #${operator.tokenId}`,
    traits: operator.traits,
    artworkHash: operator.artworkHash,
    imageUrl: `/api/operators/${operator.tokenId}/image.svg?v=${operator.artworkHash}`,
  };
}
