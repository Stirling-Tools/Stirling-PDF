# stirling-pdf (pip launcher)

Install and run Stirling PDF with pip:

```bash
pip install stirling-pdf
stirling-pdf run
```

What it does:

- **Docker available** (recommended): generates a compose file under
  `~/.stirling-pdf/`, pulls the official image, and starts it on
  `http://localhost:8080`. `--variant fat|ultra-lite` picks the image,
  `--docparse` also runs the AI engine with the DocParse addon (layout
  parsing, grounded extraction; ~1.6 GB one-time download onto a volume).
- **No Docker**: downloads the release jar and runs it with your local
  Java 21+ (`--no-docker` forces this path). The DocParse advanced tier is
  Docker-only; the jar still serves everything else.

Commands:

```bash
stirling-pdf run [--port 8080] [--variant latest|fat|ultra-lite] [--docparse] [--no-docker]
stirling-pdf status
stirling-pdf update
stirling-pdf stop
stirling-pdf addons install docparse
stirling-pdf addons remove docparse
```

State lives in `~/.stirling-pdf` (override with `STIRLING_PDF_HOME`). The
package has zero Python dependencies.

## Publishing (maintainers)

```bash
cd packaging/pip
python -m build
python -m twine upload dist/*
```
