/**
 * Custom error classes for ParallelTrans
 * Provides specific error types for better error handling
 */

/**
 * Base error class for ParallelTrans
 */
export class ParallelTransError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = 'ParallelTransError';
    Object.setPrototypeOf(this, ParallelTransError.prototype);
  }
}

/**
 * Translation-related errors
 */
export class TranslationError extends ParallelTransError {
  constructor(
    message: string,
    public readonly engine: string,
    details?: unknown
  ) {
    super(message, 'TRANSLATION_ERROR', details);
    this.name = 'TranslationError';
    Object.setPrototypeOf(this, TranslationError.prototype);
  }
}

/**
 * API key missing or invalid
 */
export class APIKeyError extends ParallelTransError {
  constructor(
    public readonly engine: string,
    message: string = `API key not configured for ${engine}`
  ) {
    super(message, 'API_KEY_ERROR', { engine });
    this.name = 'APIKeyError';
    Object.setPrototypeOf(this, APIKeyError.prototype);
  }
}

/**
 * Network-related errors
 */
export class NetworkError extends ParallelTransError {
  constructor(
    message: string,
    public readonly statusCode?: number,
    details?: unknown
  ) {
    super(
      message,
      'NETWORK_ERROR',
      details && typeof details === 'object' ? { statusCode, ...details } : { statusCode, details }
    );
    this.name = 'NetworkError';
    Object.setPrototypeOf(this, NetworkError.prototype);
  }
}

/**
 * Rate limit exceeded
 */
export class RateLimitError extends ParallelTransError {
  constructor(
    public readonly engine: string,
    public readonly retryAfter?: number
  ) {
    super(
      `Rate limit exceeded for ${engine}${retryAfter ? `. Retry after ${retryAfter}s` : ''}`,
      'RATE_LIMIT_ERROR',
      { engine, retryAfter }
    );
    this.name = 'RateLimitError';
    Object.setPrototypeOf(this, RateLimitError.prototype);
  }
}

/**
 * Configuration error
 */
export class ConfigurationError extends ParallelTransError {
  constructor(message: string, public readonly field: string) {
    super(message, 'CONFIGURATION_ERROR', { field });
    this.name = 'ConfigurationError';
    Object.setPrototypeOf(this, ConfigurationError.prototype);
  }
}

/**
 * Utility function to handle errors gracefully
 */
export function handleError(error: unknown, fallbackMessage: string): string {
  if (error instanceof ParallelTransError) {
    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return fallbackMessage;
}

/**
 * Check if error is a specific type
 */
export function isTranslationError(error: unknown): error is TranslationError {
  return error instanceof TranslationError;
}

export function isAPIKeyError(error: unknown): error is APIKeyError {
  return error instanceof APIKeyError;
}

export function isRateLimitError(error: unknown): error is RateLimitError {
  return error instanceof RateLimitError;
}

export function isNetworkError(error: unknown): error is NetworkError {
  return error instanceof NetworkError;
}
