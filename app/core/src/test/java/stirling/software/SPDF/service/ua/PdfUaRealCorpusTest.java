package stirling.software.SPDF.service.ua;

import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.stream.Stream;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.text.PDFTextStripper;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import stirling.software.SPDF.model.api.ua.PdfUaConversionOutcome;
import stirling.software.common.pdf.ua.PdfUaProfile;
import stirling.software.common.pdf.ua.TaggingOptions;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.service.PdfMetadataService;

/**
 * Runs the converter over every PDF in the repository, where real-tool output breaks assumptions. A
 * clean refusal counts as a pass; nothing may crash or make a false conformance claim.
 */
class PdfUaRealCorpusTest {

    private static PdfUaConversionService service;
    private static Path repoRoot;

    /** Files the converter is expected to refuse rather than process. */
    private static final List<String> EXPECTED_REJECTS = List.of("encrypted.pdf", "corrupted.pdf");

    @BeforeAll
    static void setUp() {
        PdfUaValidationService validation = new PdfUaValidationService();
        validation.initialise();
        service =
                new PdfUaConversionService(
                        validation,
                        new FontEmbeddingService(),
                        new CustomPDFDocumentFactory(
                                org.mockito.Mockito.mock(PdfMetadataService.class)));
        repoRoot = findRepoRoot();
    }

    private static Path findRepoRoot() {
        Path current = Path.of("").toAbsolutePath();
        while (current != null && !Files.exists(current.resolve("settings.gradle"))) {
            current = current.getParent();
        }
        return current;
    }

    private record Outcome(String name, String status, int failures, int elements, int artifacts) {}

    private static TaggingOptions.TaggingOptionsBuilder options(String fallbackTitle) {
        return TaggingOptions.builder()
                .profile(PdfUaProfile.UA1)
                .language("en-GB")
                .fallbackTitle(fallbackTitle)
                .existingTags(TaggingOptions.ExistingTags.REBUILD);
    }

    @Test
    @DisplayName("converts every PDF in the repository without crashing or lying about conformance")
    void realCorpusConverts() throws Exception {
        assertNotNull(repoRoot, "could not locate the repository root");
        List<Path> pdfs = findPdfs();
        assertTrue(pdfs.size() >= 20, "expected a substantial corpus, found " + pdfs.size());

        List<Outcome> outcomes = new ArrayList<>();
        List<String> crashes = new ArrayList<>();
        java.util.Map<String, Integer> clauseFiles = new java.util.TreeMap<>();
        java.util.Map<String, String> clauseText = new java.util.HashMap<>();
        java.util.Map<String, String> clauseExamples = new java.util.HashMap<>();

        for (Path pdf : pdfs) {
            String name = repoRoot.relativize(pdf).toString().replace('\\', '/');
            byte[] input;
            try {
                input = Files.readAllBytes(pdf);
            } catch (IOException e) {
                continue;
            }
            try {
                String stem = pdf.getFileName().toString().replaceFirst("\\.pdf$", "");

                // Fidelity is a tagging property, so measure it with font embedding off.
                PdfUaConversionOutcome taggedOnly =
                        service.convert(input, options(stem).embedFonts(false).build());
                assertTextPreserved(name, input, taggedOnly.pdfBytes());

                PdfUaConversionOutcome outcome = service.convert(input, options(stem).build());
                // Full pipeline too: Ghostscript can exit 0 having blanked the document.
                assertTextPreserved(name + " (with font embedding)", input, outcome.pdfBytes());
                outcomes.add(
                        new Outcome(
                                name,
                                outcome.declared() ? "CONFORMS" : "improved",
                                outcome.validation().totalFailures(),
                                outcome.tagging().taggedElements(),
                                outcome.tagging().artifacts()));
                outcome.validation()
                        .issues()
                        .forEach(
                                issue -> {
                                    clauseFiles.merge(issue.getClause(), 1, Integer::sum);
                                    clauseText.putIfAbsent(
                                            issue.getClause(), issue.getTechnicalMessage());
                                    clauseExamples.putIfAbsent(issue.getClause(), name);
                                });

            } catch (IOException e) {
                // A refusal with an explanation is an acceptable outcome.
                outcomes.add(new Outcome(name, "refused: " + e.getMessage(), 0, 0, 0));
            } catch (RuntimeException e) {
                crashes.add(name + " -> " + e);
                outcomes.add(new Outcome(name, "CRASH: " + e, 0, 0, 0));
            }
        }

        System.out.println(render(outcomes));

        StringBuilder clauses =
                new StringBuilder("\nBlocking clauses, by number of files affected\n");
        clauseFiles.entrySet().stream()
                .sorted(java.util.Map.Entry.<String, Integer>comparingByValue().reversed())
                .forEach(
                        e ->
                                clauses.append(
                                        String.format(
                                                "  clause %-9s %-3d files  e.g. %s%n      %s%n",
                                                e.getKey(),
                                                e.getValue(),
                                                clauseExamples.get(e.getKey()),
                                                abbreviate(clauseText.get(e.getKey())))));
        System.out.println(clauses);

        List<String> unexpectedCrashes =
                crashes.stream()
                        .filter(c -> EXPECTED_REJECTS.stream().noneMatch(c::contains))
                        .toList();
        assertTrue(
                unexpectedCrashes.isEmpty(),
                "converter crashed on: " + String.join("; ", unexpectedCrashes));
    }

