import * as vscode from 'vscode';

export class AsyDocumentSymbolProvider
  implements vscode.DocumentSymbolProvider
{
  provideDocumentSymbols(
    document: vscode.TextDocument
  ): vscode.ProviderResult<vscode.SymbolInformation[]> {
    const symbols: vscode.SymbolInformation[] = [];
    const lines = document.getText().split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      const importMatch = line.match(/^import\s+(\w+);/);
      if (importMatch) {
        symbols.push(
          new vscode.SymbolInformation(
            importMatch[1],
            vscode.SymbolKind.Module,
            'import',
            new vscode.Location(document.uri, new vscode.Position(i, 0))
          )
        );
        continue;
      }

      const structMatch = line.match(/^struct\s+(\w+)/);
      if (structMatch) {
        symbols.push(
          new vscode.SymbolInformation(
            structMatch[1],
            vscode.SymbolKind.Struct,
            'struct',
            new vscode.Location(document.uri, new vscode.Position(i, 0))
          )
        );
        continue;
      }

      const funcMatch = line.match(
        /^(?:void|real|int|string|bool|pair|triple|picture|transform|path|guide|pen|color)\s+(\w+)\s*\(/
      );
      if (funcMatch) {
        symbols.push(
          new vscode.SymbolInformation(
            funcMatch[1],
            vscode.SymbolKind.Function,
            'function',
            new vscode.Location(document.uri, new vscode.Position(i, 0))
          )
        );
        continue;
      }

      const varMatch = line.match(
        /^(?:real|int|string|bool|pair|triple|pen|path|guide|picture|transform|color)\s+(\w+)\s*=/
      );
      if (varMatch) {
        symbols.push(
          new vscode.SymbolInformation(
            varMatch[1],
            vscode.SymbolKind.Variable,
            'variable',
            new vscode.Location(document.uri, new vscode.Position(i, 0))
          )
        );
      }
    }

    return symbols;
  }
}
