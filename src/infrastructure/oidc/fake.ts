import { AuthFlowError, type ExternalIdentity } from '../../domain/identity.ts';
import type { OidcProvider, OidcStart } from './port.ts';

/** Proveedor OIDC local para pruebas. No habla con Google. */
export class FakeOidcProvider implements OidcProvider {
  constructor(
    private readonly identity: ExternalIdentity,
    private readonly expectedRedirectUri: string,
  ) {}

  authorizationUrl(start: OidcStart): URL {
    const url = new URL(start.redirectUri);
    url.searchParams.set('code', 'synthetic-code');
    url.searchParams.set('state', start.state);
    return url;
  }

  exchangeAuthorizationCode(input: {
    currentUrl: URL;
    expectedState: string;
    expectedNonce: string;
    codeVerifier: string;
  }): Promise<ExternalIdentity> {
    const state = input.currentUrl.searchParams.get('state');
    const code = input.currentUrl.searchParams.get('code');
    if (state !== input.expectedState) {
      return Promise.reject(new AuthFlowError('state OIDC invalido.'));
    }
    if (code !== 'synthetic-code') {
      return Promise.reject(new AuthFlowError('code OIDC invalido.'));
    }
    if (input.expectedNonce.length < 8 || input.codeVerifier.length < 8) {
      return Promise.reject(new AuthFlowError('nonce o PKCE incompletos.'));
    }
    if (!input.currentUrl.toString().startsWith(this.expectedRedirectUri)) {
      return Promise.reject(new AuthFlowError('redirect_uri OIDC invalido.'));
    }
    return Promise.resolve(this.identity);
  }
}
