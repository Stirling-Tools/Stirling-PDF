# Stirling AI Engine Guide

This file is for AI agents working in `engine/`.

The engine is a Python reasoning service for Stirling. It plans and interprets work, but it does not own durable state, and it does not execute Stirling PDF operations directly. Keep the service narrow: typed contracts in, typed contracts out, with AI only where it adds reasoning value.

## Commands

All engine commands can be run from the repository root using Task:

- `task engine:check` — run all checks (typecheck + lint + format-check + test)
- `task engine:fix` — auto-fix lint + formatting
- `task engine:install` — install Python dependencies via uv
- `task engine:dev` — start FastAPI with hot reload (localhost:5001)
- `task engine:test` — run pytest
- `task engine:lint` — run ruff linting
- `task engine:typecheck` — run pyright
- `task engine:format` — format code with ruff
- `task engine:tool-models` — generate tool_models.py from frontend TypeScript defs

## Code Style

- Keep `task engine:check` passing.
- Use modern Python when it improves clarity.
- Prefer explicit names to cleverness.
- Avoid nested functions and nested classes unless the language construct requires them.
- Prefer composition to inheritance when combining concepts.
- Avoid speculative abstractions. Add a layer only when it removes real duplication or clarifies lifecycle.
- Add comments sparingly and only when they explain non-obvious intent.

### Typing and Models

- Deserialize into Pydantic models as early as possible.
- Serialize from Pydantic models as late as possible.
- Do not pass raw `dict[str, Any]` or `dict[str, object]` across important boundaries when a typed model can exist instead.
- Avoid `Any` wherever possible.
- Avoid `cast()` wherever possible (reconsider the structure first).
- All shared models should subclass `stirling.models.ApiModel` so the service behaves consistently.
- Do not use string literals for any type annotations, including `cast()`.

### Configuration

- Keep application-owned configuration in `stirling.config`.
- Only add `STIRLING_*` environment variables that the engine itself truly owns.
- Do not mirror third-party provider environment variables unless the engine is actually interpreting them.
- Let `pydantic-ai` own provider authentication configuration when possible.

## Architecture

### Package Roles

- `stirling.contracts`: request/response models and shared typed workflow contracts. If a shape crosses a module or service boundary, it probably belongs here.
- `stirling.models`: shared model primitives and generated tool models.
- `stirling.agents`: reasoning modules for individual capabilities.
- `stirling.api`: HTTP layer, dependency access, and app startup wiring.
- `stirling.services`: shared runtime and non-AI infrastructure.
- `stirling.config`: application-owned settings.

### Source Of Truth

- `stirling.models.tool_models` is the source of truth for operation IDs and parameter models.
- Do not duplicate operation lists if they can be derived from `tool_models.OPERATIONS`.
- Do not hand-maintain parallel parameter schemas when the generated tool models already define them.
- If a tool ID must match a parameter model, validate that relationship explicitly in code.

### Boundaries

- Keep the API layer thin. Route modules should bind requests, resolve dependencies, and call agents or services. They should not contain business logic.
- Keep agents focused on one reasoning domain. They should not own FastAPI routing, persistence, or execution of Stirling operations.
- Build long-lived runtime objects centrally at startup when possible rather than reconstructing heavy AI objects per request.
- If an agent delegates to another agent, the delegated agent should remain the source of truth for its own domain output.

## AI Usage

- The system must work with any AI, including self-hosted models. We require that the models support structured outputs, but should minimise model-specific code beyond that.
- Use AI for reasoning-heavy outputs, not deterministic glue.
- Do not ask the model to invent data that Python can derive safely.
- Do not fabricate fallback user-facing copy in code to hide incomplete model output.
- AI output schemas should be impossible to instantiate incorrectly.
  - Do not require the model to keep separate structures in sync. For example, instead of generating two lists which must be the same length, generate one list of a model containing the same data.
  - Prefer Python to derive deterministic follow-up structure from a valid AI result.
- Use `NativeOutput(...)` for structured model outputs.
- Use `ToolOutput(...)` when the model should select and call delegate functions.

## Testing

- Test contracts directly.
- Test agents directly where behaviour matters.
- Test API routes as thin integration points.
- Prefer dependency overrides or startup-state seams to monkeypatching random globals.
