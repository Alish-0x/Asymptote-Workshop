import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { spawn } from 'child_process';
import { getAsyCommand } from './utils';

export interface AnimationResult {
  frames: string[];
  gifData?: string;
  frameCount: number;
  frameDelay: number;
}

function hasImageMagick(): boolean {
  for (const cmd of ['magick', 'convert']) {
    try {
      const r = spawn(cmd, ['--version'], { stdio: 'ignore' });
      r.unref();
      return true;
    } catch {
      continue;
    }
  }
  return false;
}

function checkCommand(cmd: string): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn('which', [cmd], { stdio: 'pipe' });
    child.on('close', (code) => resolve(code === 0));
    child.on('error', () => resolve(false));
  });
}

export async function buildAnimation(uri: vscode.Uri): Promise<AnimationResult | null> {
  const filePath = uri.fsPath;
  const fileDir = path.dirname(filePath);
  const basename = path.basename(filePath, '.asy');
  const cmd = getAsyCommand();

  const hasConvert = await checkCommand('convert');
  const hasMagick = await checkCommand('magick');

  return new Promise((resolve) => {
    const child = spawn(cmd, ['-f', 'png', `${basename}.asy`], {
      cwd: fileDir,
      timeout: 120000,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stderr = '';
    child.stderr?.setEncoding('utf-8');
    child.stderr?.on('data', (data: string) => { stderr += data; });

    child.on('close', async (code) => {
      if (code !== 0) {
        const details = stderr || 'unknown error';
        vscode.window.showErrorMessage(
          `Animation build failed (exit ${code}): ${details}`
        );
        resolve(null);
        return;
      }

      // Detect animation frames: basename-0.png, basename-1.png, ...
      const frames: string[] = [];
      let index = 0;
      while (true) {
        const framePath = path.join(fileDir, `${basename}-${index}.png`);
        if (!fs.existsSync(framePath)) break;
        const data = fs.readFileSync(framePath);
        frames.push(`data:image/png;base64,${data.toString('base64')}`);
        index++;
      }

      // No -N frames? Try single PNG
      if (frames.length === 0) {
        const singlePath = path.join(fileDir, `${basename}.png`);
        if (fs.existsSync(singlePath)) {
          const data = fs.readFileSync(singlePath);
          frames.push(`data:image/png;base64,${data.toString('base64')}`);
        }
      }

      if (frames.length === 0) {
        vscode.window.showErrorMessage(
          'No animation frames found. Make sure the .asy file uses the animation module.'
        );
        resolve(null);
        return;
      }

      // Try to create GIF via ImageMagick
      let gifData: string | undefined;
      if (frames.length > 1 && (hasConvert || hasMagick)) {
        const convertCmd = hasMagick ? 'magick' : 'convert';
        const convertArgs = hasMagick
          ? ['convert', '-delay', '10', '-loop', '0', `${basename}-*.png`, `${basename}.gif`]
          : ['-delay', '10', '-loop', '0', `${basename}-*.png`, `${basename}.gif`];

        try {
          await runCommand(convertCmd, convertArgs, fileDir);
          const gifPath = path.join(fileDir, `${basename}.gif`);
          if (fs.existsSync(gifPath)) {
            const data = fs.readFileSync(gifPath);
            gifData = data.toString('base64');
            // Clean up GIF file — we have it in memory
            try { fs.unlinkSync(gifPath); } catch {}
          }
        } catch {
          // GIF creation failed, fall through to frame cycling
        }
      }

      resolve({
        frames,
        gifData,
        frameCount: frames.length,
        frameDelay: 100,
      });
    });

    child.on('error', (err: NodeJS.ErrnoException) => {
      const msg = err.code === 'ENOENT'
        ? `Asymptote command "${cmd}" not found`
        : `Animation build error: ${err.message}`;
      vscode.window.showErrorMessage(msg);
      resolve(null);
    });
  });
}

function runCommand(cmd: string, args: string[], cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    child.on('close', (code) => {
      code === 0 ? resolve() : reject(new Error(`Exit ${code}`));
    });
    child.on('error', reject);
  });
}
