"""Templates that open mid-line, whose closing delimiter starts a line."""

_TOOL_IO = '''
TOOL_IO: dict[ToolEndpoint, ToolIOSpec] = {{
{declarations}
}}
'''

_HEADER = """
# Header emitted into the output file.
# Types
"""


def resolve(schema):
    if "$ref" in schema:
        return lookup(schema["$ref"])
    return schema


def canary():
    # Build document
    document = build()
    return document
