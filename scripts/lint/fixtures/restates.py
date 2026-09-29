def build(request):
    # Get the current status
    status = request.current_status()

    # ---- helpers ----

    # Truncated to 200 chars because the audit column is varchar(200) and a
    # longer value fails the insert rather than being trimmed.
    return status[:200]
