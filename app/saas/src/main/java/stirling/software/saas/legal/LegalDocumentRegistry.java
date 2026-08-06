package stirling.software.saas.legal;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import jakarta.annotation.PostConstruct;

import lombok.extern.slf4j.Slf4j;

/**
 * Loads the versioned legal-document registry from {@code legal/manifest.json} on startup and
 * serves document metadata + rendered markdown from the classpath.
 *
 * <p>Publishing a new version of any document is a content-only change: drop the markdown under
 * {@code legal/<id>/<newVersion>/} and bump that document's {@code version} in the manifest — no
 * code change. Signatures pin the exact {@code {id, version, contentHash}} they were signed against
 * (see the procurement agreement flow), so historical documents stay reproducible.
 *
 * <p>Token slots of the form <code>{{name}}</code> in the markdown are filled at render time. This
 * registry fills the document-level common tokens ({@code version}, {@code version_date}, {@code
 * subprocessor_url}, {@code eula_url}); callers that need per-quote tokens (the enterprise
 * agreement's Order Form) fill the rest.
 */
@Slf4j
@Service
public class LegalDocumentRegistry {

    private static final String MANIFEST = "legal/manifest.json";
    private static final Pattern TOKEN = Pattern.compile("\\{\\{\\s*([a-zA-Z0-9_]+)\\s*}}");

    private final ObjectMapper objectMapper = new ObjectMapper();

    private final Map<String, LegalDocumentMeta> documents = new LinkedHashMap<>();
    private String subprocessorUrl = "";
    private String eulaUrl = "";

    @PostConstruct
    void load() throws IOException {
        JsonNode root;
        try (InputStream in = new ClassPathResource(MANIFEST).getInputStream()) {
            root = objectMapper.readTree(in);
        }
        subprocessorUrl = root.path("subprocessorUrl").asText("");
        eulaUrl = root.path("eulaUrl").asText("");
        JsonNode docs = root.path("documents");
        docs.fieldNames()
                .forEachRemaining(
                        id -> {
                            JsonNode d = docs.get(id);
                            List<String> parts =
                                    objectMapper.convertValue(
                                            d.path("parts"),
                                            objectMapper
                                                    .getTypeFactory()
                                                    .constructCollectionType(
                                                            List.class, String.class));
                            documents.put(
                                    id,
                                    new LegalDocumentMeta(
                                            id,
                                            d.path("label").asText(id),
                                            d.path("displayName").asText(id),
                                            d.path("version").asText("0"),
                                            d.path("effectiveDate").asText(""),
                                            d.path("status").asText("draft"),
                                            parts == null ? List.of() : parts));
                        });
        log.info("[legal] loaded {} document(s) from {}", documents.size(), MANIFEST);
    }

    public Optional<LegalDocumentMeta> meta(String docId) {
        return Optional.ofNullable(documents.get(docId));
    }

    public String subprocessorUrl() {
        return subprocessorUrl;
    }

    public String eulaUrl() {
        return eulaUrl;
    }

    /** Document-level tokens available to every document (before any per-quote tokens). */
    public Map<String, String> commonTokens(LegalDocumentMeta meta) {
        Map<String, String> t = new LinkedHashMap<>();
        t.put("version", meta.version());
        t.put("version_date", meta.effectiveDate());
        t.put("subprocessor_url", subprocessorUrl);
        t.put("eula_url", eulaUrl);
        return t;
    }

    /** Read one static markdown part of a document from the classpath. */
    public String readPart(LegalDocumentMeta meta, String partFile) {
        String path = "legal/" + meta.id() + "/" + meta.version() + "/" + partFile;
        try (InputStream in = new ClassPathResource(path).getInputStream()) {
            return new String(in.readAllBytes(), StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new IllegalStateException("Missing legal document part: " + path, e);
        }
    }

    /**
     * The concatenated static parts of a document (dynamic {@code @}-parts skipped), with only the
     * common tokens filled. Use for fully-static documents (EULA, SLA, subprocessors).
     */
    public String staticMarkdown(String docId) {
        LegalDocumentMeta meta =
                meta(docId)
                        .orElseThrow(
                                () -> new IllegalArgumentException("Unknown document: " + docId));
        Map<String, String> tokens = commonTokens(meta);
        StringBuilder sb = new StringBuilder();
        for (String part : meta.parts()) {
            if (part.startsWith("@")) continue; // dynamic section — not part of the static body
            if (sb.length() > 0) sb.append("\n\n");
            sb.append(fill(readPart(meta, part), tokens));
        }
        return sb.toString();
    }

    /** Replace {@code {{token}}} slots; unknown tokens are left intact so gaps are visible. */
    public static String fill(String markdown, Map<String, String> tokens) {
        Matcher m = TOKEN.matcher(markdown);
        StringBuilder out = new StringBuilder();
        while (m.find()) {
            String key = m.group(1);
            String value = tokens.get(key);
            m.appendReplacement(
                    out,
                    value == null
                            ? Matcher.quoteReplacement(m.group(0))
                            : Matcher.quoteReplacement(value));
        }
        m.appendTail(out);
        return out.toString();
    }
}
