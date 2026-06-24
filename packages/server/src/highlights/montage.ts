import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { config } from '../config.js';

/** A single cut, expressed as offsets (ms) into the source recording. */
export interface MontageCut {
  inMs: number;
  outMs: number;
}

/** A cut bound to a specific source file (offsets are within that file). */
export interface RenderCut {
  input: string;
  inMs: number;
  outMs: number;
}

const isWindows = process.platform === 'win32';
const FFMPEG_BIN = isWindows ? 'ffmpeg.exe' : 'ffmpeg';
const FFPROBE_BIN = isWindows ? 'ffprobe.exe' : 'ffprobe';

/** Resolved binary paths (null = not found). Re-resolvable via refreshFfmpeg(). */
let resolvedFfmpeg: string | null = null;
let resolvedFfprobe: string | null = null;
let resolved = false;

/** Whether a candidate path/command actually runs `-version` successfully. */
function works(cmd: string): boolean {
  try {
    return spawnSync(cmd, ['-version'], { stdio: 'ignore' }).status === 0;
  } catch {
    return false;
  }
}

/** Candidate ffmpeg locations beyond PATH (handles winget/common installs). */
function candidateDirs(): string[] {
  const dirs: string[] = [];
  if (isWindows) {
    const local = process.env.LOCALAPPDATA;
    const programFiles = process.env.ProgramFiles ?? 'C:\\Program Files';
    if (local) {
      // winget shim dir and the actual package install dirs.
      dirs.push(path.join(local, 'Microsoft', 'WinGet', 'Links'));
      const pkgRoot = path.join(local, 'Microsoft', 'WinGet', 'Packages');
      try {
        for (const entry of fs.readdirSync(pkgRoot)) {
          if (!/ffmpeg/i.test(entry)) continue;
          const pkgDir = path.join(pkgRoot, entry);
          // ffmpeg lives in <pkg>/<extracted>/bin — scan one level down.
          try {
            for (const sub of fs.readdirSync(pkgDir)) {
              dirs.push(path.join(pkgDir, sub, 'bin'));
              dirs.push(path.join(pkgDir, sub));
            }
          } catch {
            // ignore unreadable package dir
          }
          dirs.push(pkgDir);
        }
      } catch {
        // no winget packages dir
      }
    }
    dirs.push(path.join(programFiles, 'ffmpeg', 'bin'));
    dirs.push('C:\\ffmpeg\\bin');
  } else {
    dirs.push('/usr/bin', '/usr/local/bin', '/opt/homebrew/bin', '/snap/bin');
    dirs.push(path.join(os.homedir(), '.local', 'bin'));
  }
  return dirs;
}

/** Find ffmpeg + ffprobe: explicit config > PATH > common install dirs. */
function resolve(): void {
  resolved = true;
  resolvedFfmpeg = null;
  resolvedFfprobe = null;

  // 1. Explicit configured path (file or directory).
  const explicit = config.ffmpegPath.trim();
  if (explicit) {
    const asFile = explicit;
    const asDir = path.join(explicit, FFMPEG_BIN);
    const cand = fs.existsSync(asFile) && fs.statSync(asFile).isFile() ? asFile : asDir;
    if (works(cand)) {
      resolvedFfmpeg = cand;
      const probe = path.join(path.dirname(cand), FFPROBE_BIN);
      resolvedFfprobe = fs.existsSync(probe) ? probe : FFPROBE_BIN;
      return;
    }
  }

  // 2. On PATH.
  if (works(FFMPEG_BIN)) {
    resolvedFfmpeg = FFMPEG_BIN;
    resolvedFfprobe = FFPROBE_BIN;
    return;
  }

  // 3. Common install locations.
  for (const dir of candidateDirs()) {
    const cand = path.join(dir, FFMPEG_BIN);
    if (works(cand)) {
      resolvedFfmpeg = cand;
      const probe = path.join(dir, FFPROBE_BIN);
      resolvedFfprobe = fs.existsSync(probe) ? probe : FFPROBE_BIN;
      return;
    }
  }
}

