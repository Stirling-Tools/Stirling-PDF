"""Re-issues a request concurrently and asserts every response matches the baseline."""

import io
import json as json_module
import re
import sys
import zipfile
from concurrent.futures import ThreadPoolExecutor
from hashlib import sha256

import requests
from pypdf import PdfReader

_UUID_RE = re.compile(r"[0-9a-fA-F]{8}-(?:[0-9a-fA-F]{4}-){3}[0-9a-fA-F]{12}")
_LONG_NUM_RE = re.compile(r"\d{10,}")
_DATE_RE = re.compile(r"\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?")
_VOLATILE_KEY_RE = re.compile(
    r"^(id|uuid|.*Id|.*_id|.*[Tt]ime|.*[Dd]ate|timestamp|created.*|modified.*|"
    r"updated.*|expires.*|token|traceId|requestId|duration.*|elapsed.*)$"
)

# Only hash text for reasonably sized documents so the check stays cheap.
_MAX_TEXT_PAGES = 25

# Sequential samples taken to separate inherent nondeterminism from a concurrency bug.
NOISE_PROBE_SAMPLES = 3

# Response size is allowed to drift this far before it counts as a difference.
SIZE_TOLERANCE = 0.05

# Collected per-scenario results, printed as a summary in after_all.
VALIDATIONS = []


# A spec replaces open file handles with bytes so it can be replayed from many threads.


def materialize(spec):
    """Turn a captured spec into a fresh `files=` list for one request."""
    parts = []
    for key, filename, payload, mime in spec:
        if filename is None:
            parts.append((key, (None, payload) if mime is None else (None, payload, mime)))
        else:
            parts.append((key, (filename, io.BytesIO(payload), mime)))
    return parts


def send(url, spec, headers, timeout=300):
    return requests.post(url, files=materialize(spec), headers=headers, timeout=timeout)


def _normalize_name(name):
    name = _UUID_RE.sub("<uuid>", name)
    return _LONG_NUM_RE.sub("<num>", name)


def _strip_volatile(value):
    """Drop keys whose values legitimately differ between two identical requests."""
    if isinstance(value, dict):
        return {
            k: _strip_volatile(v)
            for k, v in sorted(value.items())
            if not _VOLATILE_KEY_RE.match(k)
        }
    if isinstance(value, list):
        return [_strip_volatile(v) for v in value]
    if isinstance(value, str):
        return _normalize_name(value)
    return value


def _pdf_fingerprint(body, prefix=""):
    parts = {}
    try:
        reader = PdfReader(io.BytesIO(body))
    except Exception as exc:
        parts[prefix + "pdf"] = f"unreadable: {type(exc).__name__}"
        return parts
    parts[prefix + "encrypted"] = reader.is_encrypted
    if reader.is_encrypted:
        return parts
    try:
        pages = reader.pages
        parts[prefix + "pages"] = len(pages)
    except Exception as exc:
        parts[prefix + "pdf"] = f"unreadable pages: {type(exc).__name__}"
        return parts
    if len(pages) <= _MAX_TEXT_PAGES:
        try:
            text = "\n".join((page.extract_text() or "") for page in pages)
            parts[prefix + "text_sha"] = sha256(text.encode("utf-8")).hexdigest()[:16]
        except Exception:
            pass
    return parts


def _entry_sha(entry):
    """Hash an archive entry, normalizing the ids and timestamps EPUB/ODF restamp each run."""
    try:
        text = entry.decode("utf-8")
        if "\x00" not in text:
            entry = _DATE_RE.sub("<date>", _normalize_name(text)).encode("utf-8")
    except UnicodeDecodeError:
        pass
    return sha256(entry).hexdigest()[:16]


def _zip_fingerprint(body):
    parts = {}
    try:
        with zipfile.ZipFile(io.BytesIO(body)) as archive:
            names = sorted(_normalize_name(n) for n in archive.namelist())
            parts["zip_entries"] = len(names)
            parts["zip_names"] = names
            for index, name in enumerate(sorted(archive.namelist())):
                entry = archive.read(name)
                if entry[:5] == b"%PDF-":
                    parts.update(_pdf_fingerprint(entry, prefix=f"zip[{index}]."))
                else:
                    parts[f"zip[{index}].sha"] = _entry_sha(entry)
    except Exception as exc:
        parts["zip"] = f"unreadable: {type(exc).__name__}"
    return parts


