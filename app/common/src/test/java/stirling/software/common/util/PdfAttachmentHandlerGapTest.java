package stirling.software.common.util;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.ArrayList;
import java.util.Base64;
import java.util.Date;
import java.util.List;
import java.util.Map;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDDocumentNameDictionary;
import org.apache.pdfbox.pdmodel.PDEmbeddedFilesNameTreeNode;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.common.filespecification.PDComplexFileSpecification;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

import stirling.software.common.service.CustomPDFDocumentFactory;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class PdfAttachmentHandlerGapTest {

    @Mock private CustomPDFDocumentFactory pdfDocumentFactory;

    // ----- helpers -------------------------------------------------------

    /** Builds a tiny one-page PDF whose page renders the given text lines, each on its own line. */
    private static byte[] pdfWithLines(String... lines) throws Exception {
        try (PDDocument doc = new PDDocument()) {
            PDPage page = new PDPage(PDRectangle.A4);
            doc.addPage(page);
            try (PDPageContentStream cs = new PDPageContentStream(doc, page)) {
                cs.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA), 12);
                float y = 720f;
                for (String line : lines) {
                    cs.beginText();
                    cs.newLineAtOffset(72f, y);
                    cs.showText(line);
                    cs.endText();
                    y -= 20f;
                }
            }
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            doc.save(baos);
            return baos.toByteArray();
        }
    }

    /** Builds a blank one-page PDF with no text. */
    private static byte[] blankPdf() throws Exception {
        try (PDDocument doc = new PDDocument()) {
            doc.addPage(new PDPage(PDRectangle.A4));
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            doc.save(baos);
            return baos.toByteArray();
        }
    }

    private static EmlParser.EmailAttachment attachment(String filename, byte[] data) {
        EmlParser.EmailAttachment a = new EmlParser.EmailAttachment();
        a.setFilename(filename);
        a.setData(data);
        a.setContentType("application/pdf");
        return a;
    }

    private static List<String> embeddedFileNames(byte[] pdfBytes) throws Exception {
        List<String> names = new ArrayList<>();
        try (PDDocument doc = Loader.loadPDF(pdfBytes)) {
            PDDocumentNameDictionary docNames = doc.getDocumentCatalog().getNames();
            if (docNames == null) {
                return names;
            }
            PDEmbeddedFilesNameTreeNode tree = docNames.getEmbeddedFiles();
            if (tree == null) {
                return names;
            }
            Map<String, PDComplexFileSpecification> map = tree.getNames();
            if (map != null) {
                names.addAll(map.keySet());
            }
        }
        return names;
    }

    // ----- attachFilesToPdf: short-circuit branches ----------------------

    @Nested
    @DisplayName("attachFilesToPdf short-circuit handling")
    class ShortCircuitTests {

        @Test
        @DisplayName("null attachment list returns the original bytes untouched")
        void nullAttachments_returnsOriginalBytes() throws Exception {
            byte[] original = {1, 2, 3, 4};
            byte[] result =
                    PdfAttachmentHandler.attachFilesToPdf(original, null, pdfDocumentFactory);
            assertSame(original, result);
            verifyNoInteractions(pdfDocumentFactory);
        }

        @Test
        @DisplayName("empty attachment list returns the original bytes untouched")
        void emptyAttachments_returnsOriginalBytes() throws Exception {
            byte[] original = {9, 8, 7};
            byte[] result =
                    PdfAttachmentHandler.attachFilesToPdf(
                            original, new ArrayList<>(), pdfDocumentFactory);
            assertSame(original, result);
            verifyNoInteractions(pdfDocumentFactory);
        }

        @Test
        @DisplayName("attachments with no usable data are skipped and a clean PDF is returned")
        void attachmentsWithoutData_produceNoEmbeddedFiles() throws Exception {
            byte[] pdfBytes = blankPdf();
            when(pdfDocumentFactory.load(pdfBytes)).thenReturn(Loader.loadPDF(pdfBytes));

            List<EmlParser.EmailAttachment> attachments = new ArrayList<>();
            attachments.add(attachment("empty.pdf", new byte[0]));
            attachments.add(attachment("alsoEmpty.pdf", null));

            byte[] result =
                    PdfAttachmentHandler.attachFilesToPdf(
                            pdfBytes, attachments, pdfDocumentFactory);

            assertNotNull(result);
            assertTrue(result.length > 0);
            assertTrue(embeddedFileNames(result).isEmpty());
        }
    }

    // ----- attachFilesToPdf: embedding happy paths -----------------------

    @Nested
    @DisplayName("attachFilesToPdf embedding behaviour")
    class EmbeddingTests {

        @Test
        @DisplayName("embeds attachment data even when no '@' marker exists in the PDF text")
        void embedsAttachment_withoutMarker() throws Exception {
            byte[] pdfBytes = pdfWithLines("Just a plain document with no attachment markers");
            when(pdfDocumentFactory.load(pdfBytes)).thenReturn(Loader.loadPDF(pdfBytes));

            List<EmlParser.EmailAttachment> attachments = new ArrayList<>();
            attachments.add(attachment("report.pdf", "hello".getBytes(StandardCharsets.UTF_8)));

            byte[] result =
                    PdfAttachmentHandler.attachFilesToPdf(
                            pdfBytes, attachments, pdfDocumentFactory);

            List<String> embedded = embeddedFileNames(result);
            assertEquals(1, embedded.size());
            assertTrue(embedded.contains("report.pdf"));
        }

        @Test
        @DisplayName("embeds attachment and adds an annotation when an '@' marker matches")
        void embedsAttachment_withMatchingMarker() throws Exception {
            byte[] pdfBytes =
                    pdfWithLines("Email body text here", "Attachments (1)", "@report.pdf (5 KB)");
            when(pdfDocumentFactory.load(pdfBytes)).thenReturn(Loader.loadPDF(pdfBytes));

            List<EmlParser.EmailAttachment> attachments = new ArrayList<>();
            attachments.add(attachment("report.pdf", "PDFDATA".getBytes(StandardCharsets.UTF_8)));

            byte[] result =
                    PdfAttachmentHandler.attachFilesToPdf(
                            pdfBytes, attachments, pdfDocumentFactory);

            List<String> embedded = embeddedFileNames(result);
            assertTrue(embedded.contains("report.pdf"));

            // The annotation pass should have run and produced at least one annotation on the
            // page that contains the marker (a blank source page has none).
            try (PDDocument doc = Loader.loadPDF(result)) {
                assertFalse(doc.getPage(0).getAnnotations().isEmpty());
            }
        }

        @Test
        @DisplayName("attachment without a filename falls back to a generated embedded name")
        void embedsAttachment_withGeneratedName() throws Exception {
            byte[] pdfBytes = blankPdf();
            when(pdfDocumentFactory.load(pdfBytes)).thenReturn(Loader.loadPDF(pdfBytes));

            EmlParser.EmailAttachment a = new EmlParser.EmailAttachment();
            a.setFilename(null);
            a.setData("x".getBytes(StandardCharsets.UTF_8));
            List<EmlParser.EmailAttachment> attachments = new ArrayList<>();
            attachments.add(a);

            byte[] result =
                    PdfAttachmentHandler.attachFilesToPdf(
                            pdfBytes, attachments, pdfDocumentFactory);

            // A single embedded file should exist with a non-blank generated name.
            List<String> embedded = embeddedFileNames(result);
            assertEquals(1, embedded.size());
            assertFalse(embedded.get(0).isBlank());
        }

        @Test
        @DisplayName("duplicate attachment filenames produce uniquely named embedded files")
        void embedsAttachments_withDuplicateNames() throws Exception {
            byte[] pdfBytes = blankPdf();
            when(pdfDocumentFactory.load(pdfBytes)).thenReturn(Loader.loadPDF(pdfBytes));

            List<EmlParser.EmailAttachment> attachments = new ArrayList<>();
            attachments.add(attachment("dup.pdf", "a".getBytes(StandardCharsets.UTF_8)));
            attachments.add(attachment("dup.pdf", "b".getBytes(StandardCharsets.UTF_8)));

            byte[] result =
                    PdfAttachmentHandler.attachFilesToPdf(
                            pdfBytes, attachments, pdfDocumentFactory);

            List<String> embedded = embeddedFileNames(result);
            assertEquals(2, embedded.size());
            assertTrue(embedded.contains("dup.pdf"));
            // The second one must have been disambiguated, not overwritten.
            assertTrue(embedded.stream().anyMatch(n -> !"dup.pdf".equals(n)));
        }
    }

    // ----- attachFilesToPdf: error wrapping ------------------------------

    @Nested
    @DisplayName("attachFilesToPdf error handling")
    class ErrorHandlingTests {

        @Test
        @DisplayName("IOException from the factory load propagates to the caller")
        void factoryIOException_propagates() throws Exception {
            byte[] pdfBytes = {0x25, 0x50, 0x44, 0x46}; // "%PDF"
            when(pdfDocumentFactory.load(pdfBytes))
                    .thenThrow(new java.io.IOException("boom from factory"));

            List<EmlParser.EmailAttachment> attachments = new ArrayList<>();
            attachments.add(attachment("a.pdf", "data".getBytes(StandardCharsets.UTF_8)));

            java.io.IOException ex =
                    assertThrows(
                            java.io.IOException.class,
                            () ->
                                    PdfAttachmentHandler.attachFilesToPdf(
                                            pdfBytes, attachments, pdfDocumentFactory));
            assertTrue(ex.getMessage().contains("boom from factory"));
        }
    }

    // ----- AttachmentMarkerPositionFinder --------------------------------

    @Nested
    @DisplayName("AttachmentMarkerPositionFinder")
    class MarkerFinderTests {

        @Test
        @DisplayName("finds marker positions inside an attachments section")
        void findsMarkerPositions() throws Exception {
            byte[] pdfBytes =
                    pdfWithLines(
                            "Some intro text",
                            "Attachments (2)",
                            "@invoice.pdf (10 KB)",
                            "@photo.png (4 KB)");

            try (PDDocument doc = Loader.loadPDF(pdfBytes)) {
                PdfAttachmentHandler.AttachmentMarkerPositionFinder finder =
                        new PdfAttachmentHandler.AttachmentMarkerPositionFinder();
                finder.setSortByPosition(false);
                String returned = finder.getText(doc);

                // getText is overridden to return an empty string (positions are the payload).
                assertEquals("", returned);

                List<PdfAttachmentHandler.MarkerPosition> positions = finder.getPositions();
                assertEquals(2, positions.size());

                List<String> filenames =
                        positions.stream()
                                .map(PdfAttachmentHandler.MarkerPosition::getFilename)
                                .toList();
                assertTrue(filenames.contains("invoice.pdf"));
                assertTrue(filenames.contains("photo.png"));

                for (PdfAttachmentHandler.MarkerPosition p : positions) {
                    assertEquals("@", p.getCharacter());
                    assertEquals(0, p.getPageIndex());
                }
            }
        }

        @Test
        @DisplayName("collects no positions when there is no attachments section")
        void noAttachmentSection_noPositions() throws Exception {
            byte[] pdfBytes =
                    pdfWithLines("Plain email body", "Contact us @ support address", "Goodbye");

            try (PDDocument doc = Loader.loadPDF(pdfBytes)) {
                PdfAttachmentHandler.AttachmentMarkerPositionFinder finder =
                        new PdfAttachmentHandler.AttachmentMarkerPositionFinder();
                finder.getText(doc);
                assertTrue(finder.getPositions().isEmpty());
            }
        }

        @Test
        @DisplayName("sortByPosition reorders collected positions deterministically")
        void sortByPosition_sortsPositions() throws Exception {
            byte[] pdfBytes =
                    pdfWithLines("Attachments (2)", "@first.pdf (1 KB)", "@second.pdf (2 KB)");

            try (PDDocument doc = Loader.loadPDF(pdfBytes)) {
                PdfAttachmentHandler.AttachmentMarkerPositionFinder finder =
                        new PdfAttachmentHandler.AttachmentMarkerPositionFinder();
                finder.setSortByPosition(true);
                finder.getText(doc);

                List<PdfAttachmentHandler.MarkerPosition> positions = finder.getPositions();
                assertEquals(2, positions.size());
                // With descending-Y sorting and same page, the higher-on-page marker comes first.
                assertTrue(positions.get(0).getY() >= positions.get(1).getY());
            }
        }
    }

    // ----- processInlineImages -------------------------------------------

    @Nested
    @DisplayName("processInlineImages")
    class ProcessInlineImagesTests {

        @Test
        @DisplayName("replaces a cid: reference with an inline base64 data URI")
        void replacesCidWithDataUri() {
            byte[] imageData = {(byte) 0x89, 'P', 'N', 'G'};
            EmlParser.EmailAttachment img = new EmlParser.EmailAttachment();
            img.setEmbedded(true);
            img.setContentId("img001");
            img.setFilename("pic.png");
            img.setContentType("image/png");
            img.setData(imageData);

            EmlParser.EmailContent content = new EmlParser.EmailContent();
            List<EmlParser.EmailAttachment> list = new ArrayList<>();
            list.add(img);
            content.setAttachments(list);

            String html = "<html><body><img src=\"cid:img001\"/></body></html>";
            String result = PdfAttachmentHandler.processInlineImages(html, content);

            String expectedB64 = Base64.getEncoder().encodeToString(imageData);
            assertTrue(result.contains("data:image/png;base64," + expectedB64));
            assertFalse(result.contains("cid:img001"));
        }

        @Test
        @DisplayName("leaves a cid: reference untouched when no attachment matches it")
        void unmatchedCid_isUnchanged() {
            EmlParser.EmailAttachment img = new EmlParser.EmailAttachment();
            img.setEmbedded(true);
            img.setContentId("known");
            img.setFilename("known.png");
            img.setContentType("image/png");
            img.setData(new byte[] {1, 2, 3});

            EmlParser.EmailContent content = new EmlParser.EmailContent();
            List<EmlParser.EmailAttachment> list = new ArrayList<>();
            list.add(img);
            content.setAttachments(list);

            String html = "<img src=\"cid:unknown\"/>";
            String result = PdfAttachmentHandler.processInlineImages(html, content);

            // The unknown cid reference is preserved verbatim.
            assertTrue(result.contains("cid:unknown"));
        }

        @Test
        @DisplayName("returns original html when there are no embedded images to map")
        void noEmbeddedImages_returnsOriginal() {
            EmlParser.EmailAttachment nonEmbedded = new EmlParser.EmailAttachment();
            nonEmbedded.setEmbedded(false);
            nonEmbedded.setContentId("x");
            nonEmbedded.setData(new byte[] {1});

            EmlParser.EmailContent content = new EmlParser.EmailContent();
            List<EmlParser.EmailAttachment> list = new ArrayList<>();
            list.add(nonEmbedded);
            content.setAttachments(list);

            String html = "<img src=\"cid:x\"/>";
            assertEquals(html, PdfAttachmentHandler.processInlineImages(html, content));
        }
    }

    // ----- formatEmailDate (deterministic UTC) ---------------------------

    @Nested
    @DisplayName("formatEmailDate determinism")
    class FormatEmailDateTests {

        @Test
        @DisplayName("a known instant formats to a stable UTC string regardless of input zone")
        void zonedDateTime_formatsToUtc() {
            // 2024-06-15 12:00 in Tokyo is 03:00 UTC the same day.
            ZonedDateTime tokyo =
                    ZonedDateTime.of(2024, 6, 15, 12, 0, 0, 0, ZoneId.of("Asia/Tokyo"));
            String result = PdfAttachmentHandler.formatEmailDate(tokyo);
            assertEquals("Sat, Jun 15, 2024 at 3:00 AM UTC", result);
        }

        @Test
        @DisplayName("Date overload converts a fixed epoch instant to the expected UTC string")
        void date_formatsToUtc() {
            // Epoch milli 0 == 1970-01-01T00:00:00Z.
            String result = PdfAttachmentHandler.formatEmailDate(new Date(0L));
            assertEquals("Thu, Jan 1, 1970 at 12:00 AM UTC", result);
        }

        @Test
        @DisplayName("null inputs yield an empty string for both overloads")
        void nullInputs_returnEmpty() {
            assertEquals("", PdfAttachmentHandler.formatEmailDate((Date) null));
            assertEquals("", PdfAttachmentHandler.formatEmailDate((ZonedDateTime) null));
        }
    }
}
