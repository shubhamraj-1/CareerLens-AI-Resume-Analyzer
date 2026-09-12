/** Thrown for client-visible failures (Express handlers map to JSON + status). */
export class ClientError extends Error {
  readonly statusCode: number;
  readonly code?: string;

  constructor(message: string, statusCode = 422, code?: string) {
    super(message);
    this.name = "ClientError";
    this.statusCode = statusCode;
    this.code = code;
  }
}
