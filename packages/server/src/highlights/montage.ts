import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';

/** A single cut, expressed as offsets (ms) into the source recording. */
export interface MontageCut {
  inMs: number;
  outMs: number;
}

/** Cached ffmpeg/ffprobe availability lookup (resolved once per process). */
let ffmpegAvailableCache: boolean | null = null;

export function ffmpegAvailable(): boolean {
  if (ffmpegAvailableCache != null) return ffmpegAvailableCache;
  const ok = spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' });
  ffmpegAvailableCache = ok.status === 0;
  return ffmpegAvailableCache;
}

/** Whether the source file has at least one audio stream. */
function hasAudioStream(input: string): boolean {
  const probe = spawnSync(
    'ffprobe',
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
 * Render a montage by trimming the given cuts out of a single source recording
 * and concatenating them, with a small crossfade-free hard cut between each. A
 * single `filter_complex` graph keeps it frame-accurate and handles audio in one
 * pass (no intermediate files), re-encoding so the concat is always valid.
 */
export function renderMontage(
  input: string,
  cuts: MontageCut[],
  output: string,
): Promise<void> {
  if (!ffmpegAvailable()) {
    return Promise.reject(
      new Error('ffmpeg is not installed on the host — install it to render montages'),
    );
  }
  if (!fs.existsSync(input)) {
    return Promise.reject(new Error(`Recording file not found: ${input}`));
  }
  const valid = cuts.filter((c) => c.outMs > c.inMs);
  if (valid.length === 0) {
    return Promise.reject(new Error('No clips to render'));
  }

  const withAudio = hasAudioStream(input);
  const parts: string[] = [];
  const concatInputs: string[] = [];
  valid.forEach((c, i) => {
    const start = ms(c.inMs);
    const end = ms(c.outMs);
    parts.push(
      `[0:v]trim=start=${start}:end=${end},setpts=PTS-STARTPTS[v${i}]`,
    );
    concatInputs.push(`[v${i}]`);
    if (withAudio) {
      parts.push(
        `[0:a]atrim=start=${start}:end=${end},asetpts=PTS-STARTPTS[a${i}]`,
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
    '-i',
    input,
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
    const proc = spawn('ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    proc.stderr.on('data', (d: Buffer) => {
      // Keep only the tail so a failure message is useful without unbounded growth.
      stderr = (stderr + d.toString()).slice(-4000);
    });
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited ${code}: ${stderr.trim()}`));
    });
  });
}
