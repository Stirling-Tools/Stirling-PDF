package stirling.software.proprietary.model.docparse;

import java.util.List;

/** Engine response for {@code POST /api/v1/docparse/extract}. */
public record ExtractFieldsResponse(
        DocparseTier mode, List<ExtractedField> fields, double overallConfidence) {

    public ExtractFieldsResponse {
        fields = fields == null ? List.of() : fields;
    }
}
