#!/usr/bin/env python3
"""
Swagger endpoint integration test runner.

This script provides an automated integration test runner for OpenAPI/Swagger endpoints.
It exercises all endpoints defined in an OpenAPI specification, supporting parallel requests,
automatic retries, timeouts, and dynamic request generation based on schema examples, defaults,
and enums. It can operate in strict mode (only documented responses are accepted as success),
and supports filtering by tags or path regex, as well as dynamic skipping of endpoints.

Features:
- Parallel execution of endpoint requests with configurable concurrency.
- Automatic retries and timeouts for HTTP requests.
- Uses schema examples, defaults, and enums to generate request parameters and bodies.
- Supports multipart, form, JSON, and binary request bodies.
- Optional strict mode: only documented responses (or default/xXX) are considered success.
- Tag and path filtering, as well as dynamic skips for endpoints.
- Supports Bearer and custom authentication headers.
- Loads OpenAPI spec from file or from a running server's /v1/api-docs endpoint.
- Reports summary of tested, successful, failed, skipped, and disabled endpoints.

Usage:
  python swagger_endpoint_test.py [options]

Options:
  --base-url         Base URL of the running instance (falls back to spec.servers[0].url)
  --spec             Path to an OpenAPI JSON file
  --sample-file      Sample PDF path for binary uploads
  --strict           Only treat documented statuses (or default/xXX) as success
  --timeout          Request timeout (seconds)
  --retries          HTTP retries with backoff
  --concurrency      Parallel workers
  --bearer           Bearer token (sets Authorization: Bearer ...)
  --auth-header      Custom header in "Name: Value" form (can be used multiple times)
  --include-tags     Comma-separated list of tags to include
  --exclude-tags     Comma-separated list of tags to exclude
  --only-path        Regex: only paths matching this pattern will be tested
  --skip             Extra skips, comma-separated "METHOD:/path" entries

Classes:
  EndpointResult: Data class representing the result of a single endpoint test.
  SwaggerTester:  Main class for exercising endpoints as defined in the OpenAPI spec.

Functions:
  load_spec:      Loads the OpenAPI specification from file or server.
  parse_args:     Parses command-line arguments.
  _parse_auth:    Parses authentication headers from arguments.
  _extra_headers_into: Applies additional custom headers to the session.
  main:           Entry point for running the test suite.

Example:
  python swagger_endpoint_test.py --base-url http://localhost:8080 --strict --concurrency 10
"""

from __future__ import annotations

import argparse
import concurrent.futures as cf
import json
import os
import re
import sys
import threading
from dataclasses import dataclass
from typing import Any, Iterable

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

# -----------------------------
# Sample files (adjustable)
# -----------------------------
DEFAULT_SAMPLE_FILE = "testing/cucumber/exampleFiles/ghost1.pdf"
IMAGE_SAMPLE_FILE = "docs/stirling.png"
MARKDOWN_SAMPLE_FILE = "testing/samples/sample.md"
CBZ_SAMPLE_FILE = "testing/samples/sample.cbz"
CBR_SAMPLE_FILE = "testing/samples/sample.cbr"
CHAPTERED_PDF_SAMPLE_FILE = "testing/samples/split_pdf_by_chapters_sample.pdf"
CERT_SAMPLE_FILE = "app/core/src/test/resources/certs/test-cert.pem"
PKCS12_SAMPLE_FILE = "app/core/src/test/resources/certs/test-cert.p12"
PDF_WITH_ATTACHMENTS_SAMPLE_FILE = "testing/samples/pdf_with_attachments.pdf"
EPUB_SAMPLE_FILE = "testing/samples/sample.epub"
EPS_SAMPLE_FILE = "testing/samples/sample.eps"
PDF_VECTOR_SAMPLE_FILE = "testing/samples/sample_vector.pdf"

DEFAULT_SPEC_ENDPOINT = "/v1/api-docs"

# sane defaults; overridable per CLI
DEFAULT_TIMEOUT = 60
DEFAULT_RETRIES = 1
DEFAULT_CONCURRENCY = 100

