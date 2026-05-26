from .tool_models import ToolEndpoint

# Per-operation hints appended to the base parameter-generation instruction.
# Add an entry here when an operation needs extra guidance beyond "fill the schema".
PARAMETER_HINTS: dict[ToolEndpoint, str] = {
    ToolEndpoint.REDACT_EXECUTE: (
        " For regex patterns, account for the common format variants of whatever pattern "
        "the user asked to redact — different separators, optional prefixes/suffixes, "
        "grouped vs unbroken digits, locale spellings, etc. — so partial matches don't "
        "leak. Cover the realistic shapes the data appears in, not every conceivable form."
    ),
}
