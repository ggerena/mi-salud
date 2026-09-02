const REDACTED = '[REDACTED]';

const SENSITIVE_KEY =
  /key|secret|token|password|passwd|authorization|cookie|credential|nonce|ciphertext|auth_tag|master/i;

export type LogRecord = Record<string, unknown>;

export function redactValue(value: unknown, depth = 0): unknown {
  if (depth > 8) {
    return REDACTED;
  }
  if (typeof value === 'string') {
    return value;
  }
  if (value === null || typeof value !== 'object') {
    return value;
  }
  if (Buffer.isBuffer(value)) {
    return REDACTED;
  }
  if (Array.isArray(value)) {
    return value.map((item) => redactValue(item, depth + 1));
  }
  const out: LogRecord = {};
  for (const [k, v] of Object.entries(value as LogRecord)) {
    out[k] = SENSITIVE_KEY.test(k) ? REDACTED : redactValue(v, depth + 1);
  }
  return out;
}

export interface Logger {
  debug(message: string, fields?: LogRecord): void;
  info(message: string, fields?: LogRecord): void;
  warn(message: string, fields?: LogRecord): void;
  error(message: string, fields?: LogRecord): void;
}

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 } as const;

export type LogLevel = keyof typeof LEVELS;

export function createLogger(
  level: LogLevel = 'info',
  sink: (line: string) => void = (line) => console.log(line),
): Logger {
  const threshold = LEVELS[level];
  const write = (lvl: LogLevel, message: string, fields?: LogRecord): void => {
    if (LEVELS[lvl] < threshold) {
      return;
    }
    const record = {
      time: new Date().toISOString(),
      level: lvl,
      message,
      ...(fields === undefined ? {} : (redactValue(fields) as LogRecord)),
    };
    sink(JSON.stringify(record));
  };
  return {
    debug: (m, f) => write('debug', m, f),
    info: (m, f) => write('info', m, f),
    warn: (m, f) => write('warn', m, f),
    error: (m, f) => write('error', m, f),
  };
}
