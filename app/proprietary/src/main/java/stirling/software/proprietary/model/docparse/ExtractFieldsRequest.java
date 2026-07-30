package stirling.software.proprietary.model.docparse;

import java.util.List;

import stirling.software.proprietary.model.api.ai.AiPageText;

import tools.jackson.databind.JsonNode;

/**
 * Engine request for {@code POST /api/v1/docparse/extract}. {@code pages} drives the basic tier
 * (Java-extracted text); {@code contentBase64} lets the advanced tier parse the raw file itself.
 */
public record ExtractFieldsRequest(
        String fileName,
        JsonNode fieldsSchema,
        List<AiPageText> pages,
        String contentBase64,
        DocparseMode mode,
        String instructions) {}
