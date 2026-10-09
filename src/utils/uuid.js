const UUID_PATTERN = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;

exports.isUuid = (value) =>
  typeof value === 'string' && UUID_PATTERN.test(value);

exports.requireUuid = (value, fieldName) => {
  if (!exports.isUuid(value)) {
    const HttpError = require('./http-error');
    throw new HttpError(400, fieldName + ' must be a valid UUID');
  }
};
