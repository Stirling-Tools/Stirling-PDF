#!/usr/bin/env python3
"""Export the Apache-2.0 FFDetr form-field detector to the ONNX we ship.

Its publisher releases only a PyTorch `.pth`, so unlike the FFDNet checkpoints there is no
`.onnx` to point a catalogue entry at. This does the conversion they skipped. Run it once on a
workstation or a CI job; torch is needed HERE and nowhere else - the product loads the result
with onnxruntime alone, exactly as it loads any other model in the catalogue.

    pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu
    pip install rfdetr onnx onnxruntime onnxconverter-common
    python scripts/export-ffdetr-onnx.py --out build/ffdetr

Emits `ffdetr-int8.onnx` (~37MB, the one to host) plus the fp32 graph it came from, and prints
the sha256 for `model-catalog.json`. int8 measures smaller than FFDNet-S at 38.4MB and, on a
form page, returns detections indistinguishable from fp32.
"""

from __future__ import annotations

import argparse
import hashlib
import shutil
import sys
import warnings
from pathlib import Path

# Pinned so a re-export is byte-reproducible; bump deliberately, not incidentally.
REPO = "jbarrow/FFDetr"
REVISION = "56f4e4235e28dcb2953513dc020bb191a2f54cfe"
CHECKPOINT_SHA256 = "f852e1bac18c8f435b82270fc8ff8e2ca4a2cd8869c411fa8f473f16e69585ef"

# Must match model-catalog.json. 1024 is RF-DETR's native resolution and has to stay divisible
# by 32 (patch_size 16 x num_windows 2).
INPUT_SIZE = 1024
NUM_CLASSES = 3
OPSET = 17


def sha256_of(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def fetch_checkpoint(dest: Path) -> Path:
    """Download the pinned .pth and refuse to continue if it is not the one we vetted."""
    import urllib.request

    if not dest.exists():
        url = f"https://huggingface.co/{REPO}/resolve/{REVISION}/FFDetr.pth"
        print(f"downloading {url}")
        with urllib.request.urlopen(url) as response, dest.open("wb") as out:
            shutil.copyfileobj(response, out)

    actual = sha256_of(dest)
    if actual != CHECKPOINT_SHA256:
        raise SystemExit(
            f"checkpoint sha256 mismatch\n  expected {CHECKPOINT_SHA256}\n  actual   {actual}"
        )
    print(f"checkpoint verified ({dest.stat().st_size / 1e6:.1f} MB)")
    return dest


def export_fp32(checkpoint: Path, out_dir: Path) -> Path:
    from rfdetr import RFDETRMedium

    # An absolute path matters: a relative one is resolved against ~/.roboflow/models and 404s.
    model = RFDETRMedium(
        pretrain_weights=str(checkpoint.resolve()),
        num_classes=NUM_CLASSES,
        trust_checkpoint=True,
    )
    # fp16=False keeps the graph single-precision; we quantise to int8 below instead, which is
    # both smaller and - unlike the fp16 converter - produces a graph onnxruntime will load.
    produced = model.export(
        output_dir=str(out_dir),
        shape=(INPUT_SIZE, INPUT_SIZE),
        opset_version=OPSET,
        fp16=False,
        verbose=False,
    )
    return Path(produced)


def quantize(fp32: Path, out: Path) -> Path:
    from onnxruntime.quantization import QuantType, quantize_dynamic
    from onnxruntime.quantization.shape_inference import quant_pre_process

    prepared = fp32.with_name("ffdetr-prep.onnx")
    quant_pre_process(str(fp32), str(prepared), skip_symbolic_shape=False)
    quantize_dynamic(str(prepared), str(out), weight_type=QuantType.QInt8)
    prepared.unlink(missing_ok=True)
    return out


def verify(model: Path) -> None:
    """Load under the same onnxruntime the product uses and assert the contract the decoder relies on."""
    import numpy as np
    import onnx
    import onnxruntime as ort

    graph = onnx.load(str(model))
    custom = sorted({n.domain for n in graph.graph.node if n.domain not in ("", "ai.onnx")})
    if custom:
        raise SystemExit(f"refusing to ship: graph needs custom op domains {custom}")

    session = ort.InferenceSession(str(model), providers=["CPUExecutionProvider"])
    names = [o.name for o in session.get_outputs()]
    if names != ["dets", "labels"]:
        raise SystemExit(f"unexpected output names {names}; the decoder binds by name")

    outputs = session.run(
        None, {session.get_inputs()[0].name: np.zeros((1, 3, INPUT_SIZE, INPUT_SIZE), np.float32)}
    )
    for name, value in zip(names, outputs):
        if np.isnan(value).any():
            raise SystemExit(f"output {name} contains NaN")
    # Both outputs are [1,300,4]: 4 box values vs NUM_CLASSES + 1 no-object logit. They are
    # indistinguishable by shape, which is exactly why everything downstream binds by name.
    print(f"verified: ops all standard, outputs {list(zip(names, (o.shape for o in outputs)))}")


def main() -> int:
    warnings.filterwarnings("ignore")
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", default="build/ffdetr", help="output directory")
    args = parser.parse_args()

    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)

    checkpoint = fetch_checkpoint(out_dir / "FFDetr.pth")
    fp32 = export_fp32(checkpoint, out_dir)
    print(f"fp32: {fp32.stat().st_size / 1e6:.1f} MB")

    int8 = quantize(fp32, out_dir / "ffdetr-int8.onnx")
    verify(int8)

    size = int8.stat().st_size
    print()
    print(f"  file      {int8}")
    print(f"  sizeBytes {size}")
    print(f"  sha256    {sha256_of(int8)}")
    print()
    print("Host this file, then set onnxUrl/sha256/sizeBytes on the ffdetr entry in")
    print("app/proprietary/src/main/resources/formdetection/model-catalog.json.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
