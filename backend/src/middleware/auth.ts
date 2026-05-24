import { createMiddleware } from 'hono/factory';

import { isAuthEnabled } from '../auth/password';
import { getSessionUserId } from '../auth/session';

function parseCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  const match = header.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match?.[1];
}

const AUTH_WHITELIST = ['/auth/', '/auth', '/health'];

export const authMiddleware = createMiddleware(async (c, next) => {
  if (!isAuthEnabled()) {
    c.set('userId', 1); // Fallback for disabled auth
    await next();
    return;
  }

  const path = c.req.path.replace(/^\/api/, '');
  if (AUTH_WHITELIST.some((prefix) => path === prefix || path.startsWith(prefix))) {
    await next();
    return;
  }

  const token = parseCookie(c.req.header('cookie'), 'medkit_session');

  if (token) {
    const userId = getSessionUserId(token);
    if (userId !== null) {
      c.set('userId', userId);
      await next();
      return;
    }
  }

  return c.json({ error: 'Authentication required' }, 401);
});
