import type { RequestHandler } from 'express';

import ApiError from '../utils/ApiError';

/**
 * Hicbir route eslesmezse calisir; 404'u error handler'a devreder.
 */
const notFound: RequestHandler = (req, res, next) => {
  next(ApiError.notFound(`Route bulunamadi: ${req.method} ${req.originalUrl}`));
};

export default notFound;
