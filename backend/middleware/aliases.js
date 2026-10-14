const { ApiError } = require('./errors');
const { parse, id } = require('./validation');
const textSizes = { small: 12, medium: 16, large: 20, extra_large: 24 };
function inputAliases(req, res, next) {
  if (!['POST', 'PATCH'].includes(req.method) || !req.body || typeof req.body !== 'object' || Array.isArray(req.body)) return next();
  const path = req.path.replace(/\/$/, '');
  const aliases = {};
  if (path === '/auth/register') Object.assign(aliases, { full_name: 'display_name', preferred_language: 'language_code' });
  if (/^\/questions\/[^/]+\/answers$/.test(path) || /^\/answers\/[^/]+$/.test(path)) aliases.response_text = 'body';
  if (/^\/journals(?:\/[^/]+)?$/.test(path)) Object.assign(aliases, { content: 'body', passage_id: 'passage_reference' });
  if (path === '/study-sessions') aliases.study_plan_id = 'plan_id';
  if (path === '/ai/ask') aliases.message = 'question';
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
  req.body = data;
  next();
}
module.exports = { inputAliases, textSizes };
