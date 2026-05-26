import * as vscode from 'vscode';
import * as path from 'path';
import { spawn } from 'child_process';
import { getAsyCommand, parseAsyErrors, getLintOnSave } from './utils';

export function createLinter(): vscode.Disposable {
  const diags =
    vscode.languages.createDiagnosticCollection('asy-lint');

  const disposable = vscode.workspace.onDidSaveTextDocument((doc) => {
    if (doc.languageId !== 'asymptote') return;
    if (!getLintOnSave()) return;
    lintDocument(doc, diags);
  });

  return vscode.Disposable.from(
    disposable,
    diags,
    vscode.commands.registerCommand('asy-workshop.lint', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor || editor.document.languageId !== 'asymptote') {
        vscode.window.showWarningMessage('Open an .asy file first.');
        return;
      }
      await lintDocument(editor.document, diags);
    })
  );
}

async function lintDocument(
  document: vscode.TextDocument,
  diags: vscode.DiagnosticCollection
): Promise<void> {
  const asyCmd = getAsyCommand();
  const filePath = document.uri.fsPath;
  const fileDir = path.dirname(filePath);

  try {
    const result = await runAsyCheck(asyCmd, filePath);
    const parsed = parseAsyErrors(result.stderr, fileDir);
    diags.clear();
    for (const { uri, diagnostics } of parsed) {
      diags.set(uri, diagnostics);
    }
  } catch {
    // silently ignore
  }
}

function runAsyCheck(
  cmd: string,
  filePath: string
): Promise<{ stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, ['-o', '/dev/null', filePath], {
      timeout: 15000,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stderr = '';
    child.stderr?.setEncoding('utf-8');
    child.stderr?.on('data', (data: string) => { stderr += data; });
    child.on('error', () => reject(new Error('asy not found')));
    child.on('close', () => resolve({ stderr }));
  });
}