def fingerprint(response):
    """Structural signature of a response, ignoring benign per-request variance."""
    body = response.content
    content_type = (response.headers.get("Content-Type") or "").split(";")[0].strip()
    parts = {"status": response.status_code, "content_type": content_type, "size": len(body)}


    if "json" in content_type:
        try:
            parts["json"] = _strip_volatile(json_module.loads(body.decode("utf-8")))
        except Exception:
            parts["body_sha"] = sha256(body).hexdigest()[:16]
    elif body[:5] == b"%PDF-":
        parts.update(_pdf_fingerprint(body))
    elif body[:2] == b"PK":
        parts.update(_zip_fingerprint(body))
    elif content_type.startswith("text/") or response.status_code >= 400:
        try:
            parts["text"] = _normalize_name(body.decode("utf-8", "replace"))[:2000]
        except Exception:
            parts["body_sha"] = sha256(body).hexdigest()[:16]
    else:
        parts["body_sha"] = sha256(body).hexdigest()[:16]
    return parts


def differing_keys(baseline, other):
    return {
        key
        for key in set(baseline) | set(other)
        if key != "size" and baseline.get(key) != other.get(key)
    }


def size_differs(baseline, other):
    base_size, other_size = baseline.get("size", 0), other.get("size", 0)
    return abs(other_size - base_size) > max(64, base_size * SIZE_TOLERANCE)


def compare(baseline, other, ignore=frozenset(), ignore_size=False):
    """Return a list of human-readable differences between two fingerprints."""
    diffs = []
    for key in sorted(differing_keys(baseline, other) - set(ignore)):
        diffs.append(
            f"{key}: baseline={_short(baseline.get(key))} parallel={_short(other.get(key))}"
        )
    if not ignore_size and size_differs(baseline, other):
        diffs.append(
            f"size: baseline={baseline.get('size', 0)} parallel={other.get('size', 0)} "
            f"(differs by more than {SIZE_TOLERANCE:.0%})"
        )
    return diffs


def _short(value):
    text = repr(value)
    return text if len(text) <= 160 else text[:157] + "..."


def build_decoy_spec(spec):
    """Clone a spec with each PDF stamped with unique text, or None if not possible.

    Structure is preserved so parameters stay valid; only the text differs, which
    is what makes bleed visible.
    """
    try:
        from pypdf import PdfWriter
        from reportlab.pdfgen import canvas
    except ImportError:
        return None

    decoy = []
    stamped_any = False
    for key, filename, payload, mime in spec:
        if filename is None or not isinstance(payload, bytes) or payload[:5] != b"%PDF-":
            decoy.append((key, filename, payload, mime))
            continue
        try:
            reader = PdfReader(io.BytesIO(payload))
            if reader.is_encrypted:
                return None
            writer = PdfWriter()
            for index, page in enumerate(reader.pages):
                box = page.mediabox
                width, height = float(box.width), float(box.height)
                overlay_buffer = io.BytesIO()
                overlay_canvas = canvas.Canvas(overlay_buffer, pagesize=(width, height))
                overlay_canvas.drawString(
                    20, max(20.0, height - 20), f"DECOY-MARKER-{index}-do-not-mix"
                )
                overlay_canvas.showPage()
                overlay_canvas.save()
                overlay_buffer.seek(0)
                page.merge_page(PdfReader(overlay_buffer).pages[0])
                writer.add_page(page)
            out = io.BytesIO()
            writer.write(out)
            decoy.append((key, filename, out.getvalue(), mime))
            stamped_any = True
        except Exception:
            return None
    return decoy if stamped_any else None


def _run_concurrently(url, specs, headers, timeout):
    """Fire every spec at once and return (response, error) in submission order."""
    results = [None] * len(specs)

    def _worker(index):
        try:
            results[index] = (send(url, specs[index], headers, timeout=timeout), None)
        except Exception as exc:
            results[index] = (None, exc)

    with ThreadPoolExecutor(max_workers=len(specs)) as pool:
        list(pool.map(_worker, range(len(specs))))
    return results


