import { spawnSync } from 'node:child_process';

const command = process.argv[2];
const isWin = process.platform === 'win32';

function fail(tool, hint) {
  console.error(`check "${command}" no disponible: falta ${tool}. ${hint}`);
  process.exit(1);
}

function resolveBin(name) {
  if (!isWin) {
    return name;
  }
  if (name === 'npm' || name === 'npx') {
    return `${name}.cmd`;
  }
  return name;
}

function run(bin, args, opts = {}) {
  const useShell = isWin && (bin === 'npm' || bin === 'npx');
  const res = spawnSync(resolveBin(bin), args, {
    stdio: 'inherit',
    shell: useShell,
    ...opts,
  });
  if (res.error) {
    console.error(res.error.message);
    process.exit(1);
  }
  process.exit(res.status ?? 1);
}

switch (command) {
  case 'licenses': {
    const allow = 'MIT;Apache-2.0;BSD-2-Clause;BSD-3-Clause;ISC;0BSD;CC0-1.0;Unlicense;Python-2.0';
    run('npx', [
      '-y',
      '-p',
      'license-checker@25.0.1',
      'license-checker',
      '--production',
      '--onlyAllow',
      allow,
    ]);
    break;
  }
  case 'secrets': {
    const probe = spawnSync('gitleaks', ['version'], { stdio: 'ignore', shell: false });
    if (probe.error || probe.status !== 0) {
      fail('gitleaks', 'Instale gitleaks o confie en el job de Gitleaks de CI, que si escanea.');
    }
    run('gitleaks', ['detect', '--redact', '--exit-code', '1']);
    break;
  }
  case 'security': {
    run('npm', ['audit', '--omit=dev', '--audit-level=high']);
    break;
  }
  case 'sbom': {
    run('npx', [
      '-y',
      '@cyclonedx/cyclonedx-npm@4.1.2',
      '--output-file',
      'sbom.json',
      '--omit',
      'dev',
    ]);
    break;
  }
  default:
    console.error('Uso: node scripts/checks.mjs <licenses|secrets|security|sbom>');
    process.exit(1);
}
