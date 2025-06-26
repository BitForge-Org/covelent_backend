/**
 * Represents a standard API response structure.
 *
 * @class
 * @param {number} statusCode - The HTTP status code of the response.
 * @param {*} data - The data payload of the response.
 * @param {string} [message="Success"] - A message describing the response.
 * @property {number} statusCode - The HTTP status code.
 * @property {*} data - The data payload.
 * @property {string} message - The response message.
 * @property {boolean} success - Indicates if the response is successful (statusCode < 400).
 */
class ApiResponse {
  constructor(statusCode, data, message = "Success") {
    this.statusCode = statusCode;
    this.data = data;
    this.message = message;
    this.success = statusCode < 400;
  }
}

export { ApiResponse };