    /** Tagging must not change extracted text; a diff means the rewrite corrupted the page. */
    private static void assertTextPreserved(String name, byte[] before, byte[] after) {
        String textBefore = safeExtract(before);
        if (textBefore == null) {
            // The source itself is unreadable, so there is nothing to compare against.
            return;
        }
        String textAfter = safeExtract(after);
        assertTrue(
                textAfter != null, "the converted file could not be read back at all for " + name);
        assertTrue(
                textBefore.equals(textAfter),
                "tagging changed extracted text for "
                        + name
                        + "\n  before: "
                        + preview(textBefore)
                        + "\n  after:  "
                        + preview(textAfter));
    }

    private static String abbreviate(String text) {
        if (text == null) {
            return "";
        }
        return text.length() <= 110 ? text : text.substring(0, 110) + "...";
    }

    private static String preview(String text) {
        return text.length() <= 160 ? text : text.substring(0, 160) + "...";
    }

    private static String safeExtract(byte[] pdf) {
        try (PDDocument document = Loader.loadPDF(pdf)) {
            PDFTextStripper stripper = new PDFTextStripper();
            stripper.setSortByPosition(true);
            return normalise(stripper.getText(document));
        } catch (Exception e) {
            return null;
        }
    }

    /** Drops invisible formatting characters: a rebuild legitimately loses soft hyphens. */
    static String normalise(String text) {
        StringBuilder sb = new StringBuilder(text.length());
        text.codePoints()
                .forEach(
                        cp -> {
                            if (Character.getType(cp) != Character.FORMAT && cp != 0x00AD) {
                                sb.appendCodePoint(cp);
                            }
                        });
        return sb.toString().replaceAll("\\s+", " ").strip();
    }

    private List<Path> findPdfs() throws IOException {
        try (Stream<Path> stream = Files.walk(repoRoot)) {
            return stream.filter(Files::isRegularFile)
                    .filter(p -> p.toString().toLowerCase().endsWith(".pdf"))
                    .filter(p -> !p.toString().contains("node_modules"))
                    .filter(p -> !p.toString().contains(File_BUILD))
                    .filter(p -> !p.toString().contains(".git"))
                    .sorted(Comparator.comparing(Path::toString))
                    .toList();
        }
    }

    private static final String File_BUILD = "build" + java.io.File.separator;

    private static String render(List<Outcome> outcomes) {
        StringBuilder sb = new StringBuilder("\nPDF/UA conversion over the repository corpus\n");
        long conforming = outcomes.stream().filter(o -> "CONFORMS".equals(o.status())).count();
        long refused = outcomes.stream().filter(o -> o.status().startsWith("refused")).count();
        sb.append(
                String.format(
                        "  %d files: %d conform, %d improved but not conformant, %d refused%n%n",
                        outcomes.size(),
                        conforming,
                        outcomes.size() - conforming - refused,
                        refused));
        for (Outcome outcome : outcomes) {
            sb.append(
                    String.format(
                            "  %-62s %-10s fail=%-4d el=%-5d art=%d%n",
                            outcome.name().length() > 60
                                    ? "..." + outcome.name().substring(outcome.name().length() - 57)
                                    : outcome.name(),
                            outcome.status().length() > 10
                                    ? outcome.status().substring(0, 10)
                                    : outcome.status(),
                            outcome.failures(),
                            outcome.elements(),
                            outcome.artifacts()));
        }
        return sb.toString();
    }
}
