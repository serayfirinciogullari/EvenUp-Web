'use strict';

/**
 * Async controller'lardaki reject'leri Express error handler'a yonlendirir.
 * Kullanim: router.get('/', asyncHandler(controller.method));
 */
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = asyncHandler;
