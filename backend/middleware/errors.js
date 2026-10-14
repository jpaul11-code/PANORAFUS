const { randomUUID } = require('node:crypto');

class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    Object.assign(this, { status, code, details });
  }
}
const missing = () => new ApiError(404, 'NOT_FOUND', 'Resource not found');
const forbidden = () => new ApiError(403, 'FORBIDDEN', 'Permission denied');
function requestId(req, res, next) {
  req.request_id = randomUUID();
  res.setHeader('X-Request-Id', req.request_id);
  next();
}
function errors(err, req, res, next) {
  if (res.headersSent) return next(err);
  if (err.type === 'entity.too.large') err = new ApiError(400, 'INVALID_BODY', 'Request body is too large');
  if (err instanceof SyntaxError && err.status === 400) err = new ApiError(400, 'INVALID_JSON', 'Invalid JSON body');
  if (err instanceof URIError) err = new ApiError(400, 'INVALID_PATH', 'Invalid request path');
  if (err.code === 'P2002') err = new ApiError(409, 'CONFLICT', 'Resource already exists');
  if (err.code === 'P2025') err = missing();
  if (err.code === 'P2003') err = req.method === 'DELETE'
    ? new ApiError(409, 'RESOURCE_IN_USE', 'Resource is still in use')
    : new ApiError(400, 'INVALID_REFERENCE', 'Invalid resource reference');
  if (['P1001', 'P1002', 'P1017', 'P2024'].includes(err.code)) err = new ApiError(503, 'UNAVAILABLE', 'Service temporarily unavailable');
  const safe = err instanceof ApiError;
  res.status(safe ? err.status : 500).json({ error: {
    code: safe ? err.code : 'INTERNAL_ERROR',
    message: safe ? err.message : 'An unexpected error occurred',
    request_id: req.request_id,
    ...(safe && err.details ? { details: err.details } : {})
  } });
}
module.exports = { ApiError, missing, forbidden, requestId, errors };
