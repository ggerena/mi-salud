import { describe, expect, it } from 'vitest';
import { createLogger, redactValue } from '../../src/app/logger.ts';

describe('redactValue', () => {
  it('redacta claves sensibles anidadas', () => {
    const out = redactValue({
      user: 'persona-ejemplo',
      meta: { api_key: 'abc', Authorization: 'Bearer xyz', host: '127.0.0.1' },
    }) as {
      user: unknown;
      meta: { api_key: unknown; Authorization: unknown; host: unknown };
    };
    expect(out.meta.api_key).toBe('[REDACTED]');
    expect(out.meta.Authorization).toBe('[REDACTED]');
    expect(out.meta.host).toBe('127.0.0.1');
  });

  it('redacta buffers y profundidades excesivas', () => {
    expect(redactValue(Buffer.from('secreto'))).toBe('[REDACTED]');
    let deep: unknown = { v: 'ok' };
    for (let i = 0; i < 12; i++) {
      deep = { nested: deep };
    }
    expect(JSON.stringify(redactValue(deep))).toContain('[REDACTED]');
  });

  it('no deja material de claves en la salida del logger', () => {
    const lines: string[] = [];
    const logger = createLogger('info', (line) => lines.push(line));
    logger.info('evento', {
      master_key: 'aa'.repeat(32),
      token: 's3cr3t-valor',
      path: '/health',
    });
    expect(lines).toHaveLength(1);
    const line = lines[0] ?? '';
    expect(line).not.toContain('a'.repeat(32));
    expect(line).not.toContain('s3cr3t-valor');
    expect((JSON.parse(line) as { level: string }).level).toBe('info');
  });
});