DEFAULT_SKIP_ENDPOINTS = {
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
    ("post", "/api/v1/pipeline/handleData"),
    ("post", "/api/v1/admin/job/cleanup"),
    ("post", "/api/v1/misc/ocr-pdf"),
    ("delete", "/api/v1/audit/cleanup/before"),
    ("delete", "/api/v1/general/job/{jobId}"),
    # Buggy endpoints
    ("post", "/api/v1/convert/cbr/pdf"),  # Invalid CBR file
    ("post", "/api/v1/convert/html/pdf"),
    ("post", "/api/v1/convert/pdf/img"),
    ("post", "/api/v1/convert/file/pdf"),  # unoconvert
    ("post", "/api/v1/convert/eml/pdf"),
    ("post", "/api/v1/convert/url/pdf"),  # URL input not handled properly
    ("post", "/api/v1/security/auto-redact"),  # Fails due to PDF sample file issue
    # check inputs
    ("post", "/api/v1/security/cert-sign"),
    ("post", "/api/v1/general/crop"),
    ("post", "/api/v1/general/overlay-pdfs"),
    # temporary skips
    ("get", "/api/v1/admin/settings/section/{sectionName}"),
    ("get", "/api/v1/admin/settings/key/{key}"),
    ("get", "/api/v1/admin/settings/delta"),
    ("get", "/api/v1/admin/settings"),
    # Could not find the Qt platform plugin headless error
    ("post", "/api/v1/convert/ebook/pdf"),
}


@dataclass
class EndpointResult:
    method: str
    path: str
    url: str
    status_code: int | None
    expected: Iterable[str]
    success: bool
    message: str
    skipped: bool = False
    disabled: bool = False


