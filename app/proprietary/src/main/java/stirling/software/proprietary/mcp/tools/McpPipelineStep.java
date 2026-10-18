package stirling.software.proprietary.mcp.tools;

import stirling.software.proprietary.mcp.catalog.OperationMeta;

import tools.jackson.databind.JsonNode;

/** One resolved step of a pipeline: a catalog operation and its parameters. */
public record McpPipelineStep(OperationMeta meta, JsonNode parameters) {}
