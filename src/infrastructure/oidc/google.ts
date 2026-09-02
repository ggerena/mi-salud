import * as client from 'openid-client';
import { AuthFlowError, type ExternalIdentity } from '../../domain/identity.ts';
import type { OidcProvider, OidcStart } from './port.ts';

export class GoogleOidcProvider implements OidcProvider {
  constructor(
    private readonly config: client.Configuration,
    private readonly redirectUri: string,
  ) {}

  static async discover(input: {
    issuer: string;
    clientId: string;
    clientSecret: string;
  }): Promise<client.Configuration> {
    return client.discovery(new URL(input.issuer), input.clientId, input.clientSecret);
  }

  async authorizationUrl(start: OidcStart): Promise<URL> {
    const challenge = await client.calculatePKCECodeChallenge(start.codeVerifier);
    return client.buildAuthorizationUrl(this.config, {
      redirect_uri: this.redirectUri,
      scope: 'openid email',
      code_challenge: challenge,
      code_challenge_method: 'S256',
      state: start.state,
      nonce: start.nonce,
    });
  }

  async exchangeAuthorizationCode(input: {
    currentUrl: URL;
    expectedState: string;
    expectedNonce: string;
    codeVerifier: string;
  }): Promise<ExternalIdentity> {
    try {
      const tokens = await client.authorizationCodeGrant(this.config, input.currentUrl, {
        pkceCodeVerifier: input.codeVerifier,
        expectedState: input.expectedState,
        expectedNonce: input.expectedNonce,
        idTokenExpected: true,
      });
      const claims = tokens.claims();
      if (claims === undefined) {
        throw new AuthFlowError('El ID token no trajo claims.');
      }
      const { iss, sub, email: emailClaim } = claims;
      if (typeof iss !== 'string' || typeof sub !== 'string') {
        throw new AuthFlowError('iss o sub ausentes.');
      }
      const email = typeof emailClaim === 'string' ? emailClaim : null;
      return { iss, sub, email };
    } catch (err) {
      if (err instanceof AuthFlowError) {
        throw err;
      }
      throw new AuthFlowError('Callback OIDC rechazado.');
    }
  }
}