class SwaggerTester:
    def __init__(
        self,
        base_url: str,
        spec: dict[str, Any],
        sample_file: str,
        strict: bool,
        timeout: int,
        retries: int,
        auth_header: tuple[str, str] | None,
        include_tags: list[str] | None,
        exclude_tags: list[str] | None,
        only_path_regex: re.Pattern[str] | None,
        extra_skips: set[tuple[str, str]],
        concurrency: int,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.spec = spec
        self.sample_file = sample_file
        self.strict = strict
        self.timeout = timeout
        self.retries = retries
        self.include_tags = set(include_tags or [])
        self.exclude_tags = set(exclude_tags or [])
        self.only_path_regex = only_path_regex
        self.skip_endpoints = set(DEFAULT_SKIP_ENDPOINTS)
        self.skip_endpoints |= extra_skips
        self._ref_stack: list[str] = []

        self._session = self._build_session(auth_header)
        self._lock = threading.Lock()
        self._concurrency = max(1, concurrency)

    # -----------------------------
    # Session with retries
    # -----------------------------
    def _build_session(self, auth_header: tuple[str, str] | None) -> requests.Session:
        sess = requests.Session()
        retry = Retry(
            total=self.retries,
            connect=self.retries,
            read=self.retries,
            backoff_factor=0.6,
            status_forcelist=(408, 409, 425, 429, 500, 502, 503, 504),
            allowed_methods=frozenset(
                ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]
            ),
            raise_on_status=False,
        )
        adapter = HTTPAdapter(max_retries=retry, pool_connections=50, pool_maxsize=50)
        sess.mount("http://", adapter)
        sess.mount("https://", adapter)

        if auth_header:
            name, value = auth_header
            sess.headers[name] = value
        return sess

    # -----------------------------
    # Public API
    # -----------------------------
    def run(self) -> list[EndpointResult]:
        tasks: list[tuple[str, str, dict[str, Any], list[dict[str, Any]]]] = []
        paths = self.spec.get("paths", {}) or {}

        for raw_path, path_item in paths.items():
            if not isinstance(path_item, dict):
                continue
            shared_params = path_item.get("parameters", []) or []
            for method, operation in path_item.items():
                m = method.lower()
                if m not in {
                    "get",
                    "put",
                    "post",
                    "delete",
                    "patch",
                    "head",
                    "options",
                    "trace",
                }:
                    continue
                if not isinstance(operation, dict):
                    continue

                # Tag filters
                tags = set(operation.get("tags", []) or [])
                if self.include_tags and not (tags & self.include_tags):
                    continue
                if self.exclude_tags and (tags & self.exclude_tags):
                    continue

                # Path regex filter
                if self.only_path_regex and not self.only_path_regex.search(raw_path):
                    continue

                if (m, raw_path) in self.skip_endpoints:
                    # will push as skipped result for consistent reporting
                    tasks.append((m, raw_path, {"x-skip": True}, []))
                    continue

                merged_params = self._merge_parameters(
                    shared_params, operation.get("parameters", []) or []
                )
                tasks.append((m, raw_path, operation, merged_params))

        results: list[EndpointResult] = []
        with cf.ThreadPoolExecutor(max_workers=self._concurrency) as ex:
            futures = [
                ex.submit(self._exercise_endpoint, p, m, op, params)
                for (m, p, op, params) in tasks
            ]
            for fut in cf.as_completed(futures):
                results.append(fut.result())

        return sorted(results, key=lambda r: (r.path, r.method))

    # -----------------------------
    # Parameter helpers
    # -----------------------------
    def _merge_parameters(
        self, path_params: list[dict[str, Any]], op_params: list[dict[str, Any]]
    ) -> list[dict[str, Any]]:
        merged: dict[tuple[str, str], dict[str, Any]] = {}
        for param in path_params + op_params:
            if not isinstance(param, dict):
                continue
            key = (param.get("name"), param.get("in"))
            if key[0] is None or key[1] is None:
                continue
            merged[key] = param
        return list(merged.values())

    def _prepare_parameters(
        self, parameters: list[dict[str, Any]]
    ) -> tuple[dict[str, Any], dict[str, Any], dict[str, str]]:
        path_values: dict[str, Any] = {}
        query_values: dict[str, Any] = {}
        header_values: dict[str, str] = {}
        cookie_headers: list[str] = []

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

    # -----------------------------
    # Endpoint execution
    # -----------------------------
    def _exercise_endpoint(
        self,
        raw_path: str,
        method: str,
        operation: dict[str, Any],
        parameters: list[dict[str, Any]],
    ) -> EndpointResult:
        if operation.get("x-skip"):
            return EndpointResult(
                method.upper(),
                raw_path,
                f"{self.base_url}{raw_path}",
                None,
                [],
                True,
                "Skipped by configuration",
                skipped=True,
            )

        path_values, query_values, header_values = self._prepare_parameters(parameters)
        url_path = self._apply_path_params(raw_path, path_values)
        url = f"{self.base_url}{url_path}"

        request_kwargs: dict[str, Any] = {
            "params": query_values,
            "headers": header_values.copy(),
            "timeout": self.timeout,
        }

        open_files: list[Any] = []
        try:
            if "requestBody" in operation:
                body_info = operation.get("requestBody") or {}
                body_required = bool(body_info.get("required", False))
                content = self._resolve_request_body(operation.get("requestBody"))
                body_prepared = self._prepare_request_body(
                    content, open_files, raw_path, method.lower()
                )
                if body_prepared is None and body_required:
                    return EndpointResult(
                        method.upper(),
                        raw_path,
                        url,
                        None,
                        list((content or {}).keys()),
                        False,
                        "Unable to prepare required request body",
                    )
                if body_prepared:
                    extra_headers = body_prepared.pop("headers", None)
                    if extra_headers:
                        request_kwargs.setdefault("headers", {}).update(extra_headers)
                    request_kwargs.update(body_prepared)

            expected_statuses = self._expected_statuses(operation)
            resp = self._session.request(method.upper(), url, **request_kwargs)
            status_code = resp.status_code

            success = (
                self._is_expected_status(status_code, expected_statuses)
                if self.strict
                else self._is_ok_lenient(status_code, expected_statuses)
            )
            message = resp.reason or ""
            disabled = False

            if not success and self._is_disabled_endpoint(resp):
                success, disabled, message = True, True, "Endpoint disabled"

            elif not success:
                # show up to 2KB of response body for debugging
                txt = (resp.text or "")[:2048]
                message = txt if txt else message

            return EndpointResult(
                method.upper(),
                raw_path,
                url,
                status_code,
                expected_statuses,
                success,
                message,
                disabled=disabled,
            )

        except requests.RequestException as exc:
            return EndpointResult(
                method.upper(), raw_path, url, None, [], False, f"Request failed: {exc}"
            )
        finally:
            for fh in open_files:
                try:
                    fh.close()
                except Exception:
                    pass

    def _resolve_request_body(self, rb: Any) -> dict[str, Any] | None:
        """Handle $ref for requestBody as well as inline 'content'."""
        if not rb:
            return None
        if isinstance(rb, dict) and "$ref" in rb:
            refd = self._resolve_ref(rb["$ref"])
            if isinstance(refd, dict):
                return (refd.get("content") or {}) if "content" in refd else None
            return None
        if isinstance(rb, dict):
            return rb.get("content") or None
        return None

    def _expected_statuses(self, operation: dict[str, Any]) -> list[str]:
        responses = operation.get("responses", {}) or {}
        return [str(k) for k in responses.keys() if isinstance(k, str)]

    def _is_ok_lenient(self, status: int, expected: Iterable[str]) -> bool:
        """Pass if in documented statuses, in a documented range (xXX), default, or any 1xx-3xx."""
        if self._is_expected_status(status, expected):
            return True
        return 100 <= status < 400

    def _is_expected_status(self, status: int, expected: Iterable[str]) -> bool:
        status_str = str(status)
        if status_str in expected:
            return True
        for cand in expected:
            u = cand.upper()
            if u == "DEFAULT":
                return True
            if len(cand) == 3 and cand.endswith("XX") and cand[0].isdigit():
                if int(cand[0]) == status // 100:
                    return True
        return False

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
            if (
                isinstance(message, str)
                and message.lower() == "this endpoint is disabled"
            ):
                return True
        return False

    # -----------------------------
    # Request body helpers
    # -----------------------------
    def _prepare_request_body(
        self,
        content: dict[str, Any] | None,
        open_files: list[Any],
        path_hint: str,
        method: str,
    ) -> dict[str, Any] | None:
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
        media_types.sort(
            key=lambda m: next(
                (i for i, t in enumerate(preferred_order) if self._media_matches(m, t)),
                len(preferred_order),
            )
        )

        # try an explicit example at media level first
        for media_type in media_types:
            media = content.get(media_type) or {}
            if "example" in media:
                return self._pack_media(media_type, media["example"])
            if "examples" in media and isinstance(media["examples"], dict):
                first = next(iter(media["examples"].values()))
                if isinstance(first, dict) and "value" in first:
                    return self._pack_media(media_type, first["value"])

        for media_type in media_types:
            schema = (
                content[media_type].get("schema")
                if isinstance(content[media_type], dict)
                else None
            )
            resolved_schema = self._resolve_schema(schema)

            if media_type.startswith("application/json") or media_type.endswith(
                "+json"
            ):
                example = self._generate_example(resolved_schema)
                return {"json": example}
            if media_type == "multipart/form-data":
                form_fields, files = self._generate_multipart_payload(
                    resolved_schema, open_files, path_hint, method
                )
                payload: dict[str, Any] = {"data": form_fields}
                if files:
                    payload["files"] = files
                return payload
            if media_type == "application/x-www-form-urlencoded":
                form_fields = self._generate_form_fields(resolved_schema)
                return {"data": form_fields}
            if media_type in {"text/plain", "text/csv", "text/html"}:
                example = self._generate_example(resolved_schema)
                return {
                    "data": self._stringify(example),
                    "headers": {"Content-Type": media_type},
                }
            if media_type in {"application/octet-stream", "application/pdf"}:
                file_tuple, fh = self._binary_sample_for(
                    "fileInput", resolved_schema, path_hint, method
                )
                open_files.append(fh)
                return {"data": fh.read(), "headers": {"Content-Type": media_type}}

        return None

    def _pack_media(self, media_type: str, value: Any) -> dict[str, Any]:
        if media_type.startswith("application/json") or media_type.endswith("+json"):
            return {"json": value}
        if media_type == "application/x-www-form-urlencoded":
            return {"data": value if isinstance(value, dict) else {}}
        if media_type == "multipart/form-data":
            # try to split into fields/files best-effort
            fields, files = {}, []
            if isinstance(value, dict):
                for k, v in value.items():
                    if isinstance(v, (bytes, bytearray)):
                        files.append((k, (f"{k}.bin", v, "application/octet-stream")))
                    else:
                        fields[k] = (
                            v
                            if isinstance(v, (str, int, float, bool))
                            else json.dumps(v)
                        )
            return {"data": fields, "files": files} if files else {"data": fields}
        return {"data": self._stringify(value), "headers": {"Content-Type": media_type}}

    def _media_matches(self, media_type: str, pattern: str) -> bool:
        if pattern.endswith("*+json"):
            return media_type.endswith("+json")
        if pattern.endswith("/*"):
            return media_type.startswith(pattern[:-1])
        return media_type == pattern

    def _generate_multipart_payload(
        self,
        schema: dict[str, Any] | None,
        open_files: list[Any],
        path_hint: str,
        method: str,
    ) -> tuple[dict[str, Any], list[tuple[str, tuple[str, Any, str]]]]:
        fields: dict[str, Any] = {}
        files: list[tuple[str, tuple[str, Any, str]]] = []
        if not schema:
            return fields, files

        schema = self._ensure_object_schema(schema)
        properties = schema.get("properties", {}) or {}
        for name, prop_schema in properties.items():
            resolved = self._resolve_schema(prop_schema)
            if self._is_binary_schema(resolved):
                file_tuple, fh = self._binary_sample_for(
                    name, resolved, path_hint, method
                )
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

    def _generate_form_fields(self, schema: dict[str, Any] | None) -> dict[str, Any]:
        fields: dict[str, Any] = {}
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

    # -----------------------------
    # Schema helpers
    # -----------------------------
    def _resolve_schema(self, schema: dict[str, Any] | None) -> dict[str, Any] | None:
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

    def _resolve_ref(self, ref: str) -> dict[str, Any] | None:
        if not ref.startswith("#/"):
            return None
        parts = ref.lstrip("#/").split("/")
        node: Any = self.spec
        for part in parts:
            if isinstance(node, dict):
                node = node.get(part)
            else:
                return None
        return node if isinstance(node, dict) else None

    def _ensure_object_schema(self, schema: dict[str, Any]) -> dict[str, Any]:
        if schema.get("type") == "object" or "properties" in schema:
            return schema
        return {"type": "object", "properties": {}}

    def _is_binary_schema(self, schema: dict[str, Any] | None) -> bool:
        if not schema:
            return False
        t = schema.get("type")
        fmt = schema.get("format")
        if fmt == "binary":
            return True
        if t == "string" and fmt == "byte":
            return True
        if t == "array":
            return self._is_binary_schema(self._resolve_schema(schema.get("items")))
        return False

    # -----------------------------
    # Example generation
    # -----------------------------
    def _generate_example(self, schema: dict[str, Any] | None, depth: int = 0) -> Any:
        if schema is None or depth > 6:
            return "example"

        if "$ref" in schema:
            resolved = self._resolve_schema(schema)
            return (
                self._generate_example(resolved, depth + 1) if resolved else "example"
            )

        # explicit example/default first
        if "example" in schema:
            return schema["example"]
        if "default" in schema:
            return schema["default"]
        enum = schema.get("enum")
        if enum:
            return self._choose_enum_value(enum)

        if "oneOf" in schema:
            return self._generate_example(
                self._resolve_schema(schema["oneOf"][0]), depth + 1
            )
        if "anyOf" in schema:
            return self._generate_example(
                self._resolve_schema(schema["anyOf"][0]), depth + 1
            )
        if "allOf" in schema:
            combined: dict[str, Any] = {}
            for subschema in schema["allOf"]:
                resolved = self._resolve_schema(subschema)
                example = self._generate_example(resolved, depth + 1)
                if isinstance(example, dict):
                    combined.update(example)
            if combined:
                return combined

        t = schema.get("type")
        if t == "object" or (not t and schema.get("properties")):
            properties = schema.get("properties", {}) or {}
            result: dict[str, Any] = {}
            for name, subschema in properties.items():
                resolved = self._resolve_schema(subschema)
                result[name] = self._generate_example(resolved, depth + 1)
            if not result and schema.get("additionalProperties"):
                additional_schema = self._resolve_schema(
                    schema.get("additionalProperties")
                )
                result["key"] = self._generate_example(additional_schema, depth + 1)
            return result
        if t == "array":
            items_schema = self._resolve_schema(schema.get("items"))
            return [self._generate_example(items_schema, depth + 1)]
        if t == "integer":
            return 1 if schema.get("minimum", 0) > 0 else 0
        if t == "number":
            base = 1.0 if schema.get("minimum", 0) > 0 else 0.0
            return float(base)
        if t == "boolean":
            return True
        if t == "string":
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
            if fmt in {"ip", "ipv4"}:
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

    # -----------------------------
    # Utility helpers
    # -----------------------------
    def _apply_path_params(self, raw_path: str, path_values: dict[str, Any]) -> str:
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

    def _choose_enum_value(self, values: list[Any]) -> Any:
        preferred = [
            "txt",
            "text",
            "json",
            "pdf",
            "png",
            "jpg",
            "jpeg",
            "true",
            "false",
        ]
        for pref in preferred:
            for value in values:
                if isinstance(value, str) and value.lower() == pref:
                    return value
        return values[0]

    def _binary_sample_for(
        self,
        field_name: str,
        schema: dict[str, Any] | None,
        path_hint: str,
        method: str,
    ) -> tuple[tuple[str, Any, str], Any]:
        name_lower = field_name.lower()
        content_type = (schema or {}).get("contentMediaType")
        path_lower = path_hint.lower()

        print(
            f"Choosing sample file for field '{field_name}' (path hint: {path_hint})",
            file=sys.stderr,
        )
        print(f"  Schema contentMediaType: {content_type}", file=sys.stderr)
        print(f"  Field name lower: {name_lower}", file=sys.stderr)
        print(f"  Path hint lower: {path_lower}", file=sys.stderr)

        if content_type and content_type.startswith("image/"):
            return self._open_file(IMAGE_SAMPLE_FILE, content_type)

        if "extract-attachments" in path_lower:
            return self._open_file(
                PDF_WITH_ATTACHMENTS_SAMPLE_FILE, "application/pdf"
            )

        if "ebook" in path_lower:
            return self._open_file(EPUB_SAMPLE_FILE, "application/epub+zip")

        if "vector/pdf" in path_lower:
            return self._open_file(EPS_SAMPLE_FILE, "application/postscript")

        if "pdf/vector" in path_lower:
            return self._open_file(PDF_VECTOR_SAMPLE_FILE, "application/pdf")

        if "image" in name_lower or "img" in path_lower:
            return self._open_file(IMAGE_SAMPLE_FILE, "image/png")

        if "markdown/pdf" in path_lower:
            return self._open_file(MARKDOWN_SAMPLE_FILE, "text/markdown")

        if (
            content_type
            and content_type in {"application/vnd.comicbook+rar"}
            or "cbr/pdf" in path_lower
        ):
            return self._open_file(CBR_SAMPLE_FILE, "application/vnd.comicbook+rar")

        if (
            content_type
            and content_type in {"application/vnd.comicbook+zip"}
            or "cbz/pdf" in path_lower
        ):
            return self._open_file(CBZ_SAMPLE_FILE, "application/vnd.comicbook+zip")

        if "split-pdf-by-chapters" in path_lower or "remove-cert-sign" in path_lower:
            return self._open_file(CHAPTERED_PDF_SAMPLE_FILE, "application/pdf")

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

        if content_type and content_type in {
            "application/x-pkcs12",
            "application/pkcs12",
        }:
            return self._open_file(PKCS12_SAMPLE_FILE, content_type)

        return self._open_file(self.sample_file, "application/pdf")

    def _open_file(
        self, path: str, content_type: str
    ) -> tuple[tuple[str, Any, str], Any]:
        fh = open(path, "rb")
        filename = os.path.basename(path)
        return (filename, fh, content_type), fh


