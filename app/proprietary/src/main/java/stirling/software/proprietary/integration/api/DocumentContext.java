package stirling.software.proprietary.integration.api;

import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.util.Base64;
import java.util.HexFormat;

import org.springframework.web.multipart.MultipartFile;

import stirling.software.proprietary.document.DocumentFacts;

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
 * <p>{@link DocumentFacts} supplies everything derivable from the bytes; this adds the three
 * transfer-only fields a call-out needs and the run it belongs to.
 *
 * <p>Every field is best-effort: a non-PDF, an unparseable PDF, or an ad-hoc run with no policy
 * simply omits what it cannot know. Building the context must never be the reason a step fails.
 */
final class DocumentContext {

    private DocumentContext() {}

    static ObjectNode build(
            MultipartFile file,
            byte[] content,
            String policyName,
            String runId,
            ObjectMapper objectMapper) {
        ObjectNode root = DocumentFacts.of(content, file.getOriginalFilename(), objectMapper);
        ObjectNode document = (ObjectNode) root.get("document");
        document.put("contentType", file.getContentType());
        document.put("sha256", sha256(content));
        // The bytes themselves, for steps that carry the document inside a JSON body
        // (an attachment field, a signing payload) rather than as multipart.
        document.put("base64", Base64.getEncoder().encodeToString(content));

        ObjectNode run = root.putObject("run");
        run.put("policyName", policyName);
        run.put("runId", runId);
        run.put("timestamp", Instant.now().toString());
        return root;
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
}
