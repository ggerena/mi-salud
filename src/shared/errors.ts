export class ConfigError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'ConfigError';
    this.code = code;
  }
}

export type ErrorCode =
  | 'config_invalid'
  | 'not_found'
  | 'bad_request'
  | 'payload_too_large'
  | 'unauthorized'
  | 'access_denied'
  | 'auth_flow_invalid'
  | 'internal_error';

type ErrorStatus = 400 | 401 | 403 | 404 | 413 | 500;

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: ErrorStatus;

  constructor(code: ErrorCode, status: ErrorStatus, message: string) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.status = status;
  }
}