# -----------------------------
# CLI helpers
# -----------------------------
def load_spec(
    base_url: str | None, spec_path: str | None, timeout: int
) -> tuple[dict[str, Any], str]:
    if spec_path:
        with open(spec_path, "r", encoding="utf-8") as handle:
            spec = json.load(handle)
    else:
        if not base_url:
            raise ValueError("Either --spec or --base-url must be provided")
        url = f"{base_url.rstrip('/')}{DEFAULT_SPEC_ENDPOINT}"
        resp = requests.get(url, timeout=timeout)
        resp.raise_for_status()
        spec = resp.json()

    # if base_url missing, try from servers[]
    final_base = (base_url or "").strip()
    if not final_base:
        servers = spec.get("servers") or []
        if servers and isinstance(servers[0], dict) and "url" in servers[0]:
            final_base = servers[0]["url"]
    if not final_base:
        final_base = "http://localhost:8080"
    return spec, final_base.rstrip("/")


def parse_args(argv: list[str]) -> argparse.Namespace:
    p = argparse.ArgumentParser(
        description="Exercise all endpoints defined in the OpenAPI specification."
    )
    p.add_argument(
        "--base-url",
        help="Base URL of the running instance (falls back to spec.servers[0].url)",
    )
    p.add_argument("--spec", dest="spec_path", help="Path to an OpenAPI JSON file")
    p.add_argument(
        "--sample-file",
        default=DEFAULT_SAMPLE_FILE,
        help="Sample PDF path for binary uploads",
    )

    p.add_argument(
        "--strict",
        action="store_true",
        help="Only treat documented statuses (or default/xXX) as success",
    )
    p.add_argument(
        "--timeout", type=int, default=DEFAULT_TIMEOUT, help="Request timeout (seconds)"
    )
    p.add_argument(
        "--retries", type=int, default=DEFAULT_RETRIES, help="HTTP retries with backoff"
    )
    p.add_argument(
        "--concurrency", type=int, default=DEFAULT_CONCURRENCY, help="Parallel workers"
    )

    p.add_argument("--bearer", help="Bearer token (sets Authorization: Bearer ...)")
    p.add_argument(
        "--auth-header",
        help='Custom header in "Name: Value" form (can be used multiple times)',
        action="append",
    )

    p.add_argument("--include-tags", help="Comma-separated list of tags to include")
    p.add_argument("--exclude-tags", help="Comma-separated list of tags to exclude")
    p.add_argument(
        "--only-path", help="Regex: only paths matching this pattern will be tested"
    )
    p.add_argument("--skip", help='Extra skips, comma-separated "METHOD:/path" entries')

    return p.parse_args(argv)


