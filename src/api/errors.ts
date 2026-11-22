export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: Record<string, string[]>,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export class ApiTransportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ApiTransportError';
  }
}
