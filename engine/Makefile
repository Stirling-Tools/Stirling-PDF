.PHONY: help install check fix lint lint-fix lint-fix-unsafe format format-check typecheck test run run-dev clean tool-models docker-build docker-run

REPO_ROOT_DIR = ..
ROOT_DIR = .
VENV_DIR = $(ROOT_DIR)/.venv
DEPS_STAMP := $(VENV_DIR)/.deps-installed
NODE_DEPS_STAMP := node_modules/.deps-installed
TOOL_MODELS := $(CURDIR)/src/models/tool_models.py
FRONTEND_DIR := $(REPO_ROOT_DIR)/frontend
FRONTEND_TSX := $(FRONTEND_DIR)/node_modules/.bin/tsx

$(DEPS_STAMP): $(ROOT_DIR)/uv.lock $(ROOT_DIR)/pyproject.toml
	uv python install 3.13.8
	uv sync
	touch $(DEPS_STAMP)

$(NODE_DEPS_STAMP): package-lock.json
	npm ci
	touch $(NODE_DEPS_STAMP)

help:
	@echo "Engine commands:"
	@echo "  make install      - Install production dependencies"
	@echo "  make lint         - Run linting checks"
	@echo "  make format       - Format code"
	@echo "  make format-check - Show whether code is correctly formatted"
	@echo "  make typecheck    - Run type checking"
	@echo "  make test         - Run tests"
	@echo "  make run          - Run the Flask backend with gunicorn (production)"
	@echo "  make run-dev      - Run the Flask backend with dev server (development only)"
	@echo "  make tool-models  - Generate src/models/tool_models_*.py from frontend TypeScript tool defs"
	@echo "  make clean        - Clean up generated files"
	@echo "  make docker-build - Build Docker image"
	@echo "  make docker-run   - Run Docker container"

install: $(DEPS_STAMP) $(NODE_DEPS_STAMP)

check: typecheck lint format-check test

fix: lint-fix format

lint: install
	uv run ruff check .

lint-fix: install
	uv run ruff check . --fix

lint-fix-unsafe: install
	uv run ruff check . --fix --unsafe-fixes

format: install
	uv run ruff format .

format-check: install
	uv run ruff format . --diff

typecheck: install
	uv run pyright . --warnings

test: install
	uv run pytest tests

run: install
	cd src && PYTHONUNBUFFERED=1 uv run gunicorn --bind 0.0.0.0:5001 --workers 4 --timeout 120 --worker-class gthread --threads 4 app:app

run-dev: install
	cd src && PYTHONUNBUFFERED=1 uv run python app.py

frontend-deps:
	if [ ! -x "$(FRONTEND_TSX)" ]; then cd $(FRONTEND_DIR) && npm install; fi

tool-models: install frontend-deps
	uv run python scripts/generate_tool_models.py --output $(TOOL_MODELS)
	$(MAKE) fix

clean:
	rm -rf $(VENV_DIR) data logs output

docker-build:
	docker build -t stirling-pdf-engine .

docker-run:
	docker run -p 5001:5001 stirling-pdf-engine
