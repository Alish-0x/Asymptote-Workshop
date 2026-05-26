# Asymptote Workshop

Build, preview, and export [Asymptote](https://asymptote.sourceforge.io/) (`.asy`) vector graphics directly from VS Code.

## Features

- **Build** — Compile `.asy` files with `asy` CLI (Ctrl+Alt+B, or save with auto-build)
- **Live Preview** — Side-panel SVG preview with pan, zoom, rotate, and fit (Ctrl+Alt+V)
- **Animation Support** — Auto-detect `import animation;` and preview frame sequences
- **Export** — Export to PDF, SVG, PNG, or EPS via context menu or command palette
- **Build Recipes** — Switch between SVG, PDF, PNG, and 3D render presets
- **Problems Panel** — Clickable error links pointing to file + line + column
- **Outline View** — Document symbols (imports, structs, functions, variables)
- **Hover Docs** — Inline documentation for built-in functions and colors
- **Lint on Save** — Optional syntax checking without output (Ctrl+Alt+L)
- **Snippets** — 12 Asymptote snippets for common patterns
- **Autocomplete** — Function names, module names, and color names
- **Status Bar** — Current recipe + build status (click to build or change recipe)
- **Kill Build** — Cancel a running build if it's stuck or taking too long
- **Install Asymptote** — Auto-detect platform and install `asy` via apt, dnf, brew, winget, etc.

## Requirements

- **Asymptote** (`asy` CLI) installed and on `PATH`. Test with `asy --version`.
  - If missing, use the **Install Asymptote** command (Linux/macOS/Windows package managers supported).
- **VS Code** ^1.85.0
- **ImageMagick** (optional) — for GIF creation from animation frames

## Commands

| Command | Keybinding | Description |
|---------|-----------|-------------|
| `Asymptote Workshop: Build` | Ctrl+Alt+B | Build current file |
| `Asymptote Workshop: Preview SVG` | Ctrl+Alt+V | Preview current SVG |
| `Asymptote Workshop: Build with recipe...` | — | Choose output format/3D preset |
| `Asymptote Workshop: Build animation` | — | Build animation (PNG frames) |
| `Asymptote Workshop: Lint` | Ctrl+Alt+L | Syntax check without output |
| `Asymptote Workshop: Export as PDF/SVG/PNG/EPS` | — | Export in chosen format |
| `Asymptote Workshop: Install Asymptote` | — | Install `asy` via system package manager |
| `Asymptote Workshop: Kill current build` | — | Cancel a running build |
| `Asymptote Workshop: Clean auxiliary files` | — | Remove logs and temp files |
| `Asymptote Workshop: View build log` | — | Show the build output channel |
| `Asymptote Workshop: Toggle auto build on save` | — | Toggle automatic builds |

## Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `asy-workshop.command` | `asy` | Path to Asymptote executable |
| `asy-workshop.autoBuildOnSave` | `true` | Build automatically on save |
| `asy-workshop.autoOpenPreview` | `true` | Open preview on successful build |
| `asy-workshop.outputFormat` | `svg` | Default output format |
| `asy-workshop.buildArgs` | `[]` | Extra CLI args for `asy` |
| `asy-workshop.previewScale` | `1` | Default preview zoom |
| `asy-workshop.showBuildLog` | `false` | Show output channel on build |
| `asy-workshop.lintOnSave` | `false` | Lint on save |

## Keyboard Shortcuts

- **Ctrl+Alt+B** — Build
- **Ctrl+Alt+V** — Preview
- **Ctrl+Alt+L** — Lint

## How to Cite

If you use Asymptote Workshop in your research or projects:

```bibtex
@software{alish_asymptote_workshop_2026,
  author = {Alish, 0x},
  title = {Asymptote Workshop — VS Code extension for Asymptote vector graphics},
  version = {0.1.0},
  year = {2026},
  url = {https://github.com/Alish-0x/Asymptote-Workshop}
}
```

Or cite the [`CITATION.cff`](CITATION.cff) file directly — GitHub renders it automatically on the repo homepage.

## License

[MIT](LICENSE)
