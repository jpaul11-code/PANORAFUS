const crypto = require('node:crypto');
const { promisify } = require('node:util');
const jwt = require('jsonwebtoken');
const { ApiError } = require('../middleware/errors');
const { ownUser } = require('../models');
const scrypt = promisify(crypto.scrypt);
const hashToken = token => crypto.createHash('sha256').update(token).digest('hex');
const unauthorized = () => new ApiError(401, 'UNAUTHORIZED', 'Invalid or expired credentials');

async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = await scrypt(password, salt, 64);
  return `scrypt:${salt}:${hash.toString('hex')}`;
}
async function checkPassword(password, encoded) {
  const [algorithm, salt, hex] = (encoded || '').split(':');
  if (algorithm !== 'scrypt' || !salt || !/^[a-f0-9]{128}$/.test(hex || '')) return false;
  const actual = await scrypt(password, salt, 64);
  return crypto.timingSafeEqual(actual, Buffer.from(hex, 'hex'));
}
function authService(db, config) {
  function access(user) {
    return jwt.sign({ ver: user.token_version }, config.secret, {
      algorithm: 'HS256', subject: user.id, issuer: config.issuer,
      audience: config.audience, expiresIn: config.accessTtl
    });
  }
  async function issue(tx, user, family_id = crypto.randomUUID()) {
    const refresh_token = crypto.randomBytes(48).toString('base64url');
    await tx.refreshToken.create({ data: {
      user_id: user.id, token_hash: hashToken(refresh_token), family_id,
      expires_at: new Date(Date.now() + config.refreshDays * 86400000)
    } });
    return { access_token: access(user), refresh_token, token_type: 'Bearer',
      expires_in: config.accessTtl, user: ownUser(user) };
  }
  async function authenticate(token) {
    let payload;
    try {
      payload = jwt.verify(token, config.secret, {
        algorithms: ['HS256'], issuer: config.issuer, audience: config.audience
      });
    } catch { throw unauthorized(); }
    if (typeof payload.sub !== 'string' || !Number.isInteger(payload.ver)) throw unauthorized();
    const user = await db.user.findUnique({ where: { id: payload.sub }, include: { profile: true } });
    if (!user || user.status === 'suspended' || user.token_version !== payload.ver) throw unauthorized();
    return { user, exp: payload.exp };
  }
  async function refresh(token) {
    const result = await db.$transaction(async tx => {
      let row = await tx.refreshToken.findUnique({ where: { token_hash: hashToken(token) } });
      if (!row) return null;
      // Serialize rotation, replay revocation and logout on the user's database row.
      const user = await tx.user.update({ where: { id: row.user_id },
        data: { token_version: { increment: 0 } }, include: { profile: true } });
      row = await tx.refreshToken.findUnique({ where: { token_hash: hashToken(token) } });
      if (row.used_at || row.revoked_at) {
        await tx.refreshToken.updateMany({ where: { family_id: row.family_id }, data: { revoked_at: new Date() } });
        await tx.user.update({ where: { id: row.user_id }, data: { token_version: { increment: 1 } } });
        return null;
      }
      if (!user || user.status === 'suspended' || row.expires_at <= new Date()) return null;
      const claimed = await tx.refreshToken.updateMany({
        where: { id: row.id, used_at: null, revoked_at: null }, data: { used_at: new Date() }
      });
      if (!claimed.count) {
        await tx.refreshToken.updateMany({ where: { family_id: row.family_id }, data: { revoked_at: new Date() } });
        await tx.user.update({ where: { id: row.user_id }, data: { token_version: { increment: 1 } } });
        return null;
      }
      return issue(tx, user, row.family_id);
    });
    if (!result) throw unauthorized();
    return result;
  }
  async function logout(user, token) {
    await db.$transaction(async tx => {
      if (token) {
        const row = await tx.refreshToken.findUnique({ where: { token_hash: hashToken(token) } });
        if (!row || row.user_id !== user.id) throw unauthorized();
      }
      await tx.user.update({ where: { id: user.id }, data: { token_version: { increment: 1 } } });
      await tx.refreshToken.updateMany({ where: { user_id: user.id }, data: { revoked_at: new Date() } });
    });
  }
  return { issue, authenticate, refresh, logout };
}
module.exports = { authService, hashPassword, checkPassword, hashToken, unauthorized };
