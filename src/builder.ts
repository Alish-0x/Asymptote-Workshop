import * as vscode from 'vscode';
import * as path from 'path';
import { spawn } from 'child_process';
import {
  getAsyCommand,
  getOutputFormat,
  getShowBuildLog,
  getBuildArgs,
  parseAsyErrors,
  isAnimationFile,
  collectAnimationFrames,
} from './utils';

export interface BuildRecipe {
  name: string;
  format: string;
  category: '2D' | '3D';
  args: string[];
  description: string;
}

const DEFAULT_RECIPES: BuildRecipe[] = [
  { name: 'SVG', format: 'svg', category: '2D', args: [], description: 'Vector output for preview' },
  { name: 'PDF', format: 'pdf', category: '2D', args: [], description: 'Vector output for documents' },
  { name: 'PNG', format: 'png', category: '2D', args: [], description: 'Raster output for images' },
  { name: '3D PDF (PRC)', format: 'pdf', category: '3D', args: [], description: 'Interactive 3D (needs settings.prc=true)' },
  { name: '3D Render 4x', format: 'png', category: '3D', args: ['-render', '4'], description: 'Raytraced snapshot (medium quality)' },
  { name: '3D Render 8x', format: 'png', category: '3D', args: ['-render', '8'], description: 'Raytraced snapshot (high quality)' },
];

export function getRecipes(): BuildRecipe[] {
  const config = vscode.workspace
    .getConfiguration('asy-workshop')
    .get<
      { name: string; format: string; category?: string; args?: string[]; description?: string }[]
    >('recipes', []);

  const map = new Map<string, BuildRecipe>();
  for (const r of DEFAULT_RECIPES) map.set(r.name, r);
  for (const r of config) {
    map.set(r.name, {
      name: r.name,
      format: r.format,
      category: r.category === '3D' ? '3D' : '2D',
      args: r.args ?? [],
      description: r.description ?? '',
    });
  }
  return Array.from(map.values());
}

type BuildStatus = 'idle' | 'running' | 'success' | 'error';
type BuildCallback = (
  status: BuildStatus,
  sourceUri: vscode.Uri,
  outputPath?: string
) => void;

interface BuildResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface BuildAnimationResult {
  frames: string[];
  gifData?: string;
  frameCount: number;
}

class BuildManager {
  private currentProcess: { kill: () => void } | undefined;
  private currentBuildUri: vscode.Uri | undefined;
  private statusBarItem: vscode.StatusBarItem;
  private recipeBarItem: vscode.StatusBarItem;
  private status: BuildStatus = 'idle';
  private currentRecipeIndex: number = 0;
  private diagnosticCollection: vscode.DiagnosticCollection;
  private onBuildComplete: BuildCallback | undefined;
  private buildLog: string[] = [];
  private outputChannel: vscode.OutputChannel;
  lastAnimationResult: BuildAnimationResult | undefined;