def _parse_auth(args: argparse.Namespace) -> tuple[str, str] | None:
    if args.bearer:
        return ("Authorization", f"Bearer {args.bearer}")
    if args.auth_header:
        # take the first; additional headers are applied via session later
        name, value = (args.auth_header[0].split(":", 1) + [""])[:2]
        return (name.strip(), value.strip())
    return None


def _extra_headers_into(
    auth_header: tuple[str, str] | None,
    args: argparse.Namespace,
    sess: requests.Session,
) -> None:
    # add additional custom headers beyond the first (if provided multiple times)
    if args.auth_header:
        for raw in args.auth_header:
            name, value = (raw.split(":", 1) + [""])[:2]
            name, value = name.strip(), value.strip()
            if not name:
                continue
            if not (auth_header and name.lower() == auth_header[0].lower()):
                sess.headers[name] = value


def main(argv: list[str]) -> int:
    args = parse_args(argv)
    auth_header = _parse_auth(args)

    try:
        spec, base_url = load_spec(args.base_url, args.spec_path, args.timeout)
    except Exception as exc:
        print(f"Failed to load OpenAPI specification: {exc}", file=sys.stderr)
        return 1

    include_tags = [
        t.strip() for t in (args.include_tags or "").split(",") if t.strip()
    ]
    exclude_tags = [
        t.strip() for t in (args.exclude_tags or "").split(",") if t.strip()
    ]
    only_path_regex = re.compile(args.only_path) if args.only_path else None

    extra_skips: set[tuple[str, str]] = set()
    if args.skip:
        for item in args.skip.split(","):
            item = item.strip()
            if not item:
                continue
            if ":" not in item:
                print(f'Ignoring malformed skip "{item}" (expected "METHOD:/path")')
                continue
            method, path = item.split(":", 1)
            extra_skips.add((method.lower(), path.strip()))

    tester = SwaggerTester(
        base_url=base_url,
        spec=spec,
        sample_file=args.sample_file,
        strict=args.strict,
        timeout=args.timeout,
        retries=args.retries,
        auth_header=auth_header,
        include_tags=include_tags,
        exclude_tags=exclude_tags,
        only_path_regex=only_path_regex,
        extra_skips=extra_skips,
        concurrency=args.concurrency,
    )

    # apply extra headers after building session
    _extra_headers_into(auth_header, args, tester._session)

    results = tester.run()

    failures = [r for r in results if not r.success and not r.skipped]
    disabled = sum(1 for r in results if r.disabled)
    skipped = sum(1 for r in results if r.skipped)

    for r in results:
        status_repr = r.status_code if r.status_code is not None else "ERR"
        status_text = "PASS" if r.success else ("SKIP" if r.skipped else "FAIL")
        expected = ",".join(r.expected) if r.expected else "<default>"
        print(
            f"[{status_text}] {r.method} {r.path} -> {status_repr} (expected: {expected})"
        )
        if not r.success and not r.skipped and r.message:
            print(f"    Details: {r.message}")

    total = len(results)
    ok = total - len(failures) - skipped
    print("\n=== Summary ===")
    print(f"Total endpoints tested: {total}")
    print(f"Successful responses:  {ok}")
    print(f"Failed responses:      {len(failures)}")
    print(f"Skipped:               {skipped}")
    print(f"Disabled (403 noted):  {disabled}")

    # In CI, you might want to exit with 0 even if there are disabled/skipped tests
    return 0 if not failures else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