def validate(context, url, spec, headers, baseline, label, timeout=300):
    """Re-issue the request concurrently; no-op unless the repeat count is above 1."""
    repeat = getattr(context, "parallel_repeat", 1)
    if repeat < 2 or getattr(context, "parallel_validated", False):
        return
    context.parallel_validated = True
    context.parallel_ran_at = repeat

    decoy_spec = build_decoy_spec(spec) if getattr(context, "parallel_decoy", False) else None
    specs = [spec] * repeat + ([decoy_spec] * repeat if decoy_spec else [])
    results = _run_concurrently(url, specs, headers, timeout)

    main_results = results[:repeat]
    decoy_results = results[repeat:]
    baseline_fp = fingerprint(baseline)

    noise, noisy_size = frozenset(), False
    failures = _collect_failures(
        main_results, decoy_results, baseline_fp, repeat, noise, noisy_size
    )
    if failures:
        # Some endpoints are inherently nondeterministic (embedded ids, timestamps,
        # deliberate randomness). Re-run sequentially to tell that apart from a real bug.
        noise, noisy_size = _probe_noise(url, spec, headers, baseline_fp, timeout)
        failures = _collect_failures(
            main_results, decoy_results, baseline_fp, repeat, noise, noisy_size
        )

    VALIDATIONS.append(
        {
            "label": label,
            "repeat": repeat,
            "decoy": bool(decoy_spec),
            "failed": bool(failures),
            "noise": sorted(noise) + (["size"] if noisy_size else []),
        }
    )

    if failures:
        raise AssertionError(
            f"Parallel consistency failed for {label} at concurrency {repeat}.\n"
            f"Two sequential runs agreed on these fields, so the differences below are "
            f"caused by running the same operation concurrently.\n"
            f"Baseline fingerprint: {_short(baseline_fp)}\n  - " + "\n  - ".join(failures)
        )


def _collect_failures(main_results, decoy_results, baseline_fp, repeat, noise, noisy_size):
    decoy_fp = _decoy_reference(decoy_results, baseline_fp, noise, noisy_size)
    failures = []

    for index, (response, error) in enumerate(main_results):
        if error is not None:
            failures.append(f"copy {index + 1}/{repeat} raised {type(error).__name__}: {error}")
            continue
        actual_fp = fingerprint(response)
        diffs = compare(baseline_fp, actual_fp, noise, noisy_size)
        if not diffs:
            continue
        if decoy_fp is not None and not compare(
            decoy_fp, actual_fp, noise, noisy_size
        ):
            failures.append(
                f"copy {index + 1}/{repeat} returned the CONCURRENT DECOY REQUEST'S response "
                f"(cross-request bleed)"
            )
        else:
            failures.append(f"copy {index + 1}/{repeat} diverged: " + "; ".join(diffs))

    failures.extend(_check_decoys(decoy_results, repeat, noise, noisy_size))
    return failures


def _probe_noise(url, spec, headers, baseline_fp, timeout, samples=NOISE_PROBE_SAMPLES):
    """Fields that already vary between uncontended runs, so they prove nothing.

    Several samples: high-variance output can look stable across any single pair.
    """
    probes = []
    for _ in range(samples):
        try:
            probes.append(fingerprint(send(url, spec, headers, timeout=timeout)))
        except Exception:
            break
    return _noise_from_samples(baseline_fp, probes)


def _noise_from_samples(baseline_fp, probes):
    noise = set()
    noisy_size = False
    for index, probe in enumerate(probes):
        for other in [baseline_fp] + probes[:index]:
            noise |= differing_keys(other, probe)
            noisy_size = noisy_size or size_differs(other, probe)
    return frozenset(noise), noisy_size


