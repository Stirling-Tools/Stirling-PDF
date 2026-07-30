package stirling.software.proprietary.model.docparse;

import tools.jackson.databind.JsonNode;

/** Engine request for {@code POST /api/v1/docparse/fill-docx}. */
public record FillDocxRequest(String templateBase64, JsonNode data) {}
