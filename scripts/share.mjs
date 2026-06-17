#!/usr/bin/env node
/**
 * `npm run share` — expose the local StreamForge server to remote operators
 * over a Cloudflare quick tunnel.
 *
 * It builds the app, starts the server bound to all interfaces, and runs
 * `cloudflared tunnel` against it, then prints the public HTTPS URL to share
 * with the team. Both processes are torn down together on Ctrl+C.
 *
 * Safety: refuses to open a public tunnel unless STREAMFORGE_TEAM_PASSWORD is
 * set, so the production never ends up reachable on the internet without auth.
 */
import { spawn, spawnSync } from 'node:child_process';
import process from 'node:process';

const PORT = process.env.PORT ?? '4500';
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const CYAN = '\x1b[36m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';

function fail(msg) {
  console.error(`\n${RED}${BOLD}✗ ${msg}${RESET}\n`);
  process.exit(1);
}

function installHint() {
  const hints = {
    darwin: 'brew install cloudflared',
    win32: 'winget install --id Cloudflare.cloudflared',
    linux:
      'Download from https://github.com/cloudflare/cloudflared/releases (or use your package manager)',
  };
  return hints[process.platform] ?? hints.linux;
}

// 1. Require a team password before exposing anything publicly.
if (!process.env.STREAMFORGE_TEAM_PASSWORD?.trim()) {
  fail(
    'STREAMFORGE_TEAM_PASSWORD is not set.\n' +
      "  A public tunnel would let anyone reach your production, so it's required here.\n" +
      '  Set one and retry, e.g.:\n' +
      `    ${CYAN}STREAMFORGE_TEAM_PASSWORD=your-team-password npm run share${RESET}`,
  );
}

// 2. Make sure cloudflared is installed.
const hasCloudflared =
  spawnSync('cloudflared', ['--version'], { stdio: 'ignore' }).status === 0;
if (!hasCloudflared) {
  fail(
    'cloudflared is not installed (it creates the public tunnel).\n' +
      `  Install it with:\n    ${CYAN}${installHint()}${RESET}\n` +
      '  Then re-run this command.',
  );
}

const children = [];
let shuttingDown = false;

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    if (!child.killed) child.kill('SIGTERM');
  }
  process.exit(code);
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

function run(command, args, opts = {}) {
  const child = spawn(command, args, { shell: process.platform === 'win32', ...opts });
  children.push(child);
  child.on('exit', (code) => {
    if (!shuttingDown) {
      console.error(`\n${RED}${command} exited (${code}); shutting down.${RESET}`);
      shutdown(code ?? 1);
    }
  });
  return child;
}

console.log(`\n${BOLD}StreamForge · share${RESET}`);
console.log(`${YELLOW}Building and starting the server on port ${PORT}…${RESET}\n`);

// 3. Build + start the server bound to all interfaces so the tunnel can reach it.
run('npm', ['start'], {
  stdio: 'inherit',
  env: { ...process.env, HOST: '0.0.0.0', PORT },
});

// 4. Start the Cloudflare quick tunnel and surface the public URL.
const tunnel = run('cloudflared', ['tunnel', '--url', `http://localhost:${PORT}`], {
  stdio: ['ignore', 'pipe', 'pipe'],
});

let announced = false;
const urlRe = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/i;

function watch(stream) {
  stream.setEncoding('utf8');
  stream.on('data', (chunk) => {
    process.stderr.write(chunk);
    const match = !announced && chunk.match(urlRe);
    if (match) {
      announced = true;
      const url = match[0];
      console.log(
        `\n${BOLD}${CYAN}┌─────────────────────────────────────────────────────────────┐${RESET}`,
      );
      console.log(`${BOLD}${CYAN}│  Share this URL with your team:${RESET}`);
      console.log(`${BOLD}${CYAN}│  ${url}${RESET}`);
      console.log(
        `${BOLD}${CYAN}│  They sign in with the team password + a display name.${RESET}`,
      );
      console.log(
        `${BOLD}${CYAN}└─────────────────────────────────────────────────────────────┘${RESET}\n`,
      );
    }
  });
}

watch(tunnel.stdout);
watch(tunnel.stderr);
