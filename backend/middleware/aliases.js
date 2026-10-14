const { ApiError } = require('./errors');
const { parse, id } = require('./validation');
const textSizes = { small: 12, medium: 16, large: 20, extra_large: 24 };
function inputAliases(req, res, next) {
  if (!['POST', 'PATCH'].includes(req.method) || !req.body || typeof req.body !== 'object' || Array.isArray(req.body)) return next();
  const path = req.path.replace(/\/$/, '');
  const aliases = {};
  const legacyRegistration = path === '/auth/register' && Object.hasOwn(req.body, 'display_name');
  if (path === '/auth/register') Object.assign(aliases, { display_name: 'full_name', language_code: 'preferred_language' });
  if (/^\/questions\/[^/]+\/answers$/.test(path) || /^\/answers\/[^/]+$/.test(path)) aliases.response_text = 'body';
  if (/^\/journals(?:\/[^/]+)?$/.test(path)) Object.assign(aliases, { content: 'body', passage_id: 'passage_reference' });
  if (path === '/study-sessions') aliases.plan_id = 'study_plan_id';
  if (path === '/ai/ask') aliases.question = 'message';
  if (path === '/accessibility-settings') Object.assign(aliases, { reduced_motion: 'reduce_motion', text_size: 'font_size' });
  const data = { ...req.body };
  for (const [alias, target] of Object.entries(aliases)) {
    if (!Object.hasOwn(data, alias)) continue;
    if (Object.hasOwn(data, target)) throw new ApiError(400, 'VALIDATION_ERROR', `Supply only ${target} or ${alias}, not both`);
    let value = data[alias];
    if (alias === 'passage_id' && value !== null) value = parse(id, value);
    if (alias === 'text_size' && typeof value === 'string') {
      if (!Object.hasOwn(textSizes, value)) throw new ApiError(400, 'VALIDATION_ERROR', 'Invalid text_size');
      value = textSizes[value];
    }
    data[target] = value;
    delete data[alias];
  }
  if (legacyRegistration && !Object.hasOwn(data, 'preferred_language')) data.preferred_language = 'en';
  if (path.startsWith('/ai/')) {
    for (const [alias, target] of [['language_code', 'language'], ['reading_level', 'reading_level'], ['study_goal', 'study_goal']]) {
      if (!Object.hasOwn(data, alias)) continue;
      const context = data.context === undefined ? {} : data.context;
      if (!context || typeof context !== 'object' || Array.isArray(context)) {
        throw new ApiError(400, 'VALIDATION_ERROR', 'AI context must be an object');
      }
      if (Object.hasOwn(context, target)) throw new ApiError(400, 'VALIDATION_ERROR', `Supply only context.${target} or ${alias}, not both`);
      data.context = { ...context, [target]: data[alias] };
      delete data[alias];
    }
  }
  req.body = data;
  next();
}
module.exports = { inputAliases, textSizes };
