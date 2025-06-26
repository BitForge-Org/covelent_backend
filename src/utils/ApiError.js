/**
 * Custom error class for API errors.
 * Extends the built-in Error class to include HTTP status codes, error details, and additional metadata.
 *
 * @class
 * @extends Error
 *
 * @param {number} statusCode - HTTP status code associated with the error.
 * @param {string} [message="Something went wrong"] - Error message.
 * @param {Array} [errors=[]] - Additional error details or validation errors.
 * @param {string} [stack=""] - Optional stack trace. If not provided, it will be captured automatically.
 *
 * @property {number} statusCode - HTTP status code.
 * @property {null} data - Placeholder for additional data (always null).
 * @property {string} message - Error message.
 * @property {boolean} success - Indicates the operation was not successful (always false).
 * @property {Array} errors - Additional error details.
 */
class ApiError extends Error {
  constructor(
    statusCode,
    message = "Something went wrong",
    errors = [],
    stack
  ) {
    super(message);
    this.statusCode = statusCode;
    this.data = null;
    this.success = false;
    this.errors = errors;

    if (stack) {
      this.stack = stack;
    } else {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

export { ApiError };
