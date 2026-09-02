import type { Context, Hono } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import type { Config } from '../../app/config.ts';
import type { AuthService } from '../../application/auth.ts';
import { AccessDeniedError, AuthFlowError, CONSENT_VERSION } from '../../domain/identity.ts';
import { AppError } from '../../shared/errors.ts';
import { escapeHtml, page } from './html.ts';

const SESSION_COOKIE = 'misalud_session';

function cookieOpts(config: Config) {
  return {
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: 'Lax' as const,
    path: '/',
    maxAge: Math.floor(config.sessionTtlMs / 1000),
  };
}

function requireSameOrigin(originHeader: string | undefined, config: Config): void {
  if (originHeader === undefined || originHeader === '') {
    throw new AppError('auth_flow_invalid', 403, 'Falta origen en la solicitud.');
  }
  if (originHeader !== config.publicOrigin) {
    throw new AppError('auth_flow_invalid', 403, 'Origen no permitido.');
  }
}

export function mountSite(
  app: Hono,
  deps: { config: Config; auth: AuthService | undefined },
): void {
  const { config, auth } = deps;

  const sessionToken = (c: Context) => getCookie(c, SESSION_COOKIE);

  app.get('/', (c) => {
    if (auth === undefined) {
      return c.html(
        page(
          'Inicio',
          '<h1>MiSalud</h1><p>Boveda personal de salud. El acceso con Google aun no esta configurado en este proceso.</p><p><a href="/health">health</a></p>',
        ),
      );
    }
    const session = auth.readSession(sessionToken(c));
    if (session === null) {
      return c.html(
        page(
          'Inicio',
          '<h1>MiSalud</h1><p>Boveda personal de salud autoalojada. El acceso es solo con Google.</p><p><a href="/login">Entrar con Google</a></p>',
        ),
      );
    }
    return c.redirect('/cuenta');
  });

  app.get('/login', async (c) => {
    if (auth === undefined) {
      throw new AppError('config_invalid', 500, 'OIDC no configurado.');
    }
    const { authorizationUrl } = await auth.startLogin();
    return c.redirect(authorizationUrl.toString());
  });

  app.get('/oidc/callback', async (c) => {
    if (auth === undefined) {
      throw new AppError('config_invalid', 500, 'OIDC no configurado.');
    }
    try {
      const { token, isNew } = await auth.completeLogin(new URL(c.req.url));
      setCookie(c, SESSION_COOKIE, token, cookieOpts(config));
      return c.redirect(isNew ? '/consentimiento' : '/cuenta');
    } catch (err) {
      if (err instanceof AccessDeniedError) {
        throw new AppError('access_denied', 403, err.message);
      }
      if (err instanceof AuthFlowError) {
        throw new AppError('auth_flow_invalid', 400, err.message);
      }
      throw err;
    }
  });

  app.get('/consentimiento', (c) => {
    if (auth === undefined) {
      throw new AppError('config_invalid', 500, 'OIDC no configurado.');
    }
    try {
      auth.accountPage(sessionToken(c));
    } catch (err) {
      if (err instanceof AuthFlowError) {
        throw new AppError('unauthorized', 401, err.message);
      }
      throw err;
    }
    return c.html(
      page(
        'Consentimiento',
        '<h1>Crear boveda</h1>' +
          `<p>Version de consentimiento: ${escapeHtml(CONSENT_VERSION)}. MiSalud guarda tus documentos y datos de salud solo en este equipo, cifrados. No envia contenido clinico a Google ni a otros servicios.</p>` +
          '<p>Esto no es un diagnostico ni sustituye a un profesional de salud.</p>' +
          '<form method="post" action="/consentimiento"><button type="submit">Acepto y creo mi boveda</button></form>',
      ),
    );
  });

  app.post('/consentimiento', async (c) => {
    if (auth === undefined) {
      throw new AppError('config_invalid', 500, 'OIDC no configurado.');
    }
    requireSameOrigin(c.req.header('origin'), config);
    try {
      auth.acceptConsent(sessionToken(c));
      return c.redirect('/cuenta');
    } catch (err) {
      if (err instanceof AuthFlowError) {
        throw new AppError('unauthorized', 401, err.message);
      }
      throw err;
    }
  });

  app.get('/cuenta', (c) => {
    if (auth === undefined) {
      throw new AppError('config_invalid', 500, 'OIDC no configurado.');
    }
    try {
      const view = auth.accountPage(sessionToken(c));
      const vault = view.vaultId === null ? 'sin boveda' : view.vaultId;
      const consent = view.consentVersion ?? 'no aceptado';
      return c.html(
        page(
          'Cuenta',
          '<h1>Tu cuenta</h1>' +
            `<p>Identidad: ${escapeHtml(view.account.iss)} / ${escapeHtml(view.account.sub)}</p>` +
            `<p>Correo visible: ${escapeHtml(view.account.emailDisplay ?? 'no informado')}</p>` +
            `<p>Consentimiento: ${escapeHtml(consent)}</p>` +
            `<p>Boveda: ${escapeHtml(vault)}</p>` +
            `<p>Sesion actual: ${escapeHtml(view.sessionId)}</p>` +
            (view.vaultId === null
              ? '<p><a href="/consentimiento">Crear boveda</a></p>'
              : '<p>Resumen: no hay datos clinicos todavia. Nada aqui es un diagnostico.</p>') +
            '<form method="post" action="/logout"><button type="submit">Cerrar sesion</button></form>',
        ),
      );
    } catch (err) {
      if (err instanceof AuthFlowError) {
        throw new AppError('unauthorized', 401, err.message);
      }
      throw err;
    }
  });

  app.post('/logout', (c) => {
    if (auth === undefined) {
      return c.redirect('/');
    }
    requireSameOrigin(c.req.header('origin'), config);
    auth.logout(sessionToken(c));
    deleteCookie(c, SESSION_COOKIE, { path: '/' });
    return c.redirect('/');
  });
}
