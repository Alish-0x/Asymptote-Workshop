import * as vscode from 'vscode';
import { BuildManager, BuildStatus, getRecipes } from './builder';
import { PreviewManager } from './previewer';
import { exportAsy, cleanAuxFiles } from './exporter';
import { getCompletionProvider } from './completion';
import { AsyHoverProvider } from './hover';
import { AsyDocumentSymbolProvider } from './symbols';
import { createLinter } from './linter';
import { getActiveAsyUri, getAutoBuildOnSave, getPreviewScale, resolveRootFile } from './utils';
import { buildAnimation } from './animation';
import { checkAsyInstalled, installAsy } from './installer';

let buildManager: BuildManager;
let previewManager: PreviewManager;
let autoBuild: boolean = false;
let autoBuildDisposable: vscode.Disposable | undefined;

function updateAutoBuild(extensionUri: vscode.Uri): void {
  if (autoBuildDisposable) {
    autoBuildDisposable.dispose();
    autoBuildDisposable = undefined;
  }

  if (autoBuild) {
    autoBuildDisposable = vscode.workspace.onDidSaveTextDocument((doc) => {
      if (doc.languageId === 'asymptote') {
        const rootPath = resolveRootFile(doc.uri.fsPath);
        buildManager.build(vscode.Uri.file(rootPath));
      }
    });
    vscode.window.setStatusBarMessage(
      '$(check) Asymptote auto-build enabled',
      3000
    );
  } else {
    vscode.window.setStatusBarMessage(
      '$(circle-slash) Asymptote auto-build disabled',
      3000
    );
  }
}

function onBuildComplete(
  status: BuildStatus,
  sourceUri: vscode.Uri
): void {
  console.log('AsyWorkshop: onBuildComplete', status, sourceUri?.fsPath);
  if (status !== 'success') return;
  const anim = buildManager.lastAnimationResult;
  if (anim && anim.frameCount > 1) {
    const scale = getPreviewScale();
    previewManager.preview(sourceUri).then(() => {
      previewManager.showAnimation({
        frames: anim.frames,
        gifData: anim.gifData,
        frameDelay: 100,
        frameCount: anim.frameCount,
      }, scale);
    });
  } else {
    previewManager.preview(sourceUri).catch((e) => {
      console.error('AsyWorkshop: preview failed', e);
    });
  }
}

