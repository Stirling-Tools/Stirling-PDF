package stirling.software.proprietary.policy.routing;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDDocumentInformation;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;

import stirling.software.common.service.PdfMetadataService;
import stirling.software.proprietary.document.DocumentFacts;
import stirling.software.proprietary.document.conditions.Condition;
import stirling.software.proprietary.document.conditions.ConditionEvaluator;
import stirling.software.proprietary.document.conditions.ConditionInput;
import stirling.software.proprietary.policy.model.RoutingRule;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * Routes real files, not hand-written fact JSON: each document is written to disk, read back
 * through {@link DocumentFacts}, and matched with {@link ConditionEvaluator} in the order and
 * first-match-wins shape {@code PolicyEngine.destinationsFor} uses at dispatch.
 */
class RoutingOnRealDocumentsTest {

    private static final String FALLBACK = "archive";

    private final JsonMapper mapper = JsonMapper.builder().build();

    /** The dispatch decision, mirroring PolicyEngine: first rule that claims the file wins. */
    private String destinationFor(List<RoutingRule> rules, Resource file) {
        JsonNode facts = DocumentFacts.of(file, mapper);
        for (RoutingRule rule : rules) {
            if (ConditionEvaluator.matches(rule.condition(), facts)) {
                return rule.outputId();
            }
        }
        return FALLBACK;
    }

    private static RoutingRule rule(String field, String outputId, String... values) {
        return new RoutingRule(
                new Condition.MatchesAny(new ConditionInput.DocumentField(field), List.of(values)),
                outputId);
    }

