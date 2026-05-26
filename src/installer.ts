import * as vscode from 'vscode';
import { spawn } from 'child_process';

type PackageManager = {
  name: string;
  installCmd: string[];
  detect: string[];
};

const pmForPlatform: Record<string, PackageManager[]> = {
  linux: [
    { name: 'apt', installCmd: ['apt', 'install', '-y', 'asymptote'], detect: ['apt', '--version'] },
    { name: 'dnf', installCmd: ['dnf', 'install', '-y', 'asymptote'], detect: ['dnf', '--version'] },
    { name: 'pacman', installCmd: ['pacman', '-S', '--noconfirm', 'asymptote'], detect: ['pacman', '--version'] },
    { name: 'zypper', installCmd: ['zypper', 'install', '-y', 'asymptote'], detect: ['zypper', '--version'] },
    { name: 'brew', installCmd: ['brew', 'install', 'asymptote'], detect: ['brew', '--version'] },
  ],
  darwin: [
    { name: 'brew', installCmd: ['brew', 'install', 'asymptote'], detect: ['brew', '--version'] },
    { name: 'port', installCmd: ['port', 'install', 'asymptote'], detect: ['port', 'version'] },
  ],
  win32: [
    { name: 'winget', installCmd: ['winget', 'install', 'asymptote', '--accept-package-agreements'], detect: ['winget', '--version'] },
    { name: 'choco', installCmd: ['choco', 'install', 'asymptote', '-y'], detect: ['choco', '--version'] },
    { name: 'scoop', installCmd: ['scoop', 'install', 'asymptote'], detect: ['scoop', '--version'] },
  ],
};

function exec(cmd: string, args: string[]): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], timeout: 10000 });
    child.on('error', () => resolve(false));
    child.on('close', (code) => resolve(code === 0));
  });
}

export async function checkAsyInstalled(): Promise<boolean> {
  const cmd = process.platform === 'win32' ? 'where' : 'which';
  return exec(cmd, ['asy']);
}

function getPlatform(): string {
  if (process.platform === 'win32' || process.platform === 'cygwin') return 'win32';
  if (process.platform === 'darwin') return 'darwin';
  return 'linux';
}

async function detectPackageManager(): Promise<PackageManager | undefined> {
  const platform = getPlatform();
  const managers = pmForPlatform[platform];
  if (!managers) return undefined;
  for (const pm of managers) {
    if (await exec(pm.detect[0], pm.detect.slice(1))) return pm;
  }
  return undefined;
}

export async function installAsy(): Promise<boolean> {
  const pm = await detectPackageManager();
  if (!pm) {
    const platform = getPlatform();
    const urls: Record<string, string> = {
      linux: 'https://asymptote.sourceforge.io/',
      darwin: 'https://asymptote.sourceforge.io/',
      win32: 'https://asymptote.sourceforge.io/',
    };
    const choice = await vscode.window.showErrorMessage(
      `No supported package manager found. Install Asymptote manually from ${urls[platform] || urls.linux}`,
      'Open download page'
    );
    if (choice) {
      vscode.env.openExternal(vscode.Uri.parse(urls[platform] || urls.linux));
    }
    return false;
  }

  const choice = await vscode.window.showInformationMessage(
    `Asymptote (asy) is not installed. Install via ${pm.name}?`,
    'Install', 'Cancel'
  );
  if (choice !== 'Install') return false;

  const terminal = vscode.window.createTerminal({
    name: 'Asymptote Install',
    message: `Installing Asymptote via ${pm.name}...`,
  });
  terminal.show();
  const isSudo = pm.name === 'apt' || pm.name === 'dnf' || pm.name === 'zypper';
  if (isSudo) {
    terminal.sendText(
      `sudo ${pm.installCmd.join(' ')}`
    );
  } else {
    terminal.sendText(pm.installCmd.join(' '));
  }

  return true;
}
