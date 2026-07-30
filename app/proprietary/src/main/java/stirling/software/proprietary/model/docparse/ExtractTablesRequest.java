package stirling.software.proprietary.model.docparse;

/** Engine request for {@code POST /api/v1/docparse/tables}. */
public record ExtractTablesRequest(String fileName, String contentBase64) {}
