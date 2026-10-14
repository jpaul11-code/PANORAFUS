function integer(env, name, fallback, min, max) {
  const value = Number(env[name] ?? fallback);
  if (!Number.isInteger(value) || value < min || value > max) throw new Error(`Invalid ${name}`);
  return value;
}

function loadConfig(env = process.env) {
  const secret = env.JWT_SECRET || '';
  if (secret.length < 32 || /^(change|replace|example|your|secret|default)/i.test(secret) || new Set(secret).size < 8) {
    throw new Error('JWT_SECRET must be a unique secret of at least 32 characters');
  }
  const origins = (env.CORS_ORIGINS || '').split(',').map(x => x.trim()).filter(Boolean);
  for (const origin of origins) {
    const url = new URL(origin);
    if (!['http:', 'https:'].includes(url.protocol) || url.origin !== origin) throw new Error('Invalid CORS_ORIGINS');
  }
  if (env.AI_ENDPOINT) {
    const url = new URL(env.AI_ENDPOINT);
    if (url.protocol !== 'https:' || url.username || url.password || url.hash) throw new Error('AI_ENDPOINT must be HTTPS');
  }
  return {
    secret, origins, issuer: env.JWT_ISSUER || 'panorafus', audience: env.JWT_AUDIENCE || 'panorafus-api',
    port: integer(env, 'PORT', 3001, 1, 65535),
    accessTtl: integer(env, 'ACCESS_TOKEN_TTL_SECONDS', 900, 60, 3600),
    refreshDays: integer(env, 'REFRESH_TOKEN_TTL_DAYS', 30, 1, 90),
    aiEndpoint: env.AI_ENDPOINT, aiKey: env.AI_API_KEY, aiModel: env.AI_MODEL,
    aiTimeout: integer(env, 'AI_TIMEOUT_MS', 10000, 100, 30000),
    ssePoll: integer(env, 'SSE_POLL_MS', 2000, 100, 30000)
  };
}
module.exports = { loadConfig };