function ffmpegBin(): string | null {
  if (!resolved) resolve();
  return resolvedFfmpeg;
}

function ffprobeBin(): string {
  if (!resolved) resolve();
  return resolvedFfprobe ?? FFPROBE_BIN;
}

export function ffmpegAvailable(): boolean {
  return ffmpegBin() != null;
}

/** Re-run detection (e.g. after the user installs ffmpeg). Returns new state. */
export function refreshFfmpeg(): boolean {
  resolve();
  return resolvedFfmpeg != null;
}

/** Whether the source file has at least one audio stream. */
function hasAudioStream(input: string): boolean {
  const probe = spawnSync(
    ffprobeBin(),
    [
      '-v',
      'error',
      '-select_streams',
      'a',
      '-show_entries',
      'stream=index',
      '-of',
      'csv=p=0',
      input,
    ],
    { encoding: 'utf8' },
  );
  return probe.status === 0 && probe.stdout.trim().length > 0;
}

function ms(n: number): number {
  return Math.max(0, n) / 1000;
}

/**
 * Render a montage by trimming the given cuts out of one or more source files
 * and concatenating them. A single `filter_complex` graph keeps it frame-accurate
 * and handles audio in one pass (no intermediate files), re-encoding so the
 * concat is always valid. Cuts may reference different files (e.g. recording
 * segments after a mid-session file split).
 */
export function renderMontage(cuts: RenderCut[], output: string): Promise<void> {
  const bin = ffmpegBin();
  if (!bin) {
    return Promise.reject(
      new Error('ffmpeg is not installed on the host — install it to render montages'),
    );
  }
  const valid = cuts.filter((c) => c.outMs > c.inMs && c.input);
  if (valid.length === 0) {
    return Promise.reject(new Error('No clips to render'));
  }

  // Dedupe source files into ffmpeg `-i` inputs.
  const inputs: string[] = [];
  const inputIndex = new Map<string, number>();
  for (const c of valid) {
    if (!fs.existsSync(c.input)) {
      return Promise.reject(new Error(`Recording file not found: ${c.input}`));
    }
    if (!inputIndex.has(c.input)) {
      inputIndex.set(c.input, inputs.length);
      inputs.push(c.input);
    }
  }

  // Audio only if every source has it (concat needs matching stream counts).
  const withAudio = inputs.every((f) => hasAudioStream(f));
  const parts: string[] = [];
  const concatInputs: string[] = [];
  valid.forEach((c, i) => {
    const idx = inputIndex.get(c.input) ?? 0;
    const start = ms(c.inMs);
    const end = ms(c.outMs);
    parts.push(`[${idx}:v]trim=start=${start}:end=${end},setpts=PTS-STARTPTS[v${i}]`);
    concatInputs.push(`[v${i}]`);
    if (withAudio) {
      parts.push(
        `[${idx}:a]atrim=start=${start}:end=${end},asetpts=PTS-STARTPTS[a${i}]`,
      );
      concatInputs.push(`[a${i}]`);
    }
  });

  const n = valid.length;
  const concat = withAudio
    ? `${concatInputs.join('')}concat=n=${n}:v=1:a=1[v][a]`
    : `${concatInputs.join('')}concat=n=${n}:v=1:a=0[v]`;
  const filter = `${parts.join(';')};${concat}`;

  const args = [
    '-y',
    ...inputs.flatMap((f) => ['-i', f]),
    '-filter_complex',
    filter,
    '-map',
    '[v]',
    ...(withAudio ? ['-map', '[a]'] : []),
    '-c:v',
    'libx264',
    '-preset',
    'veryfast',
    '-crf',
    '20',
    ...(withAudio ? ['-c:a', 'aac', '-b:a', '160k'] : []),
    '-movflags',
    '+faststart',
    output,
  ];

  return new Promise<void>((resolve, reject) => {
    const proc = spawn(bin, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    proc.stderr.on('data', (d: Buffer) => {
      stderr = (stderr + d.toString()).slice(-4000);
    });
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited ${code}: ${stderr.trim()}`));
    });
  });
}
