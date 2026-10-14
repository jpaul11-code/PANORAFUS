const { z } = require('zod');
const { ApiError } = require('./errors');
const id = z.uuid();
const text = (max = 10000) => z.string().trim().min(1).max(max);
const language = z.string().min(2).max(35).refine(value => {
  try { return Intl.getCanonicalLocales(value).length === 1; } catch { return false; }
}, 'Invalid BCP 47 language tag').transform(value => Intl.getCanonicalLocales(value)[0]);
const pagination = {
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).max(1000000).default(0)
};
function parse(schema, value) {
  const result = schema.safeParse(value);
  if (!result.success) throw new ApiError(400, 'VALIDATION_ERROR', 'Invalid request', result.error.issues.map(i => ({
    path: i.path.join('.'), message: i.message
  })));
  return result.data;
}
const body = shape => z.object(shape).strict();
const query = shape => body({ ...pagination, ...shape });
function patch(schema) {
  return schema.partial().refine(value => Object.keys(value).length > 0, 'At least one field is required');
}
module.exports = { z, id, text, language, pagination, parse, body, query, patch };
