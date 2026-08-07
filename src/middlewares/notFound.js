'use strict';

const ApiError = require('../utils/ApiError');

/**
 * Hicbir route eslesmezse calisir; 404'u error handler'a devreder.
 */
const notFound = (req, res, next) => {
  next(ApiError.notFound(`Route bulunamadi: ${req.method} ${req.originalUrl}`));
};

module.exports = notFound;
