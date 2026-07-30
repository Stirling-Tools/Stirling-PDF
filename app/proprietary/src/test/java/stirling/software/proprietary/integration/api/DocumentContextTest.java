package stirling.software.proprietary.integration.api;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.time.Instant;
import java.util.Base64;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;

import stirling.software.common.service.PdfMetadataService;
import stirling.software.proprietary.integration.purview.PdfSensitivityLabels;
import stirling.software.proprietary.integration.purview.SensitivityLabel;
import stirling.software.proprietary.integration.purview.SensitivityLabel.AssignmentMethod;

import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ObjectNode;

/**
 * The context is what an external API gets told about the document, so it is asserted concretely.
 */
class DocumentContextTest {

    private static final String TENANT = "cb46c030-1825-4e81-a295-151c039dbf02";
    private final ObjectMapper objectMapper = new ObjectMapper();

    private static byte[] pdfBytes(java.util.function.Consumer<PDDocument> customise)
            throws IOException {
        try (PDDocument document = new PDDocument()) {
            document.addPage(new PDPage());
            document.addPage(new PDPage());
            customise.accept(document);
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            document.save(out);
            return out.toByteArray();
        }
    }

    private ObjectNode contextOf(byte[] content, String filename, String policyName, String runId) {
        MockMultipartFile file =
                new MockMultipartFile("fileInput", filename, "application/pdf", content);
        return DocumentContext.build(file, content, policyName, runId, objectMapper);
    }

    @Test
    void describesThePdfAndTheRun() throws IOException {
        byte[] content =
                pdfBytes(
                        document -> {
                            document.getDocumentInformation().setTitle("Q3 Invoice");
                            document.getDocumentInformation().setAuthor("Anthony");
                        });

        ObjectNode context = contextOf(content, "invoice.pdf", "Outbound review", "run-42");

        assertThat(context.at("/document/filename").asString()).isEqualTo("invoice.pdf");
        assertThat(context.at("/document/extension").asString()).isEqualTo("pdf");
        assertThat(context.at("/document/contentType").asString()).isEqualTo("application/pdf");
        assertThat(context.at("/document/sizeBytes").asInt()).isEqualTo(content.length);
        assertThat(context.at("/document/pageCount").asInt()).isEqualTo(2);
        assertThat(context.at("/document/encrypted").asBoolean()).isFalse();
        assertThat(context.at("/document/title").asString()).isEqualTo("Q3 Invoice");
        assertThat(context.at("/document/author").asString()).isEqualTo("Anthony");
        assertThat(context.at("/run/policyName").asString()).isEqualTo("Outbound review");
        assertThat(context.at("/run/runId").asString()).isEqualTo("run-42");
        assertThat(Instant.parse(context.at("/run/timestamp").asString())).isNotNull();
    }

    @Test
    void hashesTheContentTheApiWillReceive() throws IOException {
        byte[] content = pdfBytes(document -> {});

        String sha = contextOf(content, "a.pdf", null, null).at("/document/sha256").asString();

        assertThat(sha).hasSize(64).matches("[0-9a-f]{64}");
        // Same bytes, same hash: external systems key on this for dedupe and chain-of-custody.
        assertThat(contextOf(content, "renamed.pdf", null, null).at("/document/sha256").asString())
                .isEqualTo(sha);
    }

    @Test
    void carriesTheBytesAsBase64ForBodyPayloads() throws IOException {
        // Presets that attach or sign the document reference {{document.base64}}; without this the
        // placeholder is unknown and the whole step fails at resolution time.
        byte[] content = pdfBytes(document -> {});

        String base64 = contextOf(content, "a.pdf", null, null).at("/document/base64").asString();

        assertThat(Base64.getDecoder().decode(base64)).isEqualTo(content);
    }

    @Test
    void surfacesAnExistingPurviewLabel() throws IOException {
        byte[] content =
                pdfBytes(
                        document -> {
                            try {
                                PdfSensitivityLabels.apply(
                                        document,
                                        new SensitivityLabel(
                                                "2096f6a2-d2f7-48be-b329-b73aaa526e5d",
                                                "Confidential",
                                                TENANT,
                                                AssignmentMethod.PRIVILEGED,
                                                null,
                                                null));
                            } catch (IOException e) {
                                throw new java.io.UncheckedIOException(e);
                            }
                        });

        ObjectNode context = contextOf(content, "secret.pdf", null, null);

        assertThat(context.at("/sensitivityLabel/name").asString()).isEqualTo("Confidential");
        assertThat(context.at("/sensitivityLabel/siteId").asString()).isEqualTo(TENANT);
        assertThat(context.at("/sensitivityLabel/method").asString()).isEqualTo("PRIVILEGED");
        assertThat(context.at("/sensitivityLabel/protected").asBoolean()).isFalse();
    }

    @Test
    void surfacesTheClassifierVerdictAsJson() throws IOException {
        byte[] content =
                pdfBytes(
                        document ->
                                document.getDocumentInformation()
                                        .setCustomMetadataValue(
                                                PdfMetadataService.CLASSIFICATION_KEY,
                                                "{\"label\":\"invoice\",\"confidence\":0.91}"));

        ObjectNode context = contextOf(content, "a.pdf", null, null);

        // Nested, not a JSON string, so {{classification.label}} resolves.
        assertThat(context.at("/classification/label").asString()).isEqualTo("invoice");
        assertThat(context.at("/classification/confidence").asDouble()).isEqualTo(0.91);
    }

    @Test
    void omitsWhatIsAbsentRatherThanInventingIt() throws IOException {
        ObjectNode context = contextOf(pdfBytes(document -> {}), "a.pdf", null, null);

        assertThat(context.has("sensitivityLabel")).isFalse();
        assertThat(context.has("classification")).isFalse();
        assertThat(context.at("/run/policyName").isNull()).isTrue();
    }

    @Test
    void aNonPdfStillGetsTheBasics() {
        byte[] content = "just text".getBytes();
        MockMultipartFile file =
                new MockMultipartFile("fileInput", "notes.txt", "text/plain", content);

        ObjectNode context = DocumentContext.build(file, content, null, null, objectMapper);

        assertThat(context.at("/document/filename").asString()).isEqualTo("notes.txt");
        assertThat(context.at("/document/extension").asString()).isEqualTo("txt");
        assertThat(context.at("/document/sizeBytes").asInt()).isEqualTo(content.length);
        assertThat(context.at("/document/sha256").asString()).hasSize(64);
        // No PDF facts, and no exception either.
        assertThat(context.at("/document/pageCount").isMissingNode()).isTrue();
    }

    @Test
    void unparseableBytesClaimingToBeAPdfDoNotFailTheStep() {
        byte[] content = "%PDF-1.7 but truncated".getBytes();
        MockMultipartFile file =
                new MockMultipartFile("fileInput", "broken.pdf", "application/pdf", content);

        ObjectNode context = DocumentContext.build(file, content, null, null, objectMapper);

        assertThat(context.at("/document/sha256").asString()).hasSize(64);
        assertThat(context.at("/document/pageCount").isMissingNode()).isTrue();
    }
}
