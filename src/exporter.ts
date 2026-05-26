import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { spawn } from 'child_process';

export async function exportAsy(
  uri: vscode.Uri | undefined,
  format: string
): Promise<void> {
  let fileUri = uri;
  if (!fileUri) {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document.languageId !== 'asymptote') {
      vscode.window.showWarningMessage(
        'No Asymptote file selected. Open an .asy file first.'
      );
      return;
    }
    fileUri = editor.document.uri;
  }

  const filePath = fileUri.fsPath;
  const fileDir = path.dirname(filePath);
  const basename = path.basename(filePath, '.asy');
  const asyCmd = vscode.workspace
    .getConfiguration('asy-workshop')
    .get<string>('command', 'asy');

  const ext = ['pdf', 'svg', 'png', 'eps'].includes(format) ? format : 'pdf';

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: `Exporting Asymptote to ${format.toUpperCase()}...`,
      cancellable: true,
    },
    async (_, token) => {
      return new Promise<void>((resolve) => {
        const child = spawn(asyCmd, ['-f', ext, `${basename}.asy`], {
          cwd: fileDir,
          timeout: 120000,
          stdio: ['ignore', 'pipe', 'pipe'],
        });

        let stderr = '';
        child.stderr?.setEncoding('utf-8');
        child.stderr?.on('data', (data: string) => { stderr += data; });

        token.onCancellationRequested(() => {
          child.kill('SIGTERM');
          resolve();
        });

        child.on('error', () => {
          vscode.window.showErrorMessage(
            `Command "${asyCmd}" not found. Install Asymptote first.`
          );
          resolve();
        });

        child.on('close', () => {
          if (token.isCancellationRequested) {
            resolve();
            return;
          }

          const outputPath = path.join(fileDir, `${basename}.${ext}`);

          if (fs.existsSync(outputPath)) {
            vscode.window.showInformationMessage(
              `Exported to ${outputPath}`
            );

            if (format === 'svg') {
              void vscode.commands.executeCommand('asy-workshop.preview');
            } else {
              void vscode.commands.executeCommand(
                'vscode.open',
                vscode.Uri.file(outputPath)
              );
            }
            resolve();
          } else {
            const errMsg = stderr || 'unknown error';
            vscode.window.showErrorMessage(
              `Export to ${format.toUpperCase()} failed: ${errMsg.slice(0, 200)}`
            );
            resolve();
          }
        });
      });
    }
  );
}

export async function cleanAuxFiles(): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor || editor.document.languageId !== 'asymptote') {
    vscode.window.showWarningMessage('No Asymptote file active.');
    return;
  }

  const filePath = editor.document.uri.fsPath;
  const dir = path.dirname(filePath);
  const basename = path.basename(filePath, '.asy');
  const extensions = ['pdf', 'svg', 'png', 'eps', 'ps', 'log', 'pre', 'out'];
  let cleaned = 0;

  for (const ext of extensions) {
    const p = path.join(dir, `${basename}.${ext}`);
    try {
      fs.unlinkSync(p);
      cleaned++;
    } catch {}
  }

  if (cleaned > 0) {
    vscode.window.showInformationMessage(
      `Cleaned ${cleaned} auxiliary file(s).`
    );
  } else {
    vscode.window.showInformationMessage('No auxiliary files to clean.');
  }
}
