export interface ApiErrorOptions {
  details?: unknown;
  isOperational?: boolean;
}

/**
 * Uygulama genelinde kullanilan HTTP hata sinifi.
 * Error handler middleware bu sinifin ornekleri icin statusCode/message alanlarini kullanir.
 */
class ApiError extends Error {
  public readonly statusCode: number;

  public readonly details: unknown;

  public readonly isOperational: boolean;

  constructor(statusCode: number, message: string, options: ApiErrorOptions = {}) {
    super(message);
    const { details = null, isOperational = true } = options;

    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.details = details;
    this.isOperational = isOperational;
    Error.captureStackTrace(this, this.constructor);
  }

  static badRequest(message = 'Bad Request', details: unknown = null): ApiError {
    return new ApiError(400, message, { details });
  }

  static unauthorized(message = 'Unauthorized', details: unknown = null): ApiError {
    return new ApiError(401, message, { details });
  }

  static forbidden(message = 'Forbidden', details: unknown = null): ApiError {
    return new ApiError(403, message, { details });
  }

  static notFound(message = 'Not Found', details: unknown = null): ApiError {
    return new ApiError(404, message, { details });
  }

  static conflict(message = 'Conflict', details: unknown = null): ApiError {
    return new ApiError(409, message, { details });
  }

  static internal(message = 'Internal Server Error', details: unknown = null): ApiError {
    return new ApiError(500, message, { details, isOperational: false });
  }
}

export default ApiError;
