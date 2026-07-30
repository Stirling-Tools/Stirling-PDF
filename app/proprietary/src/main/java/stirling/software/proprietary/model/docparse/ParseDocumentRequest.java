package stirling.software.proprietary.model.docparse;

/** Engine request for {@code POST /api/v1/docparse/parse}. */
public record ParseDocumentRequest(String fileName, String contentBase64, boolean withOcr) {}
