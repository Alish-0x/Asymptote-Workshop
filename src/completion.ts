import * as vscode from 'vscode';
import { functionDocs, modules } from './utils';

const completions: vscode.CompletionItem[] = [];

for (const [fn, doc] of Object.entries(functionDocs)) {
  const item = new vscode.CompletionItem(fn, vscode.CompletionItemKind.Function);
  item.detail = `Asymptote: ${fn}`;
  item.documentation = new vscode.MarkdownString(doc);
  item.insertText = new vscode.SnippetString(`${fn}($1)$0`);
  completions.push(item);
}

for (const mod of modules) {
  const item = new vscode.CompletionItem(mod, vscode.CompletionItemKind.Module);
  item.detail = `Asymptote module`;
  item.documentation = new vscode.MarkdownString(`Import the \`${mod}\` module`);
  item.insertText = new vscode.SnippetString(`import ${mod};\n$0`);
  completions.push(item);
}

const penColors = [
  'black', 'white', 'red', 'green', 'blue', 'cyan', 'magenta',
  'yellow', 'orange', 'purple', 'brown', 'pink', 'gray', 'grey',
];

for (const color of penColors) {
  const item = new vscode.CompletionItem(color, vscode.CompletionItemKind.Color);
  item.detail = `Pen color: ${color}`;
  completions.push(item);
}

export function getCompletionProvider(): vscode.CompletionItemProvider {
  return {
    provideCompletionItems(
      document: vscode.TextDocument,
      position: vscode.Position
    ): vscode.CompletionItem[] {
      const linePrefix = document.lineAt(position).text.slice(0, position.character);
      const lastWord = linePrefix.split(/[\s,;()]+/).pop() || '';

      if (lastWord.startsWith('import') || lastWord.startsWith('from')) {
        return completions.filter(
          (c) => c.kind === vscode.CompletionItemKind.Module
        );
      }

      return completions;
    },
  };
}