  constructor() {
    this.statusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      100
    );
    this.recipeBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      99
    );
    this.diagnosticCollection =
      vscode.languages.createDiagnosticCollection('asy-build');
    this.outputChannel = vscode.window.createOutputChannel(
      'Asymptote Build Log'
    );
    this.updateStatusBar();
    this.updateRecipeBar();
    this.statusBarItem.show();
    this.recipeBarItem.show();
  }

  get isRunning(): boolean {
    return this.status === 'running';
  }

  get log(): string[] {
    return this.buildLog;
  }

  get currentRecipe(): BuildRecipe {
    return getRecipes()[this.currentRecipeIndex];
  }

  get recipeLabel(): string {
    const r = this.currentRecipe;
    return r.category === '3D' ? `$(vm) ${r.name}` : r.name;
  }

  setCurrentRecipe(index: number): void {
    this.currentRecipeIndex = Math.min(Math.max(0, index), getRecipes().length - 1);
    this.updateRecipeBar();
  }

  onBuild(callback: BuildCallback): void {
    this.onBuildComplete = callback;
  }

  private updateStatusBar(): void {
    const icons: Record<BuildStatus, string> = {
      idle: '$(circle-outline)',
      running: '$(sync~spin)',
      success: '$(check)',
      error: '$(error)',
    };
    const recipe = this.currentRecipe;
    this.statusBarItem.text = `${icons[this.status]} Asymptote: ${recipe.name}`;
    this.statusBarItem.tooltip =
      this.status === 'running'
        ? 'Asymptote: Building...'
        : 'Asymptote Workshop — click to build';
    this.statusBarItem.command = 'asy-workshop.build';
    this.statusBarItem.color =
      this.status === 'error'
        ? new vscode.ThemeColor('errorForeground')
        : undefined;
  }

  private updateRecipeBar(): void {
    this.recipeBarItem.text = this.recipeLabel;
    this.recipeBarItem.tooltip = `Recipe: ${this.currentRecipe.name} (click to change)`;
    this.recipeBarItem.command = 'asy-workshop.buildWithRecipe';
    this.recipeBarItem.color = this.currentRecipe.category === '3D'
      ? new vscode.ThemeColor('charts.blue')
      : undefined;
  }

  private setStatus(status: BuildStatus): void {
    this.status = status;
    this.updateStatusBar();
  }

  build(
    uri: vscode.Uri,
    format?: string,
    extraArgs?: string[]
  ): Promise<void> {
    return new Promise((resolve) => {
      void this.buildInternal(uri, format, extraArgs).then(resolve);
    });
  }

  private async buildInternal(
    uri: vscode.Uri,
    format?: string,
    extraArgs?: string[]
  ): Promise<void> {
    if (this.status === 'running') {
      vscode.window.showWarningMessage('Asymptote build already in progress');
      return;
    }

    this.setStatus('running');
    this.buildLog = [];
    this.diagnosticCollection.clear();
    this.outputChannel.clear();
    this.currentBuildUri = uri;
    this.lastAnimationResult = undefined;

    const filePath = uri.fsPath;
    const fileDir = path.dirname(filePath);
    const basename = path.basename(filePath, '.asy');
    const asyCmd = getAsyCommand();
    const recipe = this.currentRecipe;
    let outputFormat = format || recipe.format;
    let buildArgs = extraArgs !== undefined ? extraArgs : recipe.args;

    // Auto-detect animation source and switch to PNG
    const isAnimation = isAnimationFile(filePath);
    if (isAnimation && outputFormat !== 'png') {
      outputFormat = 'png';
      buildArgs = [];
      this.buildLog.push('(auto-switched to PNG for animation output)');
    }

    this.buildLog.push(
      `[${new Date().toLocaleTimeString()}] Building: ${filePath}`
    );
    this.buildLog.push(
      `${asyCmd} -f ${outputFormat} "${basename}.asy"`
    );
    this.outputChannel.appendLine(this.buildLog[0]);
    this.outputChannel.appendLine(this.buildLog[1]);

    if (getShowBuildLog()) {
      this.outputChannel.show(true);
    }

    try {
      const result = await this.runAsy(
        asyCmd,
        outputFormat,
        [basename + '.asy', ...buildArgs],
        fileDir
      );

      this.buildLog.push(result.stderr || '(no errors)');
      this.outputChannel.appendLine(result.stderr || '');

      if (result.exitCode === 0) {
        const outputPath = path.join(fileDir, `${basename}.${outputFormat}`);
        const exists = await this.checkFileExists(outputPath);

        if (exists) {
          this.setStatus('success');
          this.buildLog.push('Build completed successfully.');
          this.outputChannel.appendLine('Build completed successfully.');

          // Detect animation frames from PNG output
          const { frames } = collectAnimationFrames(fileDir, basename);
          if (frames.length > 1) {
            this.lastAnimationResult = { frames, frameCount: frames.length };
            this.buildLog.push(`Animation: ${frames.length} frame(s) detected`);
            this.outputChannel.appendLine(`Animation: ${frames.length} frame(s) detected`);
          }

          if (this.onBuildComplete) {
            console.log('AsyWorkshop: builder calling onBuildComplete(success)', this.currentBuildUri?.fsPath, 'output:', outputPath);
            this.onBuildComplete('success', this.currentBuildUri!, outputPath);
          }
        } else {
          this.buildLog.push('Output file not found after build.');
          this.outputChannel.appendLine('Output file not found after build.');
          this.setStatus('error');
          vscode.window.showErrorMessage(
            'Build succeeded but output was not created.'
          );
          if (this.onBuildComplete) {
            this.onBuildComplete('error', this.currentBuildUri!);
          }
        }
      } else {
        await this.reportErrors(result.stderr, fileDir, basename);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.buildLog.push(`Build error: ${msg}`);
      this.outputChannel.appendLine(`Build error: ${msg}`);
      this.setStatus('error');
      vscode.window.showErrorMessage(`Asymptote build failed: ${msg}`);
      if (this.onBuildComplete) {
        this.onBuildComplete('error', this.currentBuildUri!);
      }
    }
  }

  private runAsy(
    cmd: string,
    outputFormat: string,
    args: string[],
    cwd: string
  ): Promise<BuildResult> {
    return new Promise((resolve, reject) => {
      const child = spawn(cmd, ['-f', outputFormat, ...args], {
        cwd,
        timeout: 120000,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';

      child.stdout?.setEncoding('utf-8');
      child.stderr?.setEncoding('utf-8');
      child.stdout?.on('data', (data: string) => { stdout += data; });
      child.stderr?.on('data', (data: string) => { stderr += data; });

      child.on('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'ENOENT') {
          reject(
            new Error(
              `Command "${cmd}" not found. Install Asymptote or set "asy-workshop.command".`
            )
          );
        } else {
          reject(new Error(`Process error: ${err.message}`));
        }
      });

      child.on('close', (exitCode: number | null) => {
        resolve({ exitCode: exitCode ?? 1, stdout, stderr });
      });

      this.currentProcess = {
        kill: () => {
          child.kill('SIGTERM');
          this.currentProcess = undefined;
        },
      };
    });
  }

  private async reportErrors(
    stderr: string,
    dir: string,
    basename: string
  ): Promise<void> {
    const logPath = path.join(dir, `${basename}.log`);
    const errPath = path.join(dir, `${basename}.err`);

    let errorText = stderr;
    for (const p of [logPath, errPath]) {
      try {
        const content = await vscode.workspace.fs.readFile(
          vscode.Uri.file(p)
        );
        errorText += '\n' + content.toString();
      } catch {}
    }

    if (!errorText) {
      errorText =
        'Build failed with no output. Check that `asy` is installed and accessible.';
    }

    this.buildLog.push(errorText);
    this.outputChannel.appendLine(errorText);

    const results = parseAsyErrors(errorText, dir);
    const allDiags: vscode.Diagnostic[] = [];
    for (const { uri, diagnostics } of results) {
      this.diagnosticCollection.set(uri, diagnostics);
      allDiags.push(...diagnostics);
    }

    const hasErrors = allDiags.some(
      (d) => d.severity === vscode.DiagnosticSeverity.Error
    );

    if (hasErrors || errorText.toLowerCase().includes('error')) {
      this.setStatus('error');
      vscode.window.showErrorMessage(
        `Asymptote build failed with ${allDiags.length} error(s). See Problems panel.`
      );
      if (this.onBuildComplete) {
        this.onBuildComplete('error', this.currentBuildUri!);
      }
    } else {
      this.setStatus('success');
      if (this.onBuildComplete) {
        this.onBuildComplete('success', this.currentBuildUri!);
      }
    }
  }

  private async checkFileExists(filePath: string): Promise<boolean> {
    try {
      await vscode.workspace.fs.stat(vscode.Uri.file(filePath));
      return true;
    } catch {
      return false;
    }
  }

  kill(): void {
    if (this.currentProcess) {
      this.currentProcess.kill();
      this.currentProcess = undefined;
    }
    this.setStatus('idle');
    this.buildLog.push('Build cancelled.');
    this.outputChannel.appendLine('Build cancelled.');
  }

  dispose(): void {
    this.kill();
    this.statusBarItem.dispose();
    this.recipeBarItem.dispose();
    this.diagnosticCollection.dispose();
    this.outputChannel.dispose();
  }
}

export { BuildManager, BuildStatus };