def validate_get(context, url, params, headers, baseline, label, timeout=60):
    """Concurrency check for read-only GET endpoints."""
    repeat = getattr(context, "parallel_repeat", 1)
    if repeat < 2 or getattr(context, "parallel_validated", False):
        return
    context.parallel_validated = True
    context.parallel_ran_at = repeat

    results = [None] * repeat

    def _worker(index):
        try:
            results[index] = (
                requests.get(url, params=params, headers=headers, timeout=timeout),
                None,
            )
        except Exception as exc:
            results[index] = (None, exc)

    with ThreadPoolExecutor(max_workers=repeat) as pool:
        list(pool.map(_worker, range(repeat)))

    baseline_fp = fingerprint(baseline)

    def _failures(noise, noisy_size):
        found = []
        for index, (response, error) in enumerate(results):
            if error is not None:
                found.append(f"copy {index + 1}/{repeat} raised {type(error).__name__}: {error}")
                continue
            diffs = compare(
                baseline_fp,
                fingerprint(response),
                    noise,
                noisy_size,
            )
            if diffs:
                found.append(f"copy {index + 1}/{repeat} diverged: " + "; ".join(diffs))
        return found

    noise, noisy_size = frozenset(), False
    failures = _failures(noise, noisy_size)
    if failures:
        probes = []
        for _ in range(NOISE_PROBE_SAMPLES):
            try:
                probes.append(
                    fingerprint(
                        requests.get(url, params=params, headers=headers, timeout=timeout)
                    )
                )
            except Exception:
                break
        noise, noisy_size = _noise_from_samples(baseline_fp, probes)
        failures = _failures(noise, noisy_size)

    VALIDATIONS.append(
        {
            "label": label,
            "repeat": repeat,
            "decoy": False,
            "failed": bool(failures),
            "noise": sorted(noise) + (["size"] if noisy_size else []),
        }
    )
    if failures:
        raise AssertionError(
            f"Parallel consistency failed for GET {label} at concurrency {repeat}.\n  - "
            + "\n  - ".join(failures)
        )


def _decoy_reference(decoy_results, baseline_fp, noise, noisy_size):
    """Fingerprint of the decoy response, or None when it is not distinguishable."""
    live = [r for r, _e in decoy_results if r is not None]
    if not live:
        return None
    decoy_fp = fingerprint(live[0])
    # Some endpoints ignore page content, so the decoy cannot prove anything there.
    if not compare(baseline_fp, decoy_fp, noise, noisy_size):
        return None
    return decoy_fp


def _check_decoys(decoy_results, repeat, noise, noisy_size):
    """Assert the decoy load stayed self-consistent while contending with the main copies."""
    if not decoy_results:
        return []
    live = [(i, r) for i, (r, _e) in enumerate(decoy_results) if r is not None]
    if not live:
        return ["every decoy request failed to complete"]

    failures = []
    reference_fp = fingerprint(live[0][1])
    for index, response in live[1:]:
        diffs = compare(
            reference_fp,
            fingerprint(response),
            noise,
            noisy_size,
        )
        if diffs:
            failures.append(f"decoy {index + 1}/{repeat} diverged: " + "; ".join(diffs))
    return failures


def print_summary():
    if not VALIDATIONS:
        return
    total = len(VALIDATIONS)
    failed = sum(1 for v in VALIDATIONS if v["failed"])
    max_repeat = max(v["repeat"] for v in VALIDATIONS)
    requests_sent = sum(v["repeat"] * (2 if v["decoy"] else 1) for v in VALIDATIONS)

    lines = [
        f"\n[PARALLEL] {total - failed}/{total} operations stayed consistent under "
        f"concurrency (up to {max_repeat} at once, {requests_sent} concurrent requests sent)."
    ]
    noisy = {}
    for entry in VALIDATIONS:
        if entry["noise"]:
            noisy.setdefault(entry["label"], set()).update(entry["noise"])
    if noisy:
        lines.append(
            f"[PARALLEL] {len(noisy)} endpoint(s) produce nondeterministic output. Those "
            f"fields were excluded only after confirming they also vary across "
            f"{NOISE_PROBE_SAMPLES} sequential runs:"
        )
        for label, fields in sorted(noisy.items()):
            lines.append(f"           {label} -> {', '.join(sorted(fields))}")

    # behave's --junit reporter swallows after_all stdout, so bypass any capture.
    stream = getattr(sys, "__stderr__", None) or sys.stderr
    stream.write("\n".join(lines) + "\n")
    stream.flush()
