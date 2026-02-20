import os


def before_all(context):
    context.endpoint = None
    context.request_data = None
    context.files = {}
    context.response = None


def before_scenario(context, scenario):
    """Reset all per-scenario state before each scenario runs."""
    context.files = {}
    context.multi_files = []
    context.json_parts = {}
    context.request_data = None
    # JWT auth state
    context.jwt_token = None
    context.original_jwt_token = None
    # OR-status helper used by auth step definitions
    context._status_ok = False


def after_scenario(context, scenario):
    if hasattr(context, "files"):
        for file in context.files.values():
            try:
                file.close()
            except Exception:
                pass

    # Close any multi-file handles
    for _key, file in getattr(context, "multi_files", []):
        try:
            file.close()
        except Exception:
            pass

    if os.path.exists("response_file"):
        os.remove("response_file")
    # Guard against context.file_name being None (e.g. reset from a previous scenario)
    if hasattr(context, "file_name") and context.file_name and os.path.exists(context.file_name):
        os.remove(context.file_name)

    # Remove any temporary files generated during the scenario
    for temp_file in os.listdir("."):
        if temp_file.startswith("genericNonCustomisableName") or temp_file.startswith(
            "temp_image_"
        ):
            try:
                os.remove(temp_file)
            except Exception:
                pass

    # Reset all per-scenario state so stale handles don't bleed into the next scenario
    context.files = {}
    context.multi_files = []
    context.json_parts = {}
    context.request_data = None
    # JWT auth state
    context.jwt_token = None
    context.original_jwt_token = None
    context._status_ok = False
