import { execFile } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

export function resolveFfmpegPath(): string {
  if (process.env.FFMPEG_PATH && fs.existsSync(process.env.FFMPEG_PATH)) {
    return process.env.FFMPEG_PATH;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
    if (ffmpegInstaller && ffmpegInstaller.path && fs.existsSync(ffmpegInstaller.path)) {
      return ffmpegInstaller.path;
    }
  } catch {
    // Ignore
  }
  return 'ffmpeg';
}

/**
 * Synthesizes a sample test MP4 video using FFmpeg lavfi testsrc and sine audio.
 */
export async function generateSampleVideo(
  outputPath: string,
  durationSeconds = 18,
): Promise<string> {
  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const ffmpeg = resolveFfmpegPath();
  const args = [
    '-y',
    '-f', 'lavfi',
    '-i', `testsrc=duration=${durationSeconds}:size=1280x720:rate=25`,
    '-f', 'lavfi',
    '-i', `sine=frequency=440:duration=${durationSeconds}`,
    '-c:v', 'libx264',
    '-pix_fmt', 'yuv420p',
    '-preset', 'ultrafast',
    '-c:a', 'aac',
    '-shortest',
    outputPath,
  ];

  return new Promise((resolve, reject) => {
    execFile(ffmpeg, args, (error, stdout, stderr) => {
      if (error) {
        return reject(new Error(`Failed to generate sample video: ${error.message}\n${stderr}`));
      }
      console.log(`[Sample Generator] Generated test MP4: ${outputPath} (${durationSeconds}s)`);
      resolve(outputPath);
    });
  });
}

const targetPath = path.resolve(process.cwd(), 'samples', 'sample.mp4');
generateSampleVideo(targetPath, 18)
  .then((p) => console.log(`Created sample video at: ${p}`))
  .catch((err) => {
    console.error(err);
  });
