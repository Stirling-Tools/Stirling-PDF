package stirling.software.proprietary.model.docparse;

import java.util.List;

/** Engine response for {@code POST /api/v1/docparse/fill-docx}. */
public record FillDocxResponse(String docxBase64, int replaced, List<String> missing) {

    public FillDocxResponse {
        missing = missing == null ? List.of() : missing;
    }
}
