/**
 * backend/middleware/auth.js
 *
 * Every route previously repeated the same twelve lines: read the header,
 * strip "Bearer ", build a user-bound client, sometimes call getUser().
 * Several routes never verified the token at all — they built a client from
 * whatever string arrived and let RLS sort it out, which meant a malformed
 * token produced a confusing 400 from PostgREST rather than a clean 401.
 *
 * This centralises it. After requireAuth, a handler can rely on:
 *   req.user       — the verified Supabase user
 *   req.userClient — a Supabase client bound to that user (RLS enforced)
 *   req.token      — the raw JWT
 */

import { createUserClient } from '../config/supabase.js';

export async function requireAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: 'UNAUTHENTICATED',
        message: 'Sign in to continue. Expected an "Authorization: Bearer <token>" header.'
      });
    }

    const token = authHeader.slice('Bearer '.length).trim();

    if (!token) {
      return res.status(401).json({
        error: 'UNAUTHENTICATED',
        message: 'Sign in to continue. The authorization token was empty.'
      });
    }

    const userClient = createUserClient(token);
    const { data: { user }, error } = await userClient.auth.getUser();

    if (error || !user) {
      return res.status(401).json({
        error: 'SESSION_INVALID',
        message: 'Your session has expired. Sign in again to continue.'
      });
    }

    req.token = token;
    req.user = user;
    req.userClient = userClient;
    return next();
  } catch (err) {
    console.error('requireAuth error:', err.message);
    return res.status(401).json({
      error: 'SESSION_INVALID',
      message: 'Could not verify your session. Sign in again to continue.'
    });
  }
}

/**
 * Wraps an async route handler so a rejected promise reaches the Express
 * error handler instead of hanging the request. Removes the try/catch that
 * was copy-pasted into every handler.
 */
export function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}
