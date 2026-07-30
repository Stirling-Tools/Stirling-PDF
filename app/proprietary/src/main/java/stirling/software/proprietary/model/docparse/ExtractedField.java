package stirling.software.proprietary.model.docparse;

import java.util.List;

import tools.jackson.databind.JsonNode;

/**
 * One extracted field with confidence and citations. Mirrors {@code docparse.py ExtractedField}.
 */
public record ExtractedField(
        String name, JsonNode value, double confidence, List<FieldCitation> citations) {

    public ExtractedField {
        citations = citations == null ? List.of() : citations;
    }
}