export function activate(context: vscode.ExtensionContext): void {
  buildManager = new BuildManager();
  previewManager = new PreviewManager(context.extensionUri);

  autoBuild = getAutoBuildOnSave();
  updateAutoBuild(context.extensionUri);

  context.subscriptions.push(buildManager);
  context.subscriptions.push(previewManager);

  const buildCmd = vscode.commands.registerCommand(
    'asy-workshop.build',
    async (uri?: vscode.Uri) => {
      const targetUri = uri || getActiveAsyUri();
      if (!targetUri) {
        vscode.window.showWarningMessage(
          'Open an .asy file first to build it.'
        );
        return;
      }
      const rootPath = resolveRootFile(targetUri.fsPath);
      await buildManager.build(vscode.Uri.file(rootPath));
    }
  );

  const buildWithCmd = vscode.commands.registerCommand(
    'asy-workshop.buildWithRecipe',
    async () => {
      const separator = vscode.window.createQuickPick();
      separator.placeholder = 'Select build recipe (becomes the default)';

      const items: (vscode.QuickPickItem & { index: number })[] = [];
      for (const category of ['2D', '3D'] as const) {
        items.push({
          label: category === '2D' ? '--- 2D Output ---' : '--- 3D Output ---',
          kind: vscode.QuickPickItemKind.Separator,
          index: -1,
        });
        const allRecipes = getRecipes();
        for (let i = 0; i < allRecipes.length; i++) {
          const r = allRecipes[i];
          if (r.category !== category) continue;
          items.push({
            label: `$(gear) ${r.name}`,
            description: r.description,
            detail: `-f ${r.format}${r.args.length ? ' ' + r.args.join(' ') : ''}`,
            index: i,
          });
        }
      }

      separator.items = items;

      const picked = await new Promise<number | undefined>((resolve) => {
        separator.onDidAccept(() => {
          const sel = separator.selectedItems[0] as (typeof items)[0];
          resolve(sel?.index);
          separator.hide();
        });
        separator.onDidHide(() => resolve(undefined));
        separator.show();
      });

      if (picked === undefined || picked < 0) return;

      buildManager.setCurrentRecipe(picked);

      const targetUri = getActiveAsyUri();
      if (!targetUri) {
        vscode.window.showInformationMessage(
          `Recipe changed to: ${getRecipes()[picked].name}`
        );
        return;
      }
      await buildManager.build(targetUri);
    }
  );

  const previewCmd = vscode.commands.registerCommand(
    'asy-workshop.preview',
    async (uri?: vscode.Uri) => {
      const targetUri = uri || getActiveAsyUri();
      if (!targetUri) {
        vscode.window.showWarningMessage(
          'Open an .asy file first to preview it.'
        );
        return;
      }
      await previewManager.preview(targetUri);
    }
  );

  const animCmd = vscode.commands.registerCommand(
    'asy-workshop.buildAnimation',
    async (uri?: vscode.Uri) => {
      const targetUri = uri || getActiveAsyUri();
      if (!targetUri) {
        vscode.window.showWarningMessage(
          'Open an .asy file first to build animation.'
        );
        return;
      }

      // First, ensure the preview panel exists
      await previewManager.preview(targetUri);
      // Then start the animation build
      const result = await buildAnimation(targetUri);
      if (result) {
        const scale = getPreviewScale();
        previewManager.showAnimation(result, scale);
        vscode.window.showInformationMessage(
          `Animation built: ${result.frameCount} frame(s)`
        );
      }
    }
  );

  const exportPDFCmd = vscode.commands.registerCommand(
    'asy-workshop.exportPDF',
    async (uri?: vscode.Uri) => {
      await exportAsy(uri, 'pdf');
    }
  );

  const exportSVGCmd = vscode.commands.registerCommand(
    'asy-workshop.exportSVG',
    async (uri?: vscode.Uri) => {
      await exportAsy(uri, 'svg');
    }
  );

  const exportPNGCmd = vscode.commands.registerCommand(
    'asy-workshop.exportPNG',
    async (uri?: vscode.Uri) => {
      await exportAsy(uri, 'png');
    }
  );

  const exportEPSCmd = vscode.commands.registerCommand(
    'asy-workshop.exportEPS',
    async (uri?: vscode.Uri) => {
      await exportAsy(uri, 'eps');
    }
  );

  const cleanCmd = vscode.commands.registerCommand(
    'asy-workshop.clean',
    cleanAuxFiles
  );

  const killCmd = vscode.commands.registerCommand(
    'asy-workshop.kill',
    async () => {
      await buildManager.kill();
    }
  );

  const toggleAutoBuildCmd = vscode.commands.registerCommand(
    'asy-workshop.toggleAutoBuild',
    () => {
      autoBuild = !autoBuild;
      updateAutoBuild(context.extensionUri);
      vscode.commands.executeCommand(
        'setContext',
        'asy-workshop.autoBuildEnabled',
        autoBuild
      );
    }
  );

  buildManager.onBuild(onBuildComplete);

  context.subscriptions.push(
    buildCmd,
    buildWithCmd,
    previewCmd,
    animCmd,
    exportPDFCmd,
    exportSVGCmd,
    exportPNGCmd,
    exportEPSCmd,
    cleanCmd,
    killCmd,
    toggleAutoBuildCmd
  );

  context.subscriptions.push(
    vscode.languages.registerCompletionItemProvider(
      'asymptote',
      getCompletionProvider()
    )
  );

  context.subscriptions.push(
    vscode.languages.registerHoverProvider('asymptote', new AsyHoverProvider())
  );

  context.subscriptions.push(
    vscode.languages.registerDocumentSymbolProvider(
      'asymptote',
      new AsyDocumentSymbolProvider()
    )
  );

  context.subscriptions.push(createLinter());

  context.subscriptions.push(
    vscode.commands.registerCommand('asy-workshop.showBuildLog', () => {
      vscode.commands.executeCommand('asy-workshop.viewLog');
    })
  );

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('asy-workshop.autoBuildOnSave')) {
        autoBuild = getAutoBuildOnSave();
        updateAutoBuild(context.extensionUri);
      }
    })
  );

  const installCmd = vscode.commands.registerCommand(
    'asy-workshop.installAsy',
    installAsy
  );
  context.subscriptions.push(installCmd);

  checkAsyInstalled().then((found) => {
    void vscode.commands.executeCommand('setContext', 'asy-workshop.hasAsy', found);
    if (!found) {
      vscode.window.showWarningMessage(
        'Asymptote (asy) is not installed. Build and preview will not work.',
        'Install',
        'Later'
      ).then((choice) => {
        if (choice === 'Install') {
          void vscode.commands.executeCommand('asy-workshop.installAsy');
        }
      });
    }
  });

  void vscode.commands.executeCommand(
    'setContext',
    'asy-workshop.hasAsymptote',
    true
  );
}

export function deactivate(): void {
  if (autoBuildDisposable) {
    autoBuildDisposable.dispose();
  }
}
