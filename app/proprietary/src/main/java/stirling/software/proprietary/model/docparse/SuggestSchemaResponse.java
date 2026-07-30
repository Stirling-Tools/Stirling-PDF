package stirling.software.proprietary.model.docparse;

import java.util.List;

/** Engine response for {@code POST /api/v1/docparse/suggest-schema}. */
public record SuggestSchemaResponse(DocparseTier mode, List<SuggestedField> fields) {

    public SuggestSchemaResponse {
        fields = fields == null ? List.of() : fields;
    }
}
