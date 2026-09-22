"""Exercise unchanged documents and the application's remote-only conversion path."""

import hashlib
import http.client
import pathlib
import subprocess
import sys
import time


def request(path, data=None, content_type=None):
    connection = http.client.HTTPConnection("stirling-pdf", 8080, timeout=120)
    headers = {"Content-Type": content_type} if content_type else {}
    connection.request("POST" if data else "GET", path, data, headers)
    response = connection.getresponse()
    result = response.status, response.read()
    connection.close()
    return result


def convert_api(filename, data, endpoint="file/pdf", output_format=None):
    boundary = "isolation-test-boundary"
    media_type = (
        "application/pdf" if filename.endswith(".pdf") else "application/octet-stream"
    )
    body = (
        (
            f'--{boundary}\r\nContent-Disposition: form-data; name="fileInput"; '
            f'filename="{filename}"\r\nContent-Type: {media_type}\r\n\r\n'
        ).encode()
        + data
        + b"\r\n"
    )
    if output_format:
        body += (
            f'--{boundary}\r\nContent-Disposition: form-data; name="outputFormat"'
            f"\r\n\r\n{output_format}\r\n"
        ).encode()
    body += f"--{boundary}--\r\n".encode()
    return request(
        f"/api/v1/convert/{endpoint}", body, f"multipart/form-data; boundary={boundary}"
    )


def fixture_conversions():
    for name in (
        "example.docx",
        "example.odt",
        "example.pptx",
        "example.rtf",
        "sample.doc",
        "sample.xlsx",
    ):
        source = pathlib.Path("/fixtures", name)
        before = hashlib.sha256(source.read_bytes()).digest()
        output = pathlib.Path("/tmp", name + ".pdf")
        subprocess.run(
            [
                "/opt/client/bin/unoconvert",
                "--host",
                "uno-bridge",
                "--port",
                "2003",
                "--host-location",
                "remote",
                "--convert-to",
                "pdf",
                str(source),
                str(output),
            ],
            check=True,
            timeout=120,
        )
        assert output.read_bytes().startswith(b"%PDF-"), name
        text = subprocess.check_output(["pdftotext", str(output), "-"], timeout=20)
        assert text.strip(), f"No text in converted {name}"
        assert hashlib.sha256(source.read_bytes()).digest() == before, name
        print(f"PASS unchanged {name} -> readable PDF", flush=True)


def application_conversions(expect_failure):
    deadline = time.monotonic() + 240
    while True:
        try:
            status, _ = request("/api/v1/info/status")
            if status == 200:
                break
        except OSError:
            pass
        if time.monotonic() > deadline:
            raise RuntimeError("Application did not become ready")
        time.sleep(2)
    status, data = convert_api("input.txt", b"Isolated office conversion sentinel")
    if expect_failure:
        assert status >= 400 and not data.startswith(b"%PDF-"), (status, data[:100])
        status, data = convert_api(
            "input.pdf",
            pathlib.Path("/fixtures/tables.pdf").read_bytes(),
            "pdf/word",
            "docx",
        )
        assert status >= 400 and not data.startswith(b"PK"), (status, data[:100])
        print("PASS worker outage fails office-to-PDF conversion", flush=True)
        print("PASS worker outage fails PDF-to-office conversion", flush=True)
        return
    assert status == 200 and data.startswith(b"%PDF-"), (status, data[:300])
    status, document = convert_api("input.pdf", data, "pdf/word", "docx")
    assert status == 200 and document.startswith(b"PK"), (status, document[:300])
    print("PASS application office-to-PDF and PDF-to-DOCX", flush=True)


if __name__ == "__main__":
    mode = sys.argv[1]
    if mode == "fixtures":
        fixture_conversions()
    else:
        application_conversions(expect_failure=mode == "outage")
