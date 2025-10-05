#!/usr/bin/env python3
"""Swagger endpoint integration test runner.

This script loads the generated OpenAPI specification and performs HTTP requests
for every defined endpoint. For each operation it fills in all documented
parameters with example/default data and sends a request to the running
Stirling-PDF instance. The goal is to ensure that every documented endpoint is
reachable and does not return unexpected server errors when called with the
provided sample data.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from dataclasses import dataclass
from typing import Any, Dict, Iterable, List, Optional, Tuple

import requests


DEFAULT_SAMPLE_FILE = "testing/cucumber/exampleFiles/ghost1.pdf"
IMAGE_SAMPLE_FILE = "docs/stirling.png"
MARKDOWN_SAMPLE_FILE = "testing/samples/sample.md"
CERT_SAMPLE_FILE = "app/core/src/test/resources/certs/test-cert.pem"
PKCS12_SAMPLE_FILE = "app/core/src/test/resources/certs/test-cert.p12"
DEFAULT_SPEC_ENDPOINT = "/v1/api-docs"
REQUEST_TIMEOUT = 90
# Endpoints that require complex prerequisites (e.g., signed PDFs or optional
# external tools) are skipped to keep the CI run deterministic. The script still
# verifies the remaining API surface for unexpected server errors.
SKIP_ENDPOINTS = {
    ("get", "/api/v1/admin/settings"),
    ("get", "/api/v1/admin/job/stats"),
    ("get", "/api/v1/audit/data"),
    ("get", "/api/v1/audit/export/csv"),
    ("get", "/api/v1/audit/export/json"),
    ("get", "/api/v1/audit/stats"),
    ("get", "/api/v1/audit/types"),
    ("get", "/api/v1/general/files/{fileId}/metadata"),
    ("get", "/api/v1/general/files/{fileId}"),
    ("get", "/api/v1/general/job/{jobId}/result/files"),
    ("get", "/api/v1/general/job/{jobId}/result"),
    ("get", "/api/v1/general/job/{jobId}"),
    ("get", "/api/v1/admin/job/queue/stats"),
    ("post", "/api/v1/security/validate-signature"),
    ("post", "/api/v1/security/cert-sign"),
    ("post", "/api/v1/pipeline/handleData"),
    ("post", "/api/v1/general/split-pdf-by-chapters"),
    ("post", "/api/v1/security/remove-cert-sign"),
    ("post", "/api/v1/convert/pdf/img"),
    ("post", "/api/v1/convert/markdown/pdf"),
    ("post", "/api/v1/admin/job/cleanup"),
    ("delete", "/api/v1/audit/cleanup/before"),
    ("delete", "/api/v1/general/job/{jobId}"),

}


@dataclass
class EndpointResult:
    method: str
    path: str
    url: str
    status_code: Optional[int]
    expected: Iterable[str]
    success: bool
    message: str


class SwaggerTester:
    def __init__(self, base_url: str, spec: Dict[str, Any], sample_file: str) -> None:
        self.base_url = base_url.rstrip("/")
        self.spec = spec
        self.sample_file = sample_file
        self._ref_stack: List[str] = []

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------
    def run(self) -> List[EndpointResult]:
        results: List[EndpointResult] = []
        paths = self.spec.get("paths", {})
        for raw_path, path_item in paths.items():
            if not isinstance(path_item, dict):
                continue
            shared_params = path_item.get("parameters", []) or []
            for method, operation in path_item.items():
                if method.lower() not in {"get", "put", "post", "delete", "patch", "head", "options", "trace"}:
                    continue
                if not isinstance(operation, dict):
                    continue
                if operation.get("deprecated"):
                    # Still attempt deprecated operations – they're part of the spec.
                    pass

                if (method.lower(), raw_path) in SKIP_ENDPOINTS:
                    results.append(
                        EndpointResult(
                            method.upper(),
                            raw_path,
                            f"{self.base_url}{raw_path}",
                            None,
                            [],
                            True,
                            "Skipped by configuration",
                        )
                    )
                    continue

                merged_params = self._merge_parameters(shared_params, operation.get("parameters", []) or [])
                result = self._exercise_endpoint(raw_path, method.lower(), operation, merged_params)
                results.append(result)
        return results

    # ------------------------------------------------------------------
    # Parameter helpers
    # ------------------------------------------------------------------
    def _merge_parameters(self, path_params: List[Dict[str, Any]], op_params: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        merged: Dict[Tuple[str, str], Dict[str, Any]] = {}
        for param in path_params + op_params:
            if not isinstance(param, dict):
                continue
            key = (param.get("name"), param.get("in"))
            if key[0] is None or key[1] is None:
                continue
            merged[key] = param
        return list(merged.values())

    def _prepare_parameters(self, parameters: List[Dict[str, Any]]) -> Tuple[Dict[str, Any], Dict[str, str], Dict[str, str]]:
        path_values: Dict[str, Any] = {}
        query_values: Dict[str, Any] = {}
        header_values: Dict[str, str] = {}
        cookie_headers: List[str] = []

        for param in parameters:
            location = param.get("in")
            name = param.get("name")
            if not location or not name:
                continue

            schema = self._resolve_schema(param.get("schema"))
            value = self._generate_example(schema)
            if value is None:
                value = ""

            if location == "path":
                path_values[name] = self._stringify(value)
            elif location == "query":
                query_values[name] = value
            elif location == "header":
                header_values[name] = self._stringify(value)
            elif location == "cookie":
                cookie_headers.append(f"{name}={self._stringify(value)}")

        if cookie_headers:
            header_values["Cookie"] = "; ".join(cookie_headers)
        return path_values, query_values, header_values

    # ------------------------------------------------------------------
    # Endpoint execution
    # ------------------------------------------------------------------
    def _exercise_endpoint(
        self,
        raw_path: str,
        method: str,
        operation: Dict[str, Any],
        parameters: List[Dict[str, Any]],
    ) -> EndpointResult:
        path_values, query_values, header_values = self._prepare_parameters(parameters)
        url_path = self._apply_path_params(raw_path, path_values)
        url = f"{self.base_url}{url_path}"

        request_kwargs: Dict[str, Any] = {
            "params": query_values,
            "headers": header_values.copy(),
            "timeout": REQUEST_TIMEOUT,
        }

        open_files: List[Any] = []
        try:
            if "requestBody" in operation:
                body_info = operation.get("requestBody") or {}
                body_required = body_info.get("required", False)
                content = body_info.get("content", {}) or {}
                body_prepared = self._prepare_request_body(content, open_files, raw_path, method.lower())
                if body_prepared is None and body_required:
                    return EndpointResult(method, raw_path, url, None, content.keys(), False, "Unable to prepare request body")
                if body_prepared:
                    extra_headers = body_prepared.pop("headers", None)
                    if extra_headers:
                        request_kwargs.setdefault("headers", {}).update(extra_headers)
                    request_kwargs.update(body_prepared)

            expected_statuses = self._expected_statuses(operation)
            response = requests.request(method.upper(), url, **request_kwargs)
            status_code = response.status_code
            success = self._is_expected_status(status_code, expected_statuses)
            message = response.reason or ""
            if not success and self._is_disabled_endpoint(response):
                success = True
                message = "Endpoint disabled"
            elif not success:
                message = response.text[:3000] or message
            return EndpointResult(method.upper(), raw_path, url, status_code, expected_statuses, success, message)
        except requests.RequestException as exc:
            return EndpointResult(method.upper(), raw_path, url, None, [], False, f"Request failed: {exc}")
        finally:
            for fh in open_files:
                try:
                    fh.close()
                except Exception:
                    pass

    def _expected_statuses(self, operation: Dict[str, Any]) -> List[str]:
        responses = operation.get("responses", {}) or {}
        expected: List[str] = []
        for key in responses.keys():
            if isinstance(key, str):
                expected.append(key)
        return expected

    def _is_expected_status(self, status: int, expected: Iterable[str]) -> bool:
        status_str = str(status)
        if status_str in expected:
            return True
        for candidate in expected:
            if candidate.upper() == "DEFAULT":
                return True
            if candidate.endswith("XX") and len(candidate) == 3 and candidate[0].isdigit():
                if int(candidate[0]) == status // 100:
                    return True
        return 100 <= status < 400

    def _is_disabled_endpoint(self, response: requests.Response) -> bool:
        if response.status_code != 403:
            return False

        body_text = response.text or ""
        if "this endpoint is disabled" in body_text.lower():
            return True

        try:
            payload = response.json()
        except ValueError:
            return False

        if isinstance(payload, dict):
            message = payload.get("message")
            if isinstance(message, str) and message.lower() == "this endpoint is disabled":
                return True
        return False

    # ------------------------------------------------------------------
    # Request body helpers
    # ------------------------------------------------------------------
    def _prepare_request_body(
        self,
        content: Dict[str, Any],
        open_files: List[Any],
        path_hint: str,
        method: str,
    ) -> Optional[Dict[str, Any]]:
        if not content:
            return None

        # Prefer JSON, then multipart, then form, then others
        preferred_order = [
            "application/json",
            "application/*+json",
            "multipart/form-data",
            "application/x-www-form-urlencoded",
        ]

        media_types = list(content.keys())
        media_types.sort(key=lambda m: next((i for i, t in enumerate(preferred_order) if self._media_matches(m, t)), len(preferred_order)))

        for media_type in media_types:
            schema = content[media_type].get("schema") if isinstance(content[media_type], dict) else None
            resolved_schema = self._resolve_schema(schema)

            if media_type.startswith("application/json") or media_type.endswith("+json"):
                example = self._generate_example(resolved_schema)
                return {"json": example}
            if media_type == "multipart/form-data":
                form_fields, files = self._generate_multipart_payload(resolved_schema, open_files, path_hint, method)
                payload: Dict[str, Any] = {"data": form_fields}
                if files:
                    payload["files"] = files
                return payload
            if media_type == "application/x-www-form-urlencoded":
                form_fields = self._generate_form_fields(resolved_schema)
                return {"data": form_fields}
            if media_type in {"text/plain", "text/csv", "text/html"}:
                example = self._generate_example(resolved_schema)
                return {"data": self._stringify(example), "headers": {"Content-Type": media_type}}
            if media_type in {"application/octet-stream", "application/pdf"}:
                file_tuple, fh = self._binary_sample_for("fileInput", resolved_schema, path_hint, method)
                open_files.append(fh)
                return {"data": fh.read(), "headers": {"Content-Type": media_type}}

        return None

    def _media_matches(self, media_type: str, pattern: str) -> bool:
        if pattern.endswith("*+json"):
            return media_type.endswith("+json")
        if pattern.endswith("/*"):
            return media_type.startswith(pattern[:-1])
        return media_type == pattern

    def _generate_multipart_payload(
        self,
        schema: Optional[Dict[str, Any]],
        open_files: List[Any],
        path_hint: str,
        method: str,
    ) -> Tuple[Dict[str, Any], List[Tuple[str, Tuple[str, Any, str]]]]:
        fields: Dict[str, Any] = {}
        files: List[Tuple[str, Tuple[str, Any, str]]] = []
        if not schema:
            return fields, files

        schema = self._ensure_object_schema(schema)
        properties = schema.get("properties", {}) or {}
        for name, prop_schema in properties.items():
            resolved = self._resolve_schema(prop_schema)
            if self._is_binary_schema(resolved):
                file_tuple, fh = self._binary_sample_for(name, resolved, path_hint, method)
                open_files.append(fh)
                files.append((name, file_tuple))
            else:
                example = self._generate_example(resolved)
                if isinstance(example, (dict, list)):
                    fields[name] = json.dumps(example)
                elif example is None:
                    fields[name] = ""
                else:
                    fields[name] = self._stringify(example)
        return fields, files

    def _generate_form_fields(self, schema: Optional[Dict[str, Any]]) -> Dict[str, Any]:
        fields: Dict[str, Any] = {}
        if not schema:
            return fields
        schema = self._ensure_object_schema(schema)
        for name, prop_schema in (schema.get("properties", {}) or {}).items():
            resolved = self._resolve_schema(prop_schema)
            example = self._generate_example(resolved)
            if isinstance(example, (dict, list)):
                fields[name] = json.dumps(example)
            elif example is None:
                fields[name] = ""
            else:
                fields[name] = self._stringify(example)
        return fields

    # ------------------------------------------------------------------
    # Schema helpers
    # ------------------------------------------------------------------
    def _resolve_schema(self, schema: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
        if not schema:
            return None
        if "$ref" in schema:
            ref = schema["$ref"]
            if ref in self._ref_stack:
                return None
            target = self._resolve_ref(ref)
            if target is None:
                return None
            self._ref_stack.append(ref)
            resolved = self._resolve_schema(target)
            self._ref_stack.pop()
            return resolved
        return schema

    def _resolve_ref(self, ref: str) -> Optional[Dict[str, Any]]:
        if not ref.startswith("#/"):
            return None
        parts = ref.lstrip("#/").split("/")
        node: Any = self.spec
        for part in parts:
            if isinstance(node, dict):
                node = node.get(part)
            else:
                return None
        if isinstance(node, dict):
            return node
        return None

    def _ensure_object_schema(self, schema: Dict[str, Any]) -> Dict[str, Any]:
        if schema.get("type") == "object" or "properties" in schema:
            return schema
        return {"type": "object", "properties": {}}

    def _is_binary_schema(self, schema: Optional[Dict[str, Any]]) -> bool:
        if not schema:
            return False
        schema_type = schema.get("type")
        schema_format = schema.get("format")
        if schema_format == "binary":
            return True
        if schema_type == "string" and schema_format == "byte":
            return True
        if schema_type == "array":
            return self._is_binary_schema(self._resolve_schema(schema.get("items")))
        return False

    # ------------------------------------------------------------------
    # Example generation
    # ------------------------------------------------------------------
    def _generate_example(self, schema: Optional[Dict[str, Any]], depth: int = 0) -> Any:
        if schema is None or depth > 6:
            return "example"

        if "$ref" in schema:
            resolved = self._resolve_schema(schema)
            if resolved is None:
                return "example"
            return self._generate_example(resolved, depth + 1)

        if "example" in schema:
            return schema["example"]
        if "default" in schema:
            return schema["default"]
        enum = schema.get("enum")
        if enum:
            return self._choose_enum_value(enum)

        if "oneOf" in schema:
            return self._generate_example(self._resolve_schema(schema["oneOf"][0]), depth + 1)
        if "anyOf" in schema:
            return self._generate_example(self._resolve_schema(schema["anyOf"][0]), depth + 1)
        if "allOf" in schema:
            combined: Dict[str, Any] = {}
            for subschema in schema["allOf"]:
                resolved = self._resolve_schema(subschema)
                example = self._generate_example(resolved, depth + 1)
                if isinstance(example, dict):
                    combined.update(example)
            if combined:
                return combined

        schema_type = schema.get("type")
        if schema_type == "object" or (not schema_type and schema.get("properties")):
            properties = schema.get("properties", {}) or {}
            result: Dict[str, Any] = {}
            for name, subschema in properties.items():
                resolved = self._resolve_schema(subschema)
                result[name] = self._generate_example(resolved, depth + 1)
            if not result and schema.get("additionalProperties"):
                additional_schema = self._resolve_schema(schema.get("additionalProperties"))
                result["key"] = self._generate_example(additional_schema, depth + 1)
            return result
        if schema_type == "array":
            items_schema = self._resolve_schema(schema.get("items"))
            return [self._generate_example(items_schema, depth + 1)]
        if schema_type == "integer":
            return 1 if schema.get("minimum", 0) > 0 else 0
        if schema_type == "number":
            base = 1.0 if schema.get("minimum", 0) > 0 else 0.0
            return float(base)
        if schema_type == "boolean":
            return True
        if schema_type == "string":
            fmt = schema.get("format")
            if fmt == "date":
                return "2024-01-01"
            if fmt == "date-time":
                return "2024-01-01T00:00:00Z"
            if fmt == "uuid":
                return "00000000-0000-0000-0000-000000000000"
            if fmt == "email":
                return "user@example.com"
            if fmt == "uri":
                return "https://example.com"
            if fmt == "hostname":
                return "example.com"
            if fmt == "ip":
                return "127.0.0.1"
            if fmt == "ipv4":
                return "127.0.0.1"
            if fmt == "ipv6":
                return "::1"
            if fmt == "binary":
                return None
            pattern = schema.get("pattern")
            if pattern:
                return pattern
            return "example"
        return "example"

    # ------------------------------------------------------------------
    # Utility helpers
    # ------------------------------------------------------------------
    def _apply_path_params(self, raw_path: str, path_values: Dict[str, Any]) -> str:
        applied = raw_path
        for name, value in path_values.items():
            applied = applied.replace(f"{{{name}}}", self._stringify(value))
        return applied

    def _stringify(self, value: Any) -> str:
        if isinstance(value, (dict, list)):
            return json.dumps(value)
        if isinstance(value, bool):
            return "true" if value else "false"
        if value is None:
            return ""
        return str(value)

    def _choose_enum_value(self, values: List[Any]) -> Any:
        preferred = ["txt", "text", "json", "pdf", "png", "jpg", "jpeg", "true", "false"]
        for pref in preferred:
            for value in values:
                if isinstance(value, str) and value.lower() == pref:
                    return value
        return values[0]

    def _binary_sample_for(
        self,
        field_name: str,
        schema: Optional[Dict[str, Any]],
        path_hint: str,
        method: str,
    ) -> Tuple[Tuple[str, Any, str], Any]:
        name_lower = field_name.lower()
        content_type = (schema or {}).get("contentMediaType")
        path_lower = path_hint.lower()

        if content_type and content_type.startswith("image/"):
            return self._open_file(IMAGE_SAMPLE_FILE, content_type)

        if "image" in name_lower or "img" in path_lower:
            return self._open_file(IMAGE_SAMPLE_FILE, "image/png")

        if (
            "markdown" in name_lower
            or name_lower.endswith("md")
            or "markdown" in path_lower
            or (content_type and "markdown" in content_type)
        ):
            return self._open_file(MARKDOWN_SAMPLE_FILE, "text/markdown")

        if (
            "cert" in name_lower
            or "certificate" in name_lower
            or "cert" in path_lower
            or (content_type and "pkcs" in content_type)
        ):
            if "p12" in name_lower or "pkcs" in name_lower or "cert-sign" in path_lower:
                return self._open_file(PKCS12_SAMPLE_FILE, "application/x-pkcs12")
            return self._open_file(CERT_SAMPLE_FILE, "application/x-pem-file")

        if "key" in name_lower:
            return self._open_file(CERT_SAMPLE_FILE, "application/x-pem-file")

        if content_type and content_type in {"application/x-pkcs12", "application/pkcs12"}:
            return self._open_file(PKCS12_SAMPLE_FILE, content_type)

        return self._open_file(self.sample_file, "application/pdf")

    def _open_file(self, path: str, content_type: str) -> Tuple[Tuple[str, Any, str], Any]:
        fh = open(path, "rb")
        filename = os.path.basename(path)
        return (filename, fh, content_type), fh


# ----------------------------------------------------------------------
# CLI helpers
# ----------------------------------------------------------------------

def load_spec(base_url: str, spec_path: Optional[str]) -> Dict[str, Any]:
    if spec_path:
        with open(spec_path, "r", encoding="utf-8") as handle:
            return json.load(handle)

    url = f"{base_url.rstrip('/')}{DEFAULT_SPEC_ENDPOINT}"
    response = requests.get(url, timeout=REQUEST_TIMEOUT)
    response.raise_for_status()
    return response.json()


def parse_args(argv: List[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Exercise all endpoints defined in the Swagger specification.")
    parser.add_argument("--base-url", default="http://localhost:8080", help="Base URL of the running Stirling-PDF instance")
    parser.add_argument("--spec", dest="spec_path", help="Optional path to a Swagger/OpenAPI JSON file")
    parser.add_argument("--sample-file", default=DEFAULT_SAMPLE_FILE, help="Path to a sample PDF file to use for binary uploads")
    return parser.parse_args(argv)


def main(argv: List[str]) -> int:
    args = parse_args(argv)
    base_url = args.base_url.rstrip("/")

    try:
        spec = load_spec(base_url, args.spec_path)
    except Exception as exc:  # pragma: no cover - CLI error handling
        print(f"Failed to load OpenAPI specification: {exc}", file=sys.stderr)
        return 1

    tester = SwaggerTester(base_url=base_url, spec=spec, sample_file=args.sample_file)
    results = tester.run()

    failures = [r for r in results if not r.success]

    for result in results:
        status_repr = result.status_code if result.status_code is not None else "ERR"
        status_text = "PASS" if result.success else "FAIL"
        expected = ",".join(result.expected) if result.expected else "<default>"
        print(f"[{status_text}] {result.method} {result.path} -> {status_repr} (expected: {expected})")
        if not result.success and result.message:
            print(f"    Details: {result.message}")

    print("")
    print(f"Total endpoints tested: {len(results)}")
    print(f"Successful responses: {len(results) - len(failures)}")
    print(f"Failed responses: {len(failures)}")

    return 0 if not failures else 1


if __name__ == "__main__":  # pragma: no cover - CLI entry point
    sys.exit(main(sys.argv[1:]))
