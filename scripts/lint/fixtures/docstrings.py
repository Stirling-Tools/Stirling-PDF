"""Module docstring, which the scanner must see as documentation."""


def download(blob, timeout_ms):
    """Fetch the blob.

    Args:
        blob: The blob
        timeout_ms: How long to wait before abandoning the read; the caller owns
            retrying, because only it knows whether the operation is idempotent.

    Returns:
        The fetched bytes.
    """
    return read(blob)


def sphinx(blob):
    """Fetch the blob.

    :param blob: The blob
    :returns: the sphinx result
    """
    return read(blob)


def payload():
    # Not documentation: a triple-quoted value, so its contents are data.
    body = """{"key": "value", "note": "Types"}"""
    return body


def canary():
    # Build document
    document = build()
    return document
