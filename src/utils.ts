import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

export function getAsyCommand(): string {
  return vscode.workspace
    .getConfiguration('asy-workshop')
    .get<string>('command', 'asy');
}

export function getOutputFormat(): string {
  return vscode.workspace
    .getConfiguration('asy-workshop')
    .get<string>('outputFormat', 'svg');
}

export function getPreviewScale(): number {
  return vscode.workspace
    .getConfiguration('asy-workshop')
    .get<number>('previewScale', 1.0);
}

export function getAutoBuildOnSave(): boolean {
  return vscode.workspace
    .getConfiguration('asy-workshop')
    .get<boolean>('autoBuildOnSave', true);
}

export function getAutoOpenPreview(): boolean {
  return vscode.workspace
    .getConfiguration('asy-workshop')
    .get<boolean>('autoOpenPreview', true);
}

export function getShowBuildLog(): boolean {
  return vscode.workspace
    .getConfiguration('asy-workshop')
    .get<boolean>('showBuildLog', false);
}

export function getLintOnSave(): boolean {
  return vscode.workspace
    .getConfiguration('asy-workshop')
    .get<boolean>('lintOnSave', false);
}

export function getBuildArgs(): string[] {
  return vscode.workspace
    .getConfiguration('asy-workshop')
    .get<string[]>('buildArgs', []);
}

export function getActiveAsyUri(): vscode.Uri | undefined {
  const editor = vscode.window.activeTextEditor;
  if (!editor || editor.document.languageId !== 'asymptote') return undefined;
  return editor.document.uri;
}

export function getOutputPath(documentPath: string, format: string): string {
  const dir = path.dirname(documentPath);
  const basename = path.basename(documentPath, '.asy');
  return path.join(dir, `${basename}.${format}`);
}

export function parseAsyErrors(
  stderr: string,
  fileDir: string
): { uri: vscode.Uri; diagnostics: vscode.Diagnostic[] }[] {
  const resultMap = new Map<string, vscode.Diagnostic[]>();
  const lines = stderr.split('\n');
  const errorRegex = /^(.+?):\s*(\d+)\.(\d+):\s*(.*)/;

  for (const line of lines) {
    const match = line.match(errorRegex);
    if (!match) continue;
    const fileName = match[1].trim();
    const lineNum = parseInt(match[2], 10) - 1;
    const colNum = parseInt(match[3], 10) - 1;
    const message = match[4].trim();
    if (!message) continue;

    let resolved = fileName;
    if (!path.isAbsolute(fileName)) {
      resolved = path.join(fileDir, fileName);
    }

    const range = new vscode.Range(
      Math.max(0, lineNum),
      Math.max(0, colNum),
      Math.max(0, lineNum),
      Math.max(0, colNum + 50)
    );

    const isError =
      message.toLowerCase().includes('error') ||
      message.toLowerCase().includes('syntax error') ||
      message.toLowerCase().includes('could not load');

    const diag = new vscode.Diagnostic(
      range,
      message,
      isError
        ? vscode.DiagnosticSeverity.Error
        : vscode.DiagnosticSeverity.Warning
    );

    const key = resolved;
    if (!resultMap.has(key)) resultMap.set(key, []);
    resultMap.get(key)!.push(diag);
  }

  const result: { uri: vscode.Uri; diagnostics: vscode.Diagnostic[] }[] = [];
  for (const [filePath, diagnostics] of resultMap) {
    result.push({ uri: vscode.Uri.file(filePath), diagnostics });
  }
  return result;
}

export function resolveRootFile(filePath: string): string {
  const magicRoot = getRootFromMagicComment(filePath);
  if (magicRoot) {
    const resolved = path.resolve(path.dirname(filePath), magicRoot);
    if (fs.existsSync(resolved)) return resolved;
  }
  const foundRoot = searchForRoot(filePath);
  if (foundRoot) return foundRoot;
  return filePath;
}

export function getRootFromMagicComment(filePath: string): string | null {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const match = content.match(/\/\/\s*!?\s*ASY\s+root\s*=\s*(.+\.asy)/i);
    if (match) return match[1].trim();
  } catch {}
  return null;
}

export function searchForRoot(filePath: string): string | null {
  const dir = path.dirname(filePath);
  const fileName = path.basename(filePath);
  try {
    const files = fs.readdirSync(dir);
    for (const f of files) {
      if (!f.endsWith('.asy') || f === fileName) continue;
      const content = fs.readFileSync(path.join(dir, f), 'utf-8');
      const escaped = fileName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (new RegExp(`(include|input)\\s+"${escaped}"`).test(content)) {
        return path.join(dir, f);
      }
    }
  } catch {}
  return null;
}

export const functionDocs: Record<string, string> = {
  draw: 'Draw a path, curve, or object',
  fill: 'Fill a closed path with a color',
  filldraw: 'Fill and draw a path',
  label: 'Place a label at a position',
  shipout: 'Output the current picture',
  clip: 'Clip the current picture',
  layer: 'Begin a new graphics layer',
  add: 'Add a picture to the current picture',
  attach: 'Attach a picture with positioning',
  size: 'Set the output size',
  unitsize: 'Set the unit size',
  defaultpen: 'Set the default pen',
  pair: 'Create a 2D coordinate pair',
  triple: 'Create a 3D coordinate triple',
  dot: 'Draw a dot at a point',
  arrow: 'Draw an arrow',
  scale: 'Scale a transform or picture',
  rotate: 'Rotate a transform or picture',
  shift: 'Shift a transform or picture',
  reflect: 'Reflect across a line',
  xaxis: 'Draw x-axis with optional ticks',
  yaxis: 'Draw y-axis with optional ticks',
  graph: 'Create a graph of a function',
  contour: 'Create a contour plot',
  surface: 'Create a 3D surface',
};

export function isAnimationFile(filePath: string): boolean {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return /\bimport\s+animation\b/.test(content);
  } catch {
    return false;
  }
}

export function collectAnimationFrames(
  dir: string, basename: string
): { frames: string[]; gifData?: string } {
  const frames: string[] = [];
  let index = 0;
  while (true) {
    const framePath = path.join(dir, `${basename}-${index}.png`);
    if (!fs.existsSync(framePath)) break;
    const data = fs.readFileSync(framePath);
    frames.push(`data:image/png;base64,${data.toString('base64')}`);
    index++;
  }
  if (frames.length === 0) {
    const singlePath = path.join(dir, `${basename}.png`);
    if (fs.existsSync(singlePath)) {
      const data = fs.readFileSync(singlePath);
      frames.push(`data:image/png;base64,${data.toString('base64')}`);
    }
  }
  return { frames };
}

export const modules = [
  'graph', 'graph3', 'geometry', 'three', 'contour',
  'palette', 'smoothcontour', 'slopefield', 'vector',
  'stats', 'math', 'patterns', 'calendar', 'tree',
  'feasible', 'ode', 'animation', 'audio',
];
