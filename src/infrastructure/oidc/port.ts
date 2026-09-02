import type { ExternalIdentity } from '../../domain/identity.ts';

export interface OidcStart {
  state: string;
  nonce: string;
  codeVerifier: string;
  redirectUri: string;
}

export interface OidcProvider {
  authorizationUrl(start: OidcStart): URL | Promise<URL>;
  exchangeAuthorizationCode(input: {
    currentUrl: URL;
    expectedState: string;
    expectedNonce: string;
    codeVerifier: string;
  }): Promise<ExternalIdentity>;
}
