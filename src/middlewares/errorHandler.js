'use strict';

const config = require('../config');
const logger = require('../utils/logger');

/**
 * Merkezi hata yoneticisi. Express bir middleware'i 4 argumanli oldugu icin
 * error handler olarak taniyor, bu yuzden `next` kullanilmasa da imzada durmali.
 */
/* eslint-disable-next-line no-unused-vars */
const errorHandler = (err, req, res, next) => {
  const statusCode = err.statusCode && err.statusCode >= 400 ? err.statusCode : 500;
  const message = statusCode === 500 && config.isProduction ? 'Internal Server Error' : err.message;

  if (statusCode >= 500) {
    logger.error(`${req.method} ${req.originalUrl} ->`, err);
  } else {
    logger.warn(`${req.method} ${req.originalUrl} -> ${statusCode} ${err.message}`);
  }

  const body = {
    status: 'error',
    statusCode,
    message,
  };

  if (err.details) {
    body.details = err.details;
  }

  if (!config.isProduction) {
    body.stack = err.stack;
  }

  res.status(statusCode).json(body);
};

module.exports = errorHandler;
