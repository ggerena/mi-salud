import { readFileSync } from 'node:fs';
import { z } from 'zod';
import { ConfigError } from '../shared/errors.ts';

export { ConfigError };

const HEX_32_BYTES = /^[0-9a-f]{64}$/;

function isUnsafeKey(hex: string): boolean {
  const bytes = Buffer.from(hex, 'hex');
  const first = bytes[0];
  if (first === undefined) {
    return true;
  }
  return bytes.every((b) => b === first);
}

function readMasterKey(source: { env?: string | undefined; file?: string | undefined }): string {
  const { env, file } = source;
  if (env !== undefined && env.trim() !== '' && file !== undefined && file.trim() !== '') {
    throw new ConfigError(
      'config_invalid',
      'Defina MISALUD_MASTER_KEY o MISALUD_MASTER_KEY_FILE, no ambos.',
    );
  }
  if (file !== undefined && file.trim() !== '') {
    let contents: string;
    try {
      contents = readFileSync(file, 'utf8');
    } catch {
      throw new ConfigError('config_invalid', 'No se pudo leer MISALUD_MASTER_KEY_FILE.');
    }
    return contents.trim().toLowerCase();
  }
  return (env ?? '').trim().toLowerCase();
}

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1).max(65535).default(8080),
  MISALUD_DATA_DIR: z.string().min(1).default('./data'),
  MISALUD_OBJECTS_DIR: z.string().min(1).default('./objects'),
  MISALUD_MAX_BODY_BYTES: z.coerce.number().int().min(1024).max(104_857_600).default(10_485_760),
  MISALUD_LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});

export interface Config {
  nodeEnv: 'development' | 'test' | 'production';
  host: string;
  port: number;
  dataDir: string;
  objectsDir: string;
  maxBodyBytes: number;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  masterKey: Buffer;
}

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || 'env'}: ${issue.message}`)
      .join('; ');
    throw new ConfigError('config_invalid', `Configuracion invalida: ${detail}`);
  }

  const { MISALUD_MASTER_KEY, MISALUD_MASTER_KEY_FILE } = env;
  const masterKeyHex = readMasterKey({
    env: MISALUD_MASTER_KEY,
    file: MISALUD_MASTER_KEY_FILE,
  });

  if (masterKeyHex === '') {
    throw new ConfigError(
      'config_invalid',
      'Falta MISALUD_MASTER_KEY (32 bytes en hex) o MISALUD_MASTER_KEY_FILE. El proceso no arranca sin clave maestra.',
    );
  }
  if (!HEX_32_BYTES.test(masterKeyHex)) {
    throw new ConfigError(
      'config_invalid',
      'MISALUD_MASTER_KEY debe ser exactamente 64 caracteres hexadecimales (32 bytes).',
    );
  }
  if (isUnsafeKey(masterKeyHex)) {
    throw new ConfigError(
      'config_invalid',
      'MISALUD_MASTER_KEY es insegura (todos los bytes iguales). Genere una clave aleatoria de 32 bytes.',
    );
  }

  const masterKey = Buffer.from(masterKeyHex, 'hex');
  return {
    nodeEnv: parsed.data.NODE_ENV,
    host: parsed.data.HOST,
    port: parsed.data.PORT,
    dataDir: parsed.data.MISALUD_DATA_DIR,
    objectsDir: parsed.data.MISALUD_OBJECTS_DIR,
    maxBodyBytes: parsed.data.MISALUD_MAX_BODY_BYTES,
    logLevel: parsed.data.MISALUD_LOG_LEVEL,
    masterKey,
  };
}
