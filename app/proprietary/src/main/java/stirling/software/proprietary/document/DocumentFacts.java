package stirling.software.proprietary.document;

import java.io.IOException;
import java.io.InputStream;
import java.util.Calendar;
import java.util.List;
import java.util.Locale;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDDocumentInformation;
import org.springframework.core.io.Resource;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.service.PdfMetadataService;
import stirling.software.proprietary.integration.purview.PdfSensitivityLabels;
import stirling.software.proprietary.integration.purview.SensitivityLabel;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ObjectNode;

/**
 * What Stirling knows about a document from its bytes alone, as one JSON object:
 *
 * <pre>
 * document.filename | .extension | .sizeBytes | .pageCount | .encrypted
 *         .title | .author | .subject | .keywords | .creator | .producer | .created | .modified
 * classification.*         the classifier policy's verdict, when it has run
 * sensitivityLabel.labelId | .name | .siteId | .method | .protected
 * </pre>
 *
 * <p>Two callers share this shape, which is why it lives apart from either. The external-API step
 * wraps it as the namespace its placeholders resolve against (adding the transfer-only facts a
 * call-out needs - content type, hash, the bytes themselves - and the run it belongs to). Routing
 * rules match against it, so {@code classification.labels} decides where a document is delivered.
 *
 * <p>Every field is best-effort: a non-PDF or an unparseable PDF simply omits what cannot be known.
 * Building the facts must never be the reason a step or a delivery fails.
 */
@Slf4j
public final class DocumentFacts {

    private DocumentFacts() {}

    /** The facts for a document already in memory, as a fresh object the caller may add to. */
    public static ObjectNode of(byte[] content, String filename, ObjectMapper objectMapper) {
        ObjectNode root = objectMapper.createObjectNode();
        ObjectNode document = base(root, filename, content == null ? 0 : content.length);
        if (looksLikePdf(content)) {
            addPdfFacts(document, root, objectMapper, () -> Loader.loadPDF(content));
        }
        return root;
    }

    /**
     * The facts for a document the engine is carrying between steps.
     *
     * <p>A file-backed resource - what the executor produces between steps - is opened by handle,
     * so routing a large document does not pull it into memory to read a label off it. Anything
     * else is read once into a buffer and handled by the in-memory path: a stream-backed resource
     * can only be consumed once, so sniffing the header and then re-opening it would either fail or
     * silently read nothing.
     */
    public static ObjectNode of(Resource file, ObjectMapper objectMapper) {
        if (!file.isFile()) {
            return ofBuffered(file, objectMapper);
        }
        ObjectNode root = objectMapper.createObjectNode();
        ObjectNode document = base(root, file.getFilename(), sizeOf(file));
        if (looksLikePdfOnDisk(file)) {
            addPdfFacts(document, root, objectMapper, () -> Loader.loadPDF(file.getFile()));
        }
        return root;
    }

    /** The one-shot path: read the bytes once, then treat it as an in-memory document. */
    private static ObjectNode ofBuffered(Resource file, ObjectMapper objectMapper) {
        try {
            return of(file.getContentAsByteArray(), file.getFilename(), objectMapper);
        } catch (IOException e) {
            log.debug("Could not read {} for its facts: {}", file.getFilename(), e.getMessage());
            ObjectNode root = objectMapper.createObjectNode();
            base(root, file.getFilename(), 0);
            return root;
        }
    }

    private static ObjectNode base(ObjectNode root, String filename, long sizeBytes) {
        ObjectNode document = root.putObject("document");
        document.put("filename", filename);
        document.put("extension", extensionOf(filename));
        document.put("sizeBytes", sizeBytes);
        return document;
    }

    /** Opens a document the caller's way; anything it throws is swallowed as a missing fact. */
    private interface PdfSupplier {
        PDDocument get() throws IOException;
    }

    /** PDF-only facts. A document we cannot parse still gets the basics above. */
    private static void addPdfFacts(
            ObjectNode document, ObjectNode root, ObjectMapper objectMapper, PdfSupplier supplier) {
        try (PDDocument pdf = supplier.get()) {
            document.put("pageCount", pdf.getNumberOfPages());
            document.put("encrypted", pdf.isEncrypted());

            PDDocumentInformation info = pdf.getDocumentInformation();
            document.put("title", info.getTitle());
            document.put("author", info.getAuthor());
            document.put("subject", info.getSubject());
            document.put("keywords", info.getKeywords());
            document.put("creator", info.getCreator());
            document.put("producer", info.getProducer());
            document.put("created", toIso(info.getCreationDate()));
            document.put("modified", toIso(info.getModificationDate()));

            addClassification(root, info, objectMapper);
            addSensitivityLabel(root, pdf);
        } catch (IOException | RuntimeException e) {
            // An encrypted or malformed PDF is a normal thing to meet here; the extra facts are a
            // convenience, not a precondition.
            log.debug("Could not read PDF facts: {}", e.getMessage());
        }
    }

    /** The classifier policy's verdict, so a caller can act on it without re-classifying. */
    private static void addClassification(
            ObjectNode root, PDDocumentInformation info, ObjectMapper objectMapper) {
        String raw = info.getCustomMetadataValue(PdfMetadataService.CLASSIFICATION_KEY);
        if (raw == null || raw.isBlank()) {
            return;
        }
        try {
            JsonNode parsed = objectMapper.readTree(raw);
            root.set("classification", parsed);
        } catch (RuntimeException e) {
            // Written by another tool; if it is not JSON, pass it through as text rather than drop
            // it - the receiving system may still recognise it.
            root.put("classification", raw);
        }
    }

    /** The Purview label already on the document, if any. */
    private static void addSensitivityLabel(ObjectNode root, PDDocument pdf) {
        List<SensitivityLabel> labels = PdfSensitivityLabels.readAll(pdf);
        if (labels.isEmpty()) {
            return;
        }
        SensitivityLabel label = labels.get(0);
        ObjectNode node = root.putObject("sensitivityLabel");
        node.put("labelId", label.labelId());
        node.put("name", label.name());
        node.put("siteId", label.siteId());
        node.put("method", label.method() == null ? null : label.method().name());
        node.put("protected", label.isProtected());
    }

    /** Cheap check so a non-PDF never pays for a parse attempt. */
    public static boolean looksLikePdf(byte[] content) {
        return content != null
                && content.length > 4
                && content[0] == '%'
                && content[1] == 'P'
                && content[2] == 'D'
                && content[3] == 'F';
    }

    /**
     * The same check on a file, without reading past the header. Safe to re-open afterwards, which
     * is why this path is only taken for a resource backed by a real file.
     */
    private static boolean looksLikePdfOnDisk(Resource file) {
        byte[] header = new byte[5];
        try (InputStream in = file.getInputStream()) {
            return in.readNBytes(header, 0, header.length) == header.length && looksLikePdf(header);
        } catch (IOException e) {
            log.debug("Could not read the header of {}: {}", file.getFilename(), e.getMessage());
            return false;
        }
    }

    private static long sizeOf(Resource file) {
        try {
            return file.contentLength();
        } catch (IOException e) {
            return 0;
        }
    }

    private static String toIso(Calendar calendar) {
        return calendar == null ? null : calendar.toInstant().toString();
    }

    private static String extensionOf(String filename) {
        if (filename == null) {
            return null;
        }
        int dot = filename.lastIndexOf('.');
        return dot < 0 || dot == filename.length() - 1
                ? null
                : filename.substring(dot + 1).toLowerCase(Locale.ROOT);
    }
}
