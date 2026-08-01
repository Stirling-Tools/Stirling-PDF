package stirling.software.proprietary.integration.api;

import java.io.IOException;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.util.Base64;
import java.util.Calendar;
import java.util.HexFormat;
import java.util.List;
import java.util.Locale;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDDocumentInformation;
import org.springframework.web.multipart.MultipartFile;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.service.PdfMetadataService;
import stirling.software.proprietary.integration.purview.PdfSensitivityLabels;
import stirling.software.proprietary.integration.purview.SensitivityLabel;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ObjectNode;

/**
 * Everything Stirling already knows about the document and the run, as one JSON object.
 *
 * <p>An external API almost always wants more than the bytes: what the file is, what it was called,
 * whether it is already classified or labelled, and which policy sent it. All of that is in hand at
 * the moment of the call, so it is offered rather than left for the operator to re-derive - most
 * usefully the Purview label and the classifier's verdict, which turn a call-out into something the
 * receiving system can make a decision with.
 *
 * <p>The shape is also the namespace for placeholders (see {@link Placeholders}), so {@code
 * {{document.sha256}}} or {@code {{sensitivityLabel.name}}} in a field, path, or header resolves
 * against exactly what is documented here:
 *
 * <pre>
 * document.filename | .extension | .contentType | .sizeBytes | .sha256 | .base64
 *         .pageCount | .encrypted | .title | .author | .subject | .keywords
 *         .creator | .producer | .created | .modified
 * classification.*         the classifier policy's verdict, when it has run
 * sensitivityLabel.labelId | .name | .siteId | .method | .protected
 * run.policyName | .runId | .timestamp
 * </pre>
 *
 * <p>Every field is best-effort: a non-PDF, an unparseable PDF, or an ad-hoc run with no policy
 * simply omits what it cannot know. Building the context must never be the reason a step fails.
 */
@Slf4j
final class DocumentContext {

    private DocumentContext() {}

    static ObjectNode build(
            MultipartFile file,
            byte[] content,
            String policyName,
            String runId,
            ObjectMapper objectMapper) {
        ObjectNode root = objectMapper.createObjectNode();
        ObjectNode document = root.putObject("document");

        String filename = file.getOriginalFilename();
        document.put("filename", filename);
        document.put("extension", extensionOf(filename));
        document.put("contentType", file.getContentType());
        document.put("sizeBytes", content.length);
        document.put("sha256", sha256(content));
        // The bytes themselves, for steps that carry the document inside a JSON body
        // (an attachment field, a signing payload) rather than as multipart.
        document.put("base64", Base64.getEncoder().encodeToString(content));

        if (looksLikePdf(content)) {
            addPdfFacts(document, root, content, objectMapper);
        }

        ObjectNode run = root.putObject("run");
        run.put("policyName", policyName);
        run.put("runId", runId);
        run.put("timestamp", Instant.now().toString());
        return root;
    }

    /** PDF-only facts. A document we cannot parse still gets the basics above. */
    private static void addPdfFacts(
            ObjectNode document, ObjectNode root, byte[] content, ObjectMapper objectMapper) {
        try (PDDocument pdf = Loader.loadPDF(content)) {
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
            // An encrypted or malformed PDF is a normal thing to send to an external API; the
            // extra facts are a convenience, not a precondition.
            log.debug("Could not read PDF facts for the step context: {}", e.getMessage());
        }
    }

    /** The classifier policy's verdict, so a call-out can act on it without re-classifying. */
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
    private static boolean looksLikePdf(byte[] content) {
        return content.length > 4
                && content[0] == '%'
                && content[1] == 'P'
                && content[2] == 'D'
                && content[3] == 'F';
    }

    /**
     * A content hash is the field external systems most often key on - dedupe, chain-of-custody,
     * "have I already scanned this" - and they cannot compute it without the bytes we are sending.
     */
    private static String sha256(byte[] content) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(content));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 is required by the Java platform", e);
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
