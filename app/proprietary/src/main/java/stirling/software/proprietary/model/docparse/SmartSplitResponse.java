package stirling.software.proprietary.model.docparse;

import java.util.List;

/** Engine response for {@code POST /api/v1/docparse/split}. */
public record SmartSplitResponse(List<SplitPart> parts) {

    public SmartSplitResponse {
        parts = parts == null ? List.of() : parts;
    }
}
