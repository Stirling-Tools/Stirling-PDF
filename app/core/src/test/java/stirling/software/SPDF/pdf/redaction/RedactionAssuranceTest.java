package stirling.software.SPDF.pdf.redaction;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Set;
import java.util.stream.Stream;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.apache.pdfbox.pdmodel.interactive.documentnavigation.outline.PDDocumentOutline;
import org.apache.pdfbox.pdmodel.interactive.documentnavigation.outline.PDOutlineItem;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.service.PdfMetadataService;

@DisplayName("RedactionAssurance Tests")
class RedactionAssuranceTest {

    private CustomPDFDocumentFactory factory;
    private Path workDir;

    @BeforeEach
    void setUp() throws IOException {
        factory = new CustomPDFDocumentFactory(mock(PdfMetadataService.class));
        workDir = Files.createTempDirectory("redaction-assurance-test");
    }

    @AfterEach
    void tearDown() throws IOException {
        try (Stream<Path> entries = Files.list(workDir)) {
            for (Path entry : entries.toList()) {
                Files.deleteIfExists(entry);
            }
        }
        Files.deleteIfExists(workDir);
    }

    private Path writePdf(String pageText, String bookmarkTitle) throws IOException {
        Path pdf = Files.createTempFile(workDir, "subject", ".pdf");
        try (PDDocument document = new PDDocument()) {
            PDPage page = new PDPage(PDRectangle.A4);
            document.addPage(page);
            if (pageText != null) {
                try (PDPageContentStream cs = new PDPageContentStream(document, page)) {
                    cs.beginText();
                    cs.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA), 12);
                    cs.newLineAtOffset(72, 700);
                    cs.showText(pageText);
                    cs.endText();
                }
            }
            if (bookmarkTitle != null) {
                PDDocumentOutline outline = new PDDocumentOutline();
                document.getDocumentCatalog().setDocumentOutline(outline);
                PDOutlineItem item = new PDOutlineItem();
                item.setTitle(bookmarkTitle);
                item.setDestination(page);
                outline.addLast(item);
            }
            document.save(pdf.toFile());
        }
        return pdf;
    }

    @Test
    @DisplayName("scrubs a surviving carrier and rewrites the file in place")
    void scrubsCarrierInPlace() throws IOException {
        Path pdf = writePdf("nothing to see", "Bookmark for CARRIERSECRET");

        assertDoesNotThrow(
                () ->
                        RedactionAssurance.scrubAndVerify(
                                pdf,
                                RedactionAssurance.targetsFor(
                                        List.of("CARRIERSECRET"), false, false)));

        assertFalse(
                new String(Files.readAllBytes(pdf), StandardCharsets.ISO_8859_1)
                        .contains("CARRIERSECRET"));
        try (PDDocument reopened = factory.load(pdf)) {
            assertEquals(1, reopened.getNumberOfPages());
        }
    }

    @Test
    @DisplayName("fails closed and leaves the input untouched when a target survives on the page")
    void failsClosedAndLeavesInputUntouched() throws IOException {
        Path pdf = writePdf("PAGESECRET stays here", null);
        byte[] before = Files.readAllBytes(pdf);

        assertThrows(
                RedactionVerificationFailedException.class,
                () ->
                        RedactionAssurance.scrubAndVerify(
                                pdf,
                                RedactionAssurance.targetsFor(
                                        List.of("PAGESECRET"), false, false)));

        assertArrayEquals(before, Files.readAllBytes(pdf));
    }

    @Test
    @DisplayName("leaves no temp file behind on either outcome")
    void leavesNoTempFileBehind() throws IOException {
        Path passing = writePdf("clean", "Bookmark for CARRIERSECRET");
        RedactionAssurance.scrubAndVerify(
                passing, RedactionAssurance.targetsFor(List.of("CARRIERSECRET"), false, false));

        Path failing = writePdf("PAGESECRET stays here", null);
        assertThrows(
                RedactionVerificationFailedException.class,
                () ->
                        RedactionAssurance.scrubAndVerify(
                                failing,
                                RedactionAssurance.targetsFor(
                                        List.of("PAGESECRET"), false, false)));

        try (Stream<Path> entries = Files.list(workDir)) {
            assertEquals(
                    List.of(),
                    entries.filter(p -> !p.equals(passing) && !p.equals(failing)).toList());
        }
    }

    @Test
    @DisplayName("merge keeps literals and patterns in the kind they were built with")
    void mergeKeepsBothKinds() {
        RedactionAssurance.Targets merged =
                RedactionAssurance.merge(
                        RedactionAssurance.targetsFor(List.of("literal"), false, false),
                        RedactionAssurance.targetsFor(List.of("pat[0-9]+"), true, false));

        assertEquals(Set.of("literal"), merged.literals());
        assertEquals(1, merged.patterns().size());
        assertTrue(merged.patterns().get(0).matcher("pat42").find());
    }

    @Test
    @DisplayName("one merged pass catches a literal and a regex survivor alike")
    void mergedTargetsVerifyBothKinds() throws IOException {
        Path literalSurvivor = writePdf("PAGESECRET stays here", null);
        RedactionAssurance.Targets both =
                RedactionAssurance.merge(
                        RedactionAssurance.targetsFor(List.of("PAGESECRET"), false, false),
                        RedactionAssurance.targetsFor(List.of("ZZ[0-9]{3}"), true, false));
        assertThrows(
                RedactionVerificationFailedException.class,
                () -> RedactionAssurance.scrubAndVerify(literalSurvivor, both));

        Path patternSurvivor = writePdf("code ZZ123 stays here", null);
        assertThrows(
                RedactionVerificationFailedException.class,
                () -> RedactionAssurance.scrubAndVerify(patternSurvivor, both));
    }

    @Test
    @DisplayName("an invalid regex is rejected by ordinal, never by echoing the term")
    void invalidRegexReportedByOrdinal() {
        IllegalArgumentException e =
                assertThrows(
                        IllegalArgumentException.class,
                        () ->
                                RedactionAssurance.targetsFor(
                                        List.of("fine", "secret[unclosed"), true, false));

        assertTrue(e.getMessage().contains("#2"), e.getMessage());
        assertFalse(e.getMessage().contains("secret"), e.getMessage());
    }
}
