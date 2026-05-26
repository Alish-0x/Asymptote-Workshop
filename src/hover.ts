import * as vscode from 'vscode';
import { functionDocs } from './utils';

export class AsyHoverProvider implements vscode.HoverProvider {
  provideHover(
    document: vscode.TextDocument,
    position: vscode.Position
  ): vscode.ProviderResult<vscode.Hover> {
    const range = document.getWordRangeAtPosition(position);
    if (!range) return;

    const word = document.getText(range);
    const doc = functionDocs[word];
    if (!doc) return;

    return new vscode.Hover(new vscode.MarkdownString(doc), range);
  }
}
