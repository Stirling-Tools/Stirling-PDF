package stirling.software.proprietary.model.docparse;

import java.util.List;

/** Engine response for {@code POST /api/v1/docparse/tables}. */
public record ExtractTablesResponse(DocparseTier mode, List<DocTable> tables) {

    public ExtractTablesResponse {
        tables = tables == null ? List.of() : tables;
    }
}
