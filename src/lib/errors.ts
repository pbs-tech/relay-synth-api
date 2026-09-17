export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code?: string,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export const badRequest = (message: string) => new HttpError(400, message, 'BAD_REQUEST');
export const unauthorized = (message = 'Unauthorized') =>
  new HttpError(401, message, 'UNAUTHORIZED');
export const notFound = (message = 'Not found') => new HttpError(404, message, 'NOT_FOUND');
