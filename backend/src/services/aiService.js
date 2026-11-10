import { config } from '../config/env.js';
import { AppError } from '../utils/errors.js';

export async function callAi(path, { method = 'GET', body, query = '' } = {}) {
  if (!config.ai.serviceUrl || !config.ai.serviceToken) {
    throw new AppError(503, 'Recipe AI is not configured. Set AI_SERVICE_URL and AI_SERVICE_TOKEN.', 'AI_UNAVAILABLE');
  }
  // Render's `fromService` host property has no scheme, so accept both forms.
  const base = /^https?:\/\//i.test(config.ai.serviceUrl) ? config.ai.serviceUrl : `https://${config.ai.serviceUrl}`;
  const url = new URL(path, base.endsWith('/') ? base : `${base}/`);
  if (query) url.search = query;
  try {
    const response = await fetch(url, {
      method,
      headers: { Accept: 'application/json', Authorization: `Bearer ${config.ai.serviceToken}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(config.ai.timeoutMs),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      const status = response.status === 404 ? 404 : response.status === 422 ? 400 : 503;
      throw new AppError(status, data?.detail || 'Recipe AI could not complete the request.', response.status === 404 ? 'AI_NOT_FOUND' : 'AI_REQUEST_FAILED');
    }
    return data;
  } catch (error) {
    if (error instanceof AppError) throw error;
    const timeout = error.name === 'TimeoutError' || error.name === 'AbortError';
    throw new AppError(503, timeout ? 'Recipe AI request timed out.' : 'Recipe AI service is unavailable.', timeout ? 'AI_TIMEOUT' : 'AI_UNAVAILABLE');
  }
}
