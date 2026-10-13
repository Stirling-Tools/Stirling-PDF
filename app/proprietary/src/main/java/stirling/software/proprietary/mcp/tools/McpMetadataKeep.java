package stirling.software.proprietary.mcp.tools;

import java.io.IOException;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.Calendar;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDDocumentInformation;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ObjectNode;

/**
 * update-metadata removes every standard field a call leaves out. A chat edit names only what
 * should change, so the fields it omits are filled in from the file first.
 */
final class McpMetadataKeep {

    static final String OPERATION = "update-metadata";
    // The format MetadataController reads dates in (PdfMetadataService.parseToCalendar).
    private static final DateTimeFormatter DATE =
            DateTimeFormatter.ofPattern("yyyy/MM/dd HH:mm:ss");

    private McpMetadataKeep() {}

    /** The parameters with each omitted standard field set to the file's current value. */
    static JsonNode withCurrentValues(ObjectMapper mapper, JsonNode parameters, byte[] pdf) {
        ObjectNode merged =
                parameters != null && parameters.isObject()
                        ? ((ObjectNode) parameters).deepCopy()
                        : mapper.createObjectNode();
        if (merged.path("deleteAll").asBoolean(false) || pdf == null) {
            return parameters;
        }
        try (PDDocument document = Loader.loadPDF(pdf)) {
            PDDocumentInformation info = document.getDocumentInformation();
            keep(merged, "author", info.getAuthor());
            keep(merged, "creator", info.getCreator());
            keep(merged, "keywords", info.getKeywords());
            keep(merged, "producer", info.getProducer());
            keep(merged, "subject", info.getSubject());
            keep(merged, "title", info.getTitle());
            keep(merged, "trapped", info.getTrapped());
            keep(merged, "creationDate", date(info.getCreationDate()));
            keep(merged, "modificationDate", date(info.getModificationDate()));
        } catch (IOException | RuntimeException e) {
            // An unreadable or encrypted file goes on as asked; the operation reports why.
            return parameters;
        }
        return merged;
    }

    private static void keep(ObjectNode parameters, String field, String current) {
        if (!parameters.has(field) && current != null && !current.isBlank()) {
            parameters.put(field, current);
        }
    }

    private static String date(Calendar calendar) {
        return calendar == null
                ? null
                : DATE.format(calendar.toInstant().atZone(ZoneId.systemDefault()));
    }
}