    /** A real PDF with one page of text and, optionally, Info-dictionary title/author. */
    private static Resource pdf(Path dir, String name, String title, String author, String body)
            throws IOException {
        Path target = dir.resolve(name);
        try (PDDocument doc = new PDDocument()) {
            PDPage page = new PDPage();
            doc.addPage(page);
            try (PDPageContentStream content = new PDPageContentStream(doc, page)) {
                content.beginText();
                content.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA), 12);
                content.newLineAtOffset(72, 700);
                content.showText(body);
                content.endText();
            }
            PDDocumentInformation info = doc.getDocumentInformation();
            if (title != null) info.setTitle(title);
            if (author != null) info.setAuthor(author);
            doc.save(target.toFile());
        }
        return new FileSystemResource(target);
    }

    private static Resource file(Path dir, String name, byte[] bytes) throws IOException {
        Path target = dir.resolve(name);
        Files.write(target, bytes);
        return new FileSystemResource(target);
    }

    @Test
    void routesRealFilesOnEveryNonAiDocumentProperty(@TempDir Path dir) throws IOException {
        List<RoutingRule> rules =
                List.of(
                        rule("document.filename", "scans", "scan-001.pdf"),
                        rule("document.title", "finance", "Q3 Invoice"),
                        rule("document.author", "legal", "Legal Team"),
                        rule("document.extension", "images", "png", "jpg"));

        Resource byFilename = pdf(dir, "scan-001.pdf", "Untitled", "Nobody", "scanned page");
        Resource byTitle = pdf(dir, "anything.pdf", "Q3 Invoice", "Nobody", "invoice body");
        Resource byAuthor = pdf(dir, "other.pdf", "Contract", "Legal Team", "contract body");
        Resource byExtension = file(dir, "logo.png", new byte[] {(byte) 0x89, 'P', 'N', 'G'});
        Resource unmatched = pdf(dir, "misc.pdf", "Something Else", "Someone", "misc body");

        assertThat(destinationFor(rules, byFilename)).isEqualTo("scans");
        assertThat(destinationFor(rules, byTitle)).isEqualTo("finance");
        assertThat(destinationFor(rules, byAuthor)).isEqualTo("legal");
        assertThat(destinationFor(rules, byExtension)).isEqualTo("images");
        assertThat(destinationFor(rules, unmatched)).isEqualTo(FALLBACK);
    }

    @Test
    void matchingIsCaseAndWhitespaceInsensitiveOnRealMetadata(@TempDir Path dir)
            throws IOException {
        List<RoutingRule> rules = List.of(rule("document.title", "finance", "  q3 INVOICE "));
        assertThat(destinationFor(rules, pdf(dir, "a.pdf", "Q3 Invoice", null, "x")))
                .isEqualTo("finance");
    }

    @Test
    void earlierRuleWinsWhenARealFileSatisfiesBoth(@TempDir Path dir) throws IOException {
        Resource both = pdf(dir, "invoice.pdf", "Q3 Invoice", null, "x");
        assertThat(
                        destinationFor(
                                List.of(
                                        rule("document.extension", "images", "pdf"),
                                        rule("document.title", "finance", "Q3 Invoice")),
                                both))
                .isEqualTo("images");
        assertThat(
                        destinationFor(
                                List.of(
                                        rule("document.title", "finance", "Q3 Invoice"),
                                        rule("document.extension", "images", "pdf")),
                                both))
                .isEqualTo("finance");
    }

    @Test
    void noRulesMeansEveryRealFileTakesTheSingleDestination(@TempDir Path dir) throws IOException {
        List<RoutingRule> none = List.of();
        assertThat(destinationFor(none, pdf(dir, "a.pdf", "Q3 Invoice", "Legal Team", "x")))
                .isEqualTo(FALLBACK);
        assertThat(
                        destinationFor(
                                none, file(dir, "b.png", new byte[] {(byte) 0x89, 'P', 'N', 'G'})))
                .isEqualTo(FALLBACK);
    }

    /**
     * The AI half: {@code routing/classify.labels.json} is a recorded verdict the engine's
     * DocumentClassifierAgent produced for an invoice against the built-in label vocabulary, and
     * routing reads it back off the PDF exactly as dispatch does. A missing verdict fails rather
     * than quietly passing.
     */
    @Test
    void routesOnAClassificationVerdictWrittenByARealModel(@TempDir Path dir) throws IOException {
        String verdict = realVerdict();
        List<String> labels = labelsOf(verdict);
        assertThat(labels).as("the recorded model verdict carries a label").isNotEmpty();

        Path target = dir.resolve("classified.pdf");
        try (PDDocument doc = new PDDocument()) {
            doc.addPage(new PDPage());
            doc.getDocumentInformation()
                    .setCustomMetadataValue(PdfMetadataService.CLASSIFICATION_KEY, verdict);
            doc.save(target.toFile());
        }
        Resource classified = new FileSystemResource(target);

        JsonNode facts = DocumentFacts.of(classified, mapper);
        assertThat(facts.path("classification").path("labels").isArray()).isTrue();

        List<RoutingRule> rules =
                List.of(
                        rule("classification.labels", "finance", labels.get(0)),
                        rule("document.extension", "images", "png"));
        assertThat(destinationFor(rules, classified)).isEqualTo("finance");

        List<RoutingRule> otherLabelOnly =
                List.of(rule("classification.labels", "finance", "a-label-the-model-did-not-pick"));
        assertThat(destinationFor(otherLabelOnly, classified)).isEqualTo(FALLBACK);
    }

    /**
     * Read from the classpath so Gradle treats the verdict as a test input and re-runs on change.
     */
    private static String realVerdict() throws IOException {
        try (InputStream in =
                RoutingOnRealDocumentsTest.class.getResourceAsStream(
                        "/routing/classify.labels.json")) {
            assertThat(in).as("routing/classify.labels.json is on the test classpath").isNotNull();
            return new String(in.readAllBytes(), StandardCharsets.UTF_8).trim();
        }
    }

    private List<String> labelsOf(String verdict) {
        List<String> labels = new ArrayList<>();
        mapper.readTree(verdict).path("labels").forEach(node -> labels.add(node.asString()));
        return labels;
    }
}
