# Contributing

Thanks for your interest in Asymptote Workshop!

## Development Setup

```bash
git clone <repo-url>
cd AsymptoteWorkshop
npm install
```

## Build & Run

```bash
npm run compile       # TypeScript → out/
```

Press `F5` in VS Code to launch an Extension Development Host window.

## Package

```bash
npx @vscode/vsce package
```

## Project Structure

```
AsymptoteWorkshop/
├── src/                  # TypeScript source
│   ├── extension.ts      # Entry point and command registration
│   ├── builder.ts        # Build manager (spawn asy, status bar)
│   ├── previewer.ts      # Webview panel for preview
│   ├── exporter.ts       # Export to PDF/SVG/PNG/EPS
│   ├── animation.ts      # Animation pipeline (PNG frames → GIF)
│   ├── completion.ts     # Autocomplete provider
│   ├── symbols.ts        # Document symbols (outline)
│   ├── hover.ts          # Hover provider
│   ├── linter.ts         # Lint on save
│   └── utils.ts          # Shared helpers
├── syntaxes/             # TextMate grammar
├── snippets/             # Code snippets
├── media/                # Webview assets
├── test/                 # Test .asy files and verification
└── out/                  # Compiled JS (generated)
```

## Pull Requests

1. Fork the repo
2. Create a feature branch (`git checkout -b feature/foo`)
3. Commit your changes (`npm run compile` must pass)
4. Push and open a PR

## Guidelines

- Follow existing code style (TS strict, no unnecessary comments)
- Test manually with the Extension Development Host
- Keep the `.vscodeignore` up to date if adding files
