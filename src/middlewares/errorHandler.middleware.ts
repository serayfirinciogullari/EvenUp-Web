import type { ErrorRequestHandler } from 'express';

import config from '../config/env';
import logger from '../utils/logger';

interface HttpErrorLike {
  statusCode?: unknown;
  message?: unknown;
  details?: unknown;
  stack?: unknown;
}

export interface ErrorResponseBody {
  status: 'error';
  statusCode: number;
  message: string;
  details?: unknown;
  stack?: string;
}

/**
 * Merkezi hata yoneticisi. Express bir middleware'i 4 argumanli oldugu icin
 * error handler olarak taniyor, bu yuzden `next` kullanilmasa da imzada durmali.
 */
const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  const error: HttpErrorLike = typeof err === 'object' && err !== null ? err : {};

  const statusCode =
    typeof error.statusCode === 'number' && error.statusCode >= 400 ? error.statusCode : 500;
  const rawMessage = typeof error.message === 'string' ? error.message : 'Internal Server Error';
  const message = statusCode === 500 && config.isProduction ? 'Internal Server Error' : rawMessage;

  if (statusCode >= 500) {
    logger.error(`${req.method} ${req.originalUrl} ->`, err);
  } else {
    logger.warn(`${req.method} ${req.originalUrl} -> ${statusCode} ${rawMessage}`);
  }

  const body: ErrorResponseBody = {
    status: 'error',
    statusCode,
    message,
  };

  if (error.details) {
    body.details = error.details;
  }

  if (!config.isProduction && typeof error.stack === 'string') {
    body.stack = error.stack;
  }

  res.status(statusCode).json(body);
};

export default errorHandler;
