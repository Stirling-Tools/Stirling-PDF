#!/usr/bin/env python3
"""Generate Python tool models from the Java backend's OpenAPI spec (SwaggerDoc.json).

Uses datamodel-code-generator to convert OpenAPI request schemas to Pydantic models.
Run via:
    task engine:tool-models
or directly:
    python engine/scripts/generate_tool_models.py --spec SwaggerDoc.json
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

from datamodel_code_generator import InputFileType, PythonVersion, generate
from datamodel_code_generator.enums import DataModelType
from datamodel_code_generator.format import Formatter

# Only tool endpoints under these path prefixes are included.
ALLOWED_PATH_PREFIXES = (
    "/api/v1/general/",
    "/api/v1/misc/",
    "/api/v1/security/",
    "/api/v1/convert/",
)

# Fields inherited from PDFFile base class — not tool parameters.
BASE_CLASS_FIELDS = frozenset({"fileInput", "fileId"})


# ---------------------------------------------------------------------------
# OpenAPI helpers
# ---------------------------------------------------------------------------


def _is_tool_endpoint(path: str) -> bool:
    if "{" in path:
        return False
    return any(path.startswith(prefix) for prefix in ALLOWED_PATH_PREFIXES)


def _resolve_ref(spec: dict[str, Any], ref: str) -> dict[str, Any]:
    parts = ref.lstrip("#/").split("/")
    node: Any = spec
    for part in parts:
        node = node[part]
    return node


def _collect_properties(spec: dict[str, Any], schema: dict[str, Any]) -> dict[str, Any]:
    if "$ref" in schema:
        schema = _resolve_ref(spec, schema["$ref"])
    if "allOf" in schema:
        merged: dict[str, Any] = {}
        for sub in schema["allOf"]:
            merged.update(_collect_properties(spec, sub))
        return merged
    return dict(schema.get("properties", {}))


def _get_request_schema(spec: dict[str, Any], path_item: dict[str, Any]) -> dict[str, Any] | None:
    post = path_item.get("post")
    if not post:
        return None
    content = post.get("requestBody", {}).get("content", {})
    for media_type in ("multipart/form-data", "application/json"):
        if media_type in content:
            return content[media_type].get("schema")
    return None


def _filter_properties(spec: dict[str, Any], properties: dict[str, Any]) -> dict[str, Any]:
    """Remove base-class fields and binary upload fields."""
    clean: dict[str, Any] = {}
    for name, prop in properties.items():
        if name in BASE_CLASS_FIELDS:
            continue
        resolved = prop
        if "$ref" in resolved:
            resolved = _resolve_ref(spec, resolved["$ref"])
        if resolved.get("type") == "string" and resolved.get("format") == "binary":
            continue
        clean[name] = resolved
    return clean


# ---------------------------------------------------------------------------
# Naming
# ---------------------------------------------------------------------------


def _path_to_enum_name(path: str) -> str:
    segment = path.rstrip("/").rsplit("/", 1)[-1]
    return segment.replace("-", "_").upper()


def _path_to_class_name(path: str) -> str:
    segment = path.rstrip("/").rsplit("/", 1)[-1]
    parts = segment.split("-")
    return "".join(p.capitalize() for p in parts) + "Params"


# ---------------------------------------------------------------------------
# Build combined schema and generate
# ---------------------------------------------------------------------------


class ToolSpec:
    def __init__(self, path: str, enum_name: str, class_name: str):
        self.path = path
        self.enum_name = enum_name
        self.class_name = class_name


def discover_tools(spec: dict[str, Any]) -> tuple[list[ToolSpec], dict[str, Any]]:
    """Extract tool endpoints and build a combined JSON Schema with all models as $defs."""
    tools: list[ToolSpec] = []
    defs: dict[str, Any] = {}
    used_enum: set[str] = set()
    used_class: set[str] = set()

    for path, path_item in sorted(spec.get("paths", {}).items()):
        if not _is_tool_endpoint(path):
            continue
        schema = _get_request_schema(spec, path_item)
        if schema is None:
            continue
        properties = _collect_properties(spec, schema)
        if not properties:
            continue
        clean_props = _filter_properties(spec, properties)
        if not clean_props:
            continue

        enum_name = _path_to_enum_name(path)
        class_name = _path_to_class_name(path)

        # Deduplicate
        base = enum_name
        n = 2
        while enum_name in used_enum:
            enum_name = f"{base}_{n}"
            n += 1
        used_enum.add(enum_name)

        base = class_name
        n = 2
        while class_name in used_class:
            class_name = f"{base[:-6]}{n}Params"
            n += 1
        used_class.add(class_name)

        defs[class_name] = {
            "type": "object",
            "properties": clean_props,
        }
        tools.append(ToolSpec(path, enum_name, class_name))

    # Build a combined schema with anyOf referencing all models
    combined_schema: dict[str, Any] = {
        "$defs": defs,
        "anyOf": [{"$ref": f"#/$defs/{t.class_name}"} for t in tools],
    }
    return tools, combined_schema


_FILE_HEADER = (
    "# AUTO-GENERATED FILE. DO NOT EDIT.\n"
    "# Generated by scripts/generate_tool_models.py from Java OpenAPI spec (SwaggerDoc.json).\n"
    "# ruff: noqa: E501"
)

_ENGINE_ROOT = Path(__file__).resolve().parents[1]


def generate_models_code(combined_schema: dict[str, Any]) -> str:
    """Run datamodel-code-generator once on the combined schema."""
    schema_json = json.dumps(combined_schema, sort_keys=True)
    code = generate(
        input_=schema_json,
        input_file_type=InputFileType.JsonSchema,
        output_model_type=DataModelType.PydanticV2BaseModel,
        target_python_version=PythonVersion.PY_313,
        snake_case_field=True,
        use_field_description=False,
        use_schema_description=False,
        base_class="stirling.models.base.ApiModel",
        field_constraints=True,
        no_alias=True,
        set_default_enum_member=True,
        enable_version_header=False,
        custom_file_header=_FILE_HEADER,
        formatters=[Formatter.RUFF_FORMAT, Formatter.RUFF_CHECK],
        settings_path=_ENGINE_ROOT / "pyproject.toml",
    )
    return str(code or "")


def write_output(out_path: Path, tools: list[ToolSpec], models_code: str) -> None:
    union_lines = ["type ParamToolModel = ("]
    for i, tool in enumerate(tools):
        prefix = "    | " if i > 0 else "    "
        union_lines.append(f"{prefix}{tool.class_name}")
    union_lines.append(")")
    union_lines.append("type ParamToolModelType = type[ParamToolModel]")

    enum_lines = [
        "class ToolEndpoint(StrEnum):",
        *(f'    {tool.enum_name} = "{tool.path}"' for tool in tools),
    ]

    ops_lines = [
        "OPERATIONS: dict[ToolEndpoint, ParamToolModelType] = {",
        *(f"    ToolEndpoint.{tool.enum_name}: {tool.class_name}," for tool in tools),
        "}",
    ]

    parts = [
        models_code,
        "\n",
        *union_lines,
        "\n",
        *enum_lines,
        "\n",
        *ops_lines,
        "",
    ]
    out_path.write_text("\n".join(parts), encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate Python tool models from Java OpenAPI spec")
    parser.add_argument("--spec", default="", help="Path to SwaggerDoc.json")
    parser.add_argument("--output", default="", help="Path to output tool_models.py")
    args = parser.parse_args()

    repo_root = Path(__file__).resolve().parents[1]  # engine/
    project_root = repo_root.parent

    spec_path = Path(args.spec) if args.spec else project_root / "SwaggerDoc.json"
    if not spec_path.exists():
        print(f"ERROR: OpenAPI spec not found at {spec_path}")
        print("Run './gradlew generateOpenApiDocs' first to generate SwaggerDoc.json")
        raise SystemExit(1)

    output_path = Path(args.output) if args.output else repo_root / "src/stirling/models/tool_models.py"

    with open(spec_path) as f:
        spec = json.load(f)

    tools, combined_schema = discover_tools(spec)
    models_code = generate_models_code(combined_schema)
    write_output(output_path, tools, models_code)

    print(f"Generated {len(tools)} tool models from {spec_path.name}")
    for tool in tools:
        print(f"  {tool.enum_name}: {tool.path} → {tool.class_name}")


if __name__ == "__main__":
    main()
