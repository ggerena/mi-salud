export const CONSENT_VERSION = '2026-09-02-v1';

export interface ExternalIdentity {
  iss: string;
  sub: string;
  email: string | null;
}

export class AccessDeniedError extends Error {
  readonly code = 'access_denied';
  constructor(message = 'Esta cuenta de Google no esta autorizada para MiSalud.') {
    super(message);
    this.name = 'AccessDeniedError';
  }
}

export class AuthFlowError extends Error {
  readonly code = 'auth_flow_invalid';
  constructor(message: string) {
    super(message);
    this.name = 'AuthFlowError';
  }
}
