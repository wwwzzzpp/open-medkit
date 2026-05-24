import { Hono } from 'hono';
import { getConnInfo } from '@hono/node-server/conninfo';

import argon2 from 'argon2';
import { getDb } from '../db/client';
import { isAuthEnabled } from '../auth/password';
import {
  checkRateLimit,
  createSession,
  getSessionUserId,
  recordFailure,
  removeSession,
  resetLimit,
} from '../auth/session';

export const authRouter = new Hono<{ Variables: { userId: number } }>();

function parseCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  const match = header.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match?.[1];
}

function buildSetCookie(token: string, maxAge: number, isSecure: boolean): string {
  const parts = [
    `medkit_session=${token}`,
    'Path=/',
    `Max-Age=${maxAge}`,
    'HttpOnly',
    'SameSite=Lax',
  ];
  if (isSecure) parts.push('Secure');
  return parts.join('; ');
}

function detectSecure(c: { req: { header: (name: string) => string | undefined; url: string } }): boolean {
  if (c.req.header('x-forwarded-proto') === 'https') return true;
  try {
    return new URL(c.req.url).protocol === 'https:';
  } catch {
    return false;
  }
}

function getRateLimitKey(c: Parameters<typeof getConnInfo>[0]): string {
  try {
    const info = getConnInfo(c);
    return info.remote.address || 'unknown';
  } catch {
    return 'unknown';
  }
}

authRouter.get('/status', (c) => {
  const requiresAuth = isAuthEnabled();
  let authenticated = false;

  let user = null;

  if (requiresAuth) {
    const token = parseCookie(c.req.header('cookie'), 'medkit_session');
    if (token) {
      const userId = getSessionUserId(token);
      if (userId !== null) {
        authenticated = true;
        const row = getDb().prepare('SELECT username FROM users WHERE id = ?').get(userId) as { username: string } | undefined;
        if (row) {
          user = { id: userId, username: row.username };
        }
      }
    }
  }

  c.header('Cache-Control', 'no-store');
  return c.json({ requiresAuth, authenticated, user });
});

authRouter.post('/register', async (c) => {
  if (!isAuthEnabled()) {
    return c.json({ error: 'Authentication is not enabled' }, 400);
  }

  let body: { username?: string; password?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid request body' }, 400);
  }

  const { username, password } = body;
  if (!username || typeof username !== 'string' || username.trim().length < 3) {
    return c.json({ error: 'Username must be at least 3 characters long' }, 400);
  }
  if (!password || typeof password !== 'string' || password.length < 6) {
    return c.json({ error: 'Password must be at least 6 characters long' }, 400);
  }

  const db = getDb();
  
  // Check if username exists
  const existingUser = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (existingUser) {
    return c.json({ error: '用户名已存在' }, 400);
  }

  try {
    const passwordHash = await argon2.hash(password);
    const result = db.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)').run(username, passwordHash);
    
    const token = createSession(Number(result.lastInsertRowid));
    const isSecure = detectSecure(c);
    const maxAge = 7 * 24 * 60 * 60;
    
    c.header('Set-Cookie', buildSetCookie(token, maxAge, isSecure));
    return c.json({ success: true });
  } catch (err) {
    console.error('Registration error:', err);
    return c.json({ error: '注册失败，请重试' }, 500);
  }
});

authRouter.post('/login', async (c) => {
  if (!isAuthEnabled()) {
    return c.json({ error: 'Authentication is not enabled' }, 400);
  }

  const rateLimitKey = getRateLimitKey(c);
  const limit = checkRateLimit(rateLimitKey);

  if (!limit.allowed) {
    const retryAfterSec = Math.ceil((limit.retryAfterMs || 0) / 1000);
    c.header('Retry-After', String(retryAfterSec));
    return c.json({ error: '登录尝试过多，请稍后重试' }, 429);
  }

  let body: { username?: string; password?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid request body' }, 400);
  }

  const { username, password } = body;
  if (!username || typeof username !== 'string') {
    return c.json({ error: 'Username is required' }, 400);
  }
  if (!password || typeof password !== 'string') {
    return c.json({ error: 'Password is required' }, 400);
  }

  const db = getDb();
  const user = db.prepare('SELECT id, password_hash FROM users WHERE username = ?').get(username) as { id: number, password_hash: string } | undefined;

  let valid = false;
  if (user) {
    try {
      valid = await argon2.verify(user.password_hash, password);
    } catch {}
  }

  if (!valid) {
    recordFailure(rateLimitKey);
    return c.json({ error: '密码错误' }, 401);
  }

  resetLimit(rateLimitKey);

  const token = createSession(user!.id);
  const isSecure = detectSecure(c);
  const maxAge = 7 * 24 * 60 * 60; // 7 days in seconds

  c.header('Set-Cookie', buildSetCookie(token, maxAge, isSecure));
  return c.json({ success: true });
});

authRouter.post('/logout', (c) => {
  const token = parseCookie(c.req.header('cookie'), 'medkit_session');

  if (token) {
    removeSession(token);
  }

  const isSecure = detectSecure(c);
  c.header('Set-Cookie', buildSetCookie('', 0, isSecure));
  return c.json({ success: true });
});
