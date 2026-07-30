package stirling.software.proprietary.model.docparse;

import java.util.List;

import stirling.software.proprietary.model.api.ai.AiPageText;

/**
 * Engine request for {@code POST /api/v1/docparse/suggest-schema}. {@code pages} drives the basic
 * tier (Java-extracted text); {@code contentBase64} lets the advanced tier parse the raw file.
 */
public record SuggestSchemaRequest(
        String fileName, List<AiPageText> pages, String contentBase64, int maxFields) {}
