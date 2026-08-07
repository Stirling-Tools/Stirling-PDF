package stirling.software.SPDF.service.ua;

import static org.junit.jupiter.api.Assertions.assertTrue;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.stream.Stream;

import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;

import stirling.software.SPDF.model.api.ua.PdfUaConversionOutcome;
import stirling.software.common.pdf.ua.PdfUaProfile;
import stirling.software.common.pdf.ua.TaggingOptions;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.service.PdfMetadataService;

/**
 * Dumps converted output for independent checkers; validating PDFBox with PDFBox is circular. Off
 * by default as it writes outside the build directory: run with {@code DUMP_UA_SAMPLES=<dir>}.
 */
@EnabledIfEnvironmentVariable(named = "DUMP_UA_SAMPLES", matches = ".+")
class PdfUaSampleDumpTest {

    private static PdfUaConversionService service;
    private static Path repoRoot;

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
        repoRoot = Path.of("").toAbsolutePath();
        while (repoRoot != null && !Files.exists(repoRoot.resolve("settings.gradle"))) {
            repoRoot = repoRoot.getParent();
        }
    }

    @Test
    @DisplayName("writes original and converted pairs for external validation")
    void dumpSamples() throws Exception {
        Path out = Path.of(System.getenv("DUMP_UA_SAMPLES"));
        Files.createDirectories(out);

        List<Path> pdfs;
        try (Stream<Path> stream = Files.walk(repoRoot)) {
            pdfs =
                    stream.filter(Files::isRegularFile)
                            .filter(p -> p.toString().toLowerCase().endsWith(".pdf"))
                            .filter(p -> !p.toString().contains("node_modules"))
                            .filter(p -> !p.toString().contains(java.io.File.separator + "build"))
                            .filter(p -> !p.toString().contains(".git"))
                            .sorted()
                            .toList();
        }

        List<String> manifest = new ArrayList<>();
        int written = 0;
        for (Path pdf : pdfs) {
            String stem = pdf.getFileName().toString().replaceFirst("\\.pdf$", "");
            byte[] input;
            try {
                input = Files.readAllBytes(pdf);
            } catch (Exception e) {
                continue;
            }
            try {
                PdfUaConversionOutcome outcome =
                        service.convert(
                                input,
                                TaggingOptions.builder()
                                        .profile(PdfUaProfile.UA1)
                                        .language("en-GB")
                                        .fallbackTitle(stem)
                                        .existingTags(TaggingOptions.ExistingTags.REBUILD)
                                        .build());
                Files.write(out.resolve(stem + "__before.pdf"), input);
                Files.write(out.resolve(stem + "__after.pdf"), outcome.pdfBytes());
                manifest.add(
                        stem
                                + "\tdeclared="
                                + outcome.declared()
                                + "\tfailures="
                                + outcome.validation().totalFailures());
                written++;
            } catch (Exception e) {
                manifest.add(stem + "\tREFUSED\t" + e.getMessage());
            }
        }
        Files.write(out.resolve("manifest.tsv"), manifest);
        System.out.println("Wrote " + written + " before/after pairs to " + out);
        assertTrue(written > 10, "expected a usable sample set, wrote " + written);
    }
}
