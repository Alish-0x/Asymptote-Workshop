import * as vscode from 'vscode';
import { getPreviewScale, getOutputPath } from './utils';

function stripXmlPreamble(svg: string): string {
  return svg.replace(/^<\?xml[^?]*\?>/, '').trim();
}

interface AnimationData {
  frames?: string[];
  gifData?: string;
  frameDelay: number;
  frameCount: number;
}

class PreviewManager {
  private panel: vscode.WebviewPanel | undefined;
  private currentUri: vscode.Uri | undefined;
  private disposables: vscode.Disposable[] = [];
  private currentAnimation: AnimationData | undefined;

  get isVisible(): boolean {
    return this.panel !== undefined;
  }

  constructor(private extensionUri: vscode.Uri) {}

  private getHtml(content: string, scale: number): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data: blob: https:; script-src 'unsafe-inline';">
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{background:#fff;display:flex;flex-direction:column;align-items:center;padding:0;min-height:100vh}
    .toolbar{position:sticky;top:0;z-index:10;background:var(--vscode-sideBar-background,#1e1e1e);padding:8px 16px;border-bottom:1px solid var(--vscode-widget-border,#333);width:100%;display:flex;align-items:center;gap:8px;flex-shrink:0}
    .toolbar button{background:var(--vscode-button-background,#0e639c);color:var(--vscode-button-foreground,#fff);border:none;padding:4px 10px;cursor:pointer;font-size:12px;border-radius:2px;white-space:nowrap}
    .toolbar button:hover{background:var(--vscode-button-hoverBackground,#1177bb)}
    .toolbar label{font-size:12px;color:var(--vscode-editor-foreground,#ccc);white-space:nowrap}
    .toolbar input[type="range"]{width:90px}
    .toolbar .spacer{margin-left:auto}
    .toolbar .info{font-size:12px;opacity:0.7}
    #viewport{flex:1;overflow:hidden;position:relative;width:100%;cursor:grab;display:flex;align-items:flex-start;justify-content:flex-start}
    #viewport:active{cursor:grabbing}
    #content{transform-origin:0 0}
    #content svg,#content img{display:block;pointer-events:none}
    .no-preview{display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;width:100%;color:var(--vscode-descriptionForeground,#888);font-size:14px;gap:12px}
    .no-preview code{background:var(--vscode-textCodeBlock-background,#2d2d2d);padding:8px 16px;border-radius:4px;font-size:13px}
  </style>
  <title>Asymptote Preview</title>
</head>
<body>
  <div class="toolbar">
    <label for="zoom">Zoom:</label>
    <input type="range" id="zoom" min="0.1" max="5.0" step="0.05" value="${scale}">
    <span id="zoom-label">${Math.round(scale * 100)}%</span>
    <button id="fit-btn">Fit</button>
    <button id="reset-btn">Reset</button>
    <button id="rotate-cw">CW</button>
    <button id="rotate-ccw">CCW</button>
    <span class="spacer"></span>
    <span class="info">Asymptote Preview</span>
  </div>
  <div id="viewport">
    ${content
      ? `<div id="content" style="transform:translate(0px,0px) scale(${scale}) rotate(0deg)">${content}</div>`
      : '<div class="no-preview"><span>No preview available</span><span>Build the .asy file first</span><code>Asymptote Workshop: Build</code></div>'}
  </div>
  <script>
    (function() {
      var vscode = acquireVsCodeApi();
      var zoom = document.getElementById('zoom');
      var zoomLabel = document.getElementById('zoom-label');
      var viewport = document.getElementById('viewport');
      var fitBtn = document.getElementById('fit-btn');
      var resetBtn = document.getElementById('reset-btn');
      var rotCw = document.getElementById('rotate-cw');
      var rotCcw = document.getElementById('rotate-ccw');

      var scale = ${scale};
      var panX = 0, panY = 0, rotation = 0;
      var isDragging = false, startX = 0, startY = 0;
      var animTimer = null;
      var currentFrame = 0;

      function updateTransform() {
        var content = document.getElementById('content');
        if (content) {
          content.style.transform = 'translate(' + panX + 'px,' + panY + 'px) scale(' + scale + ') rotate(' + rotation + 'deg)';
        }
      }

      zoom.addEventListener('input', function() {
        scale = parseFloat(this.value);
        zoomLabel.textContent = Math.round(scale * 100) + '%';
        updateTransform();
      });

      viewport.addEventListener('wheel', function(e) {
        e.preventDefault();
        var dir = e.deltaY > 0 ? -0.1 : 0.1;
        scale = Math.max(0.1, Math.min(5.0, scale + dir));
        zoom.value = scale;
        zoomLabel.textContent = Math.round(scale * 100) + '%';
        updateTransform();
      }, { passive: false });

      viewport.addEventListener('mousedown', function(e) {
        if (e.target.closest('.toolbar')) return;
        isDragging = true;
        startX = e.clientX - panX;
        startY = e.clientY - panY;
      });

      window.addEventListener('mousemove', function(e) {
        if (!isDragging) return;
        panX = e.clientX - startX;
        panY = e.clientY - startY;
        updateTransform();
      });

      window.addEventListener('mouseup', function() { isDragging = false; });

      fitBtn.addEventListener('click', function() {
        var content = document.getElementById('content');
        if (!content) return;
        var child = content.firstElementChild;
        if (!child) return;
        var childW = child.getBoundingClientRect ? child.getBoundingClientRect().width : child.naturalWidth || child.width || content.scrollWidth;
        var parentW = viewport.clientWidth;
        if (childW > 0 && parentW > 0) {
          scale = Math.min(1.0, Math.max(0.1, (parentW - 40) / childW));
          scale = Math.round(scale * 100) / 100;
          zoom.value = scale;
          zoomLabel.textContent = Math.round(scale * 100) + '%';
          panX = 0; panY = 0; rotation = 0;
          updateTransform();
        }
      });

      resetBtn.addEventListener('click', function() {
        scale = 1.0; panX = 0; panY = 0; rotation = 0;
        zoom.value = scale;
        zoomLabel.textContent = '100%';
        updateTransform();
      });

      rotCw.addEventListener('click', function() { rotation = (rotation + 90) % 360; updateTransform(); });
      rotCcw.addEventListener('click', function() { rotation = ((rotation - 90) % 360 + 360) % 360; updateTransform(); });

      function startAnimation(frames, delay) {
        if (animTimer) { clearInterval(animTimer); animTimer = null; }
        var vp = document.getElementById('viewport');
        if (!vp) return;
        if (frames.length === 0) return;
        currentFrame = 0;
        vp.innerHTML = '<div id="content" style="transform:translate(0px,0px) scale(' + scale + ') rotate(0deg)"><img id="anim-frame" src="' + frames[0] + '" style="max-width:none;display:block"></div>';
        if (frames.length > 1) {
          animTimer = setInterval(function() {
            currentFrame = (currentFrame + 1) % frames.length;
            var img = document.getElementById('anim-frame');
            if (img) img.src = frames[currentFrame];
          }, delay);
        }
      }

      function showGif(gifBase64, scaleVal) {
        if (animTimer) { clearInterval(animTimer); animTimer = null; }
        var vp = document.getElementById('viewport');
        if (!vp) return;
        vp.innerHTML = '<div id="content" style="transform:translate(0px,0px) scale(' + scaleVal + ') rotate(0deg)"><img id="anim-frame" src="data:image/gif;base64,' + gifBase64 + '" style="max-width:none;display:block"></div>';
      }

      function showSvg(svgContent, scaleVal) {
        if (animTimer) { clearInterval(animTimer); animTimer = null; }
        var vp = document.getElementById('viewport');
        if (!vp) return;
        vp.innerHTML = '<div id="content" style="transform:translate(0px,0px) scale(' + scaleVal + ') rotate(0deg)">' + svgContent + '</div>';
      }

      function showNoPreview() {
        if (animTimer) { clearInterval(animTimer); animTimer = null; }
        var vp = document.getElementById('viewport');
        if (!vp) return;
        vp.innerHTML = '<div class="no-preview"><span>No preview available</span><span>Build the .asy file first</span><code>Asymptote Workshop: Build</code></div>';
      }

      window.addEventListener('message', function(event) {
        var msg = event.data;
        if (!msg) return;

        scale = msg.scale || 1.0;
        zoom.value = scale;
        zoomLabel.textContent = Math.round(scale * 100) + '%';
        panX = 0; panY = 0; rotation = 0;

        if (msg.type === 'update') {
          if (msg.svgContent) showSvg(msg.svgContent, scale);
          else showNoPreview();
        } else if (msg.type === 'animation') {
          if (msg.gifData) {
            showGif(msg.gifData, scale);
          } else if (msg.frames && msg.frames.length > 0) {
            startAnimation(msg.frames, msg.frameDelay || 100);
          } else {
            showNoPreview();
          }
        }
      });
    })();
  </script>
</body>
</html>`;
  }

  async preview(uri: vscode.Uri): Promise<void> {
    console.log('AsyWorkshop: preview() called', uri?.fsPath, 'panel exists:', !!this.panel);
    try {
      this.currentUri = uri;

      const svgPath = getOutputPath(uri.fsPath, 'svg');
      let svgContent = '';
      try {
        const data = await vscode.workspace.fs.readFile(
          vscode.Uri.file(svgPath)
        );
        svgContent = Buffer.from(data).toString('utf-8');
      } catch {
        svgContent = '';
      }

      const scale = getPreviewScale();
      const column = vscode.ViewColumn.Beside;

      if (this.panel) {
        this.panel.reveal(column);
        this.updatePanelContent(svgContent, scale);
      } else {
        this.panel = vscode.window.createWebviewPanel(
          'asyPreview',
          `Preview: ${uri.fsPath.split('/').pop() || uri.fsPath.split('\\').pop() || ''}`,
          column,
          {
            enableScripts: true,
            retainContextWhenHidden: true,
            localResourceRoots: [
              vscode.Uri.joinPath(this.extensionUri, 'media'),
            ],
          }
        );

        this.panel.iconPath = {
          light: vscode.Uri.joinPath(this.extensionUri, 'media', 'preview.svg'),
          dark: vscode.Uri.joinPath(this.extensionUri, 'media', 'preview.svg'),
        };

        const cleanSvg = svgContent ? stripXmlPreamble(svgContent) : '';
        this.panel.webview.html = this.getHtml(cleanSvg, scale);

        this.panel.onDidDispose(
          () => {
            this.panel = undefined;
          },
          null,
          this.disposables
        );
      }
    } catch (e) {
      console.error('Asymptote Workshop: preview() error', e);
    }
  }

  updatePanelContent(svgContent: string, scale: number): void {
    if (!this.panel) return;
    const cleanSvg = svgContent ? stripXmlPreamble(svgContent) : '';
    this.currentAnimation = undefined;
    this.panel.webview.postMessage({
      type: 'update',
      svgContent: cleanSvg,
      scale,
    });
  }

  showAnimation(data: AnimationData, scale: number): void {
    if (!this.panel) return;
    this.currentAnimation = data;
    this.panel.webview.postMessage({
      type: 'animation',
      frames: data.frames,
      gifData: data.gifData,
      frameDelay: data.frameDelay,
      scale,
    });
  }

  async refresh(): Promise<void> {
    if (!this.currentUri) return;
    const svgPath = getOutputPath(this.currentUri.fsPath, 'svg');
    let svgContent = '';
    try {
      const data = await vscode.workspace.fs.readFile(
        vscode.Uri.file(svgPath)
      );
      svgContent = Buffer.from(data).toString('utf-8');
    } catch {
      svgContent = '';
    }
    const scale = getPreviewScale();
    if (this.panel) {
      this.updatePanelContent(svgContent, scale);
    }
  }

  dispose(): void {
    if (this.panel) {
      this.panel.dispose();
      this.panel = undefined;
    }
    for (const d of this.disposables) {
      d.dispose();
    }
    this.disposables = [];
  }
}

export { PreviewManager, AnimationData };
