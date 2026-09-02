package stirling.software.SPDF.controller.api;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.OutputStream;
import java.nio.file.Files;
import java.util.ArrayList;
import java.util.List;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.jboss.resteasy.reactive.multipart.FileUpload;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import jakarta.ws.rs.core.Response;

import stirling.software.SPDF.model.json.PdfJsonDocument;
import stirling.software.SPDF.model.json.PdfJsonPage;
import stirling.software.SPDF.model.json.PdfJsonTextElement;
import stirling.software.SPDF.service.PdfJsonConversionService;
import stirling.software.common.model.MultipartFile;
import stirling.software.common.model.api.general.EditTextOperation;
import stirling.software.common.testsupport.TestFileUploads;
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;

import tools.jackson.databind.ObjectMapper;

@ExtendWith(MockitoExtension.class)
class EditTextControllerTest {

    @Mock private PdfJsonConversionService pdfJsonConversionService;
    @Mock private TempFileManager tempFileManager;

    // Real Jackson mapper so the controller can parse the "edits" JSON form field for real,
    // matching
    // production binding (the @RestForm String editsJson is deserialized into
    // List<EditTextOperation>).
    private final ObjectMapper objectMapper = new ObjectMapper();

    private EditTextController controller;

    @BeforeEach
    void setUp() throws Exception {
        lenient()
                .when(tempFileManager.createManagedTempFile(anyString()))
                .thenAnswer(
                        inv -> {
                            File f =
                                    Files.createTempFile("test", inv.<String>getArgument(0))
                                            .toFile();
                            TempFile tf = mock(TempFile.class);
                            lenient().when(tf.getFile()).thenReturn(f);
                            lenient().when(tf.getPath()).thenReturn(f.toPath());
                            return tf;
                        });
        controller =
                new EditTextController(pdfJsonConversionService, tempFileManager, objectMapper);
    }

    private static FileUpload pdfFile() {
        return TestFileUploads.of("stub-pdf-bytes".getBytes(), "doc.pdf", "application/pdf");
    }

    private static EditTextOperation edit(String find, String replace) {
        EditTextOperation op = new EditTextOperation();
        op.setFind(find);
        op.setReplace(replace);
        return op;
    }

    /** Serialize the edits to the JSON array string the controller expects on the "edits" field. */
    private String editsJson(List<EditTextOperation> edits) throws Exception {
        return objectMapper.writeValueAsString(edits);
    }

    private static PdfJsonTextElement textElement(String text) {
        PdfJsonTextElement el = new PdfJsonTextElement();
        el.setText(text);
        el.setCharCodes(new int[] {1, 2, 3});
        return el;
    }

    private static PdfJsonDocument documentWithElements(List<PdfJsonTextElement> elements) {
        PdfJsonDocument doc = new PdfJsonDocument();
        PdfJsonPage page = new PdfJsonPage();
        page.setPageNumber(1);
        page.setTextElements(new ArrayList<>(elements));
        doc.setPages(new ArrayList<>(List.of(page)));
        return doc;
    }

    private static PdfJsonDocument documentWithText(String... textsByPage) {
        PdfJsonDocument doc = new PdfJsonDocument();
        List<PdfJsonPage> pages = new ArrayList<>();
        for (int i = 0; i < textsByPage.length; i++) {
            PdfJsonPage page = new PdfJsonPage();
            page.setPageNumber(i + 1);
            PdfJsonTextElement el = new PdfJsonTextElement();
            el.setText(textsByPage[i]);
            el.setCharCodes(new int[] {1, 2, 3});
            page.setTextElements(new ArrayList<>(List.of(el)));
            pages.add(page);
        }
        doc.setPages(pages);
        return doc;
    }

    /** Build a minimal real PDF so tests can run end-to-end without mocking the conversion. */
    private static byte[] buildEmptyPdf() throws Exception {
        try (PDDocument doc = new PDDocument();
                ByteArrayOutputStream baos = new ByteArrayOutputStream()) {
            doc.addPage(new PDPage());
            doc.save(baos);
            return baos.toByteArray();
        }
    }

    @Test
    void editText_nullFileInputThrows() {
        // No file upload bound -> FileUploadMultipartFile.of(null) yields a null input file.
        assertThrows(
                IllegalArgumentException.class,
                () ->
                        controller.editText(
                                null, null, null, editsJson(List.of(edit("foo", "bar"))), null));
    }

    @Test
    void editText_emptyEditsThrows() {
        assertThrows(
                IllegalArgumentException.class,
                () -> controller.editText(pdfFile(), null, null, editsJson(List.of()), null));
    }

    @Test
    void editText_nullEditsThrows() {
        assertThrows(
                IllegalArgumentException.class,
                () -> controller.editText(pdfFile(), null, null, null, null));
    }

    @Test
    void editText_emptyFindStringThrows() {
        assertThrows(
                IllegalArgumentException.class,
                () ->
                        controller.editText(
                                pdfFile(),
                                null,
                                null,
                                editsJson(List.of(edit("", "replacement"))),
                                null));
    }

    @Test
    void editText_findStringWithRegexMetacharsIsTreatedLiterally() throws Exception {
        // Find strings are always treated as literals (Pattern.quote'd internally) — no ReDoS
        // exposure from regex metacharacters supplied by the caller.
        PdfJsonDocument input = documentWithText("text with (unclosed paren");
        when(pdfJsonConversionService.convertPdfToJsonDocument(any(MultipartFile.class)))
                .thenReturn(input);

        controller.editText(
                pdfFile(), null, null, editsJson(List.of(edit("(unclosed", "fixed"))), null);

        ArgumentCaptor<PdfJsonDocument> captor = ArgumentCaptor.forClass(PdfJsonDocument.class);
        org.mockito.Mockito.verify(pdfJsonConversionService)
                .convertJsonToPdf(captor.capture(), any(OutputStream.class));
        assertEquals(
                "text with fixed paren",
                captor.getValue().getPages().get(0).getTextElements().get(0).getText());
    }

    @Test
    void editText_literalFindReplace_mutatesMatchingSpansAndClearsCharCodes() throws Exception {
        PdfJsonDocument input = documentWithText("foo and foo", "no match here");
        when(pdfJsonConversionService.convertPdfToJsonDocument(any(MultipartFile.class)))
                .thenReturn(input);

        Response response =
                controller.editText(
                        pdfFile(), null, null, editsJson(List.of(edit("foo", "bar"))), null);

        assertEquals(200, response.getStatus());
        assertNotNull(response.getEntity());

        ArgumentCaptor<PdfJsonDocument> captor = ArgumentCaptor.forClass(PdfJsonDocument.class);
        org.mockito.Mockito.verify(pdfJsonConversionService)
                .convertJsonToPdf(captor.capture(), any(OutputStream.class));
        PdfJsonDocument mutated = captor.getValue();

        assertEquals("bar and bar", mutated.getPages().get(0).getTextElements().get(0).getText());
        assertNull(mutated.getPages().get(0).getTextElements().get(0).getCharCodes());

        assertEquals("no match here", mutated.getPages().get(1).getTextElements().get(0).getText());
        // Char codes preserved on unmodified spans.
        assertNotNull(mutated.getPages().get(1).getTextElements().get(0).getCharCodes());
    }

    @Test
    void editText_wholeWordSearch_doesNotMatchInsideWords() throws Exception {
        PdfJsonDocument input = documentWithText("the cat is in the catalogue");
        when(pdfJsonConversionService.convertPdfToJsonDocument(any(MultipartFile.class)))
                .thenReturn(input);

        controller.editText(pdfFile(), null, null, editsJson(List.of(edit("cat", "dog"))), true);

        ArgumentCaptor<PdfJsonDocument> captor = ArgumentCaptor.forClass(PdfJsonDocument.class);
        org.mockito.Mockito.verify(pdfJsonConversionService)
                .convertJsonToPdf(captor.capture(), any(OutputStream.class));
        assertEquals(
                "the dog is in the catalogue",
                captor.getValue().getPages().get(0).getTextElements().get(0).getText());
    }

    @Test
    void editText_wholeWordSearch_matchesFindStartingWithNonWordChar() throws Exception {
        PdfJsonDocument input = documentWithText("space then -foo here");
        when(pdfJsonConversionService.convertPdfToJsonDocument(any(MultipartFile.class)))
                .thenReturn(input);

        controller.editText(pdfFile(), null, null, editsJson(List.of(edit("-foo", "-bar"))), true);

        ArgumentCaptor<PdfJsonDocument> captor = ArgumentCaptor.forClass(PdfJsonDocument.class);
        org.mockito.Mockito.verify(pdfJsonConversionService)
                .convertJsonToPdf(captor.capture(), any(OutputStream.class));
        assertEquals(
                "space then -bar here",
                captor.getValue().getPages().get(0).getTextElements().get(0).getText());
    }

    @Test
    void editText_wholeWordSearch_doesNotMatchWhenAdjacentToWordChar() throws Exception {
        PdfJsonDocument input = documentWithText("inline-foo should not match");
        when(pdfJsonConversionService.convertPdfToJsonDocument(any(MultipartFile.class)))
                .thenReturn(input);

        controller.editText(pdfFile(), null, null, editsJson(List.of(edit("-foo", "-bar"))), true);

        ArgumentCaptor<PdfJsonDocument> captor = ArgumentCaptor.forClass(PdfJsonDocument.class);
        org.mockito.Mockito.verify(pdfJsonConversionService)
                .convertJsonToPdf(captor.capture(), any(OutputStream.class));
        assertEquals(
                "inline-foo should not match",
                captor.getValue().getPages().get(0).getTextElements().get(0).getText());
    }

    @Test
    void editText_pageFilter_onlyAffectsListedPages() throws Exception {
        PdfJsonDocument input = documentWithText("foo on page 1", "foo on page 2", "foo on page 3");
        when(pdfJsonConversionService.convertPdfToJsonDocument(any(MultipartFile.class)))
                .thenReturn(input);

        controller.editText(pdfFile(), null, "2", editsJson(List.of(edit("foo", "bar"))), null);

        ArgumentCaptor<PdfJsonDocument> captor = ArgumentCaptor.forClass(PdfJsonDocument.class);
        org.mockito.Mockito.verify(pdfJsonConversionService)
                .convertJsonToPdf(captor.capture(), any(OutputStream.class));
        PdfJsonDocument mutated = captor.getValue();

        assertEquals("foo on page 1", mutated.getPages().get(0).getTextElements().get(0).getText());
        assertEquals("bar on page 2", mutated.getPages().get(1).getTextElements().get(0).getText());
        assertEquals("foo on page 3", mutated.getPages().get(2).getTextElements().get(0).getText());
    }

    @Test
    void editText_pageRange_appliesToAllPagesInRange() throws Exception {
        PdfJsonDocument input =
                documentWithText("foo page 1", "foo page 2", "foo page 3", "foo page 4");
        when(pdfJsonConversionService.convertPdfToJsonDocument(any(MultipartFile.class)))
                .thenReturn(input);

        controller.editText(pdfFile(), null, "2-3", editsJson(List.of(edit("foo", "bar"))), null);

        ArgumentCaptor<PdfJsonDocument> captor = ArgumentCaptor.forClass(PdfJsonDocument.class);
        org.mockito.Mockito.verify(pdfJsonConversionService)
                .convertJsonToPdf(captor.capture(), any(OutputStream.class));
        PdfJsonDocument mutated = captor.getValue();

        assertTrue(mutated.getPages().get(0).getTextElements().get(0).getText().startsWith("foo"));
        assertTrue(mutated.getPages().get(1).getTextElements().get(0).getText().startsWith("bar"));
        assertTrue(mutated.getPages().get(2).getTextElements().get(0).getText().startsWith("bar"));
        assertTrue(mutated.getPages().get(3).getTextElements().get(0).getText().startsWith("foo"));
    }

    @Test
    void editText_orderedEdits_applyInSequence() throws Exception {
        PdfJsonDocument input = documentWithText("foo");
        when(pdfJsonConversionService.convertPdfToJsonDocument(any(MultipartFile.class)))
                .thenReturn(input);

        controller.editText(
                pdfFile(),
                null,
                null,
                editsJson(List.of(edit("foo", "bar"), edit("bar", "baz"))),
                null);

        ArgumentCaptor<PdfJsonDocument> captor = ArgumentCaptor.forClass(PdfJsonDocument.class);
        org.mockito.Mockito.verify(pdfJsonConversionService)
                .convertJsonToPdf(captor.capture(), any(OutputStream.class));
        assertEquals("baz", captor.getValue().getPages().get(0).getTextElements().get(0).getText());
    }

    @Test
    void editText_replaceWithEmptyString_deletesMatch() throws Exception {
        PdfJsonDocument input = documentWithText("DRAFT Confidential Memo");
        when(pdfJsonConversionService.convertPdfToJsonDocument(any(MultipartFile.class)))
                .thenReturn(input);

        controller.editText(pdfFile(), null, null, editsJson(List.of(edit("DRAFT ", ""))), null);

        ArgumentCaptor<PdfJsonDocument> captor = ArgumentCaptor.forClass(PdfJsonDocument.class);
        org.mockito.Mockito.verify(pdfJsonConversionService)
                .convertJsonToPdf(captor.capture(), any(OutputStream.class));
        assertEquals(
                "Confidential Memo",
                captor.getValue().getPages().get(0).getTextElements().get(0).getText());
    }

    @Test
    void editText_noMatches_returnsPdfWithoutMutation() throws Exception {
        PdfJsonDocument input = documentWithText("nothing to match");
        int[] originalCodes = input.getPages().get(0).getTextElements().get(0).getCharCodes();
        when(pdfJsonConversionService.convertPdfToJsonDocument(any(MultipartFile.class)))
                .thenReturn(input);

        Response response =
                controller.editText(
                        pdfFile(),
                        null,
                        null,
                        editsJson(List.of(edit("notfound", "replacement"))),
                        null);

        assertEquals(200, response.getStatus());
        // Char codes left intact when nothing was replaced.
        assertEquals(
                originalCodes, input.getPages().get(0).getTextElements().get(0).getCharCodes());
        assertEquals(
                "nothing to match", input.getPages().get(0).getTextElements().get(0).getText());
    }

    @Test
    void editText_dollarInLiteralReplacement_isQuoted() throws Exception {
        // Without quoting, '$1' would be interpreted as a backreference and crash.
        PdfJsonDocument input = documentWithText("the price is set");
        when(pdfJsonConversionService.convertPdfToJsonDocument(any(MultipartFile.class)))
                .thenReturn(input);

        controller.editText(pdfFile(), null, null, editsJson(List.of(edit("price", "$100"))), null);

        ArgumentCaptor<PdfJsonDocument> captor = ArgumentCaptor.forClass(PdfJsonDocument.class);
        org.mockito.Mockito.verify(pdfJsonConversionService)
                .convertJsonToPdf(captor.capture(), any(OutputStream.class));
        assertEquals(
                "the $100 is set",
                captor.getValue().getPages().get(0).getTextElements().get(0).getText());
    }

    @Test
    void editText_emptyDocument_returnsResponseWithoutErrors() throws Exception {
        PdfJsonDocument input = new PdfJsonDocument();
        input.setPages(new ArrayList<>());
        when(pdfJsonConversionService.convertPdfToJsonDocument(any(MultipartFile.class)))
                .thenReturn(input);

        Response response =
                controller.editText(
                        pdfFile(), null, null, editsJson(List.of(edit("foo", "bar"))), null);

        assertEquals(200, response.getStatus());
        assertNotNull(response.getEntity());
    }

    @Test
    void editText_textElementWithNullText_isSkipped() throws Exception {
        PdfJsonDocument input = new PdfJsonDocument();
        PdfJsonPage page = new PdfJsonPage();
        page.setPageNumber(1);
        PdfJsonTextElement nullText = new PdfJsonTextElement();
        nullText.setText(null);
        PdfJsonTextElement realText = new PdfJsonTextElement();
        realText.setText("foo here");
        page.setTextElements(new ArrayList<>(List.of(nullText, realText)));
        input.setPages(new ArrayList<>(List.of(page)));
        when(pdfJsonConversionService.convertPdfToJsonDocument(any(MultipartFile.class)))
                .thenReturn(input);

        controller.editText(pdfFile(), null, null, editsJson(List.of(edit("foo", "bar"))), null);

        ArgumentCaptor<PdfJsonDocument> captor = ArgumentCaptor.forClass(PdfJsonDocument.class);
        org.mockito.Mockito.verify(pdfJsonConversionService)
                .convertJsonToPdf(captor.capture(), any(OutputStream.class));
        PdfJsonDocument mutated = captor.getValue();
        assertNull(mutated.getPages().get(0).getTextElements().get(0).getText());
        assertEquals("bar here", mutated.getPages().get(0).getTextElements().get(1).getText());
    }

    @Test
    void editText_crossElement_matchSpansTwoElements() throws Exception {
        PdfJsonDocument input =
                documentWithElements(List.of(textElement("Hello "), textElement("World")));
        when(pdfJsonConversionService.convertPdfToJsonDocument(any(MultipartFile.class)))
                .thenReturn(input);

        controller.editText(
                pdfFile(),
                null,
                null,
                editsJson(List.of(edit("Hello World", "Goodbye Earth"))),
                null);

        ArgumentCaptor<PdfJsonDocument> captor = ArgumentCaptor.forClass(PdfJsonDocument.class);
        org.mockito.Mockito.verify(pdfJsonConversionService)
                .convertJsonToPdf(captor.capture(), any(OutputStream.class));
        List<PdfJsonTextElement> elements = captor.getValue().getPages().get(0).getTextElements();

        // Whole replacement lands in the first matched element; the second is emptied.
        assertEquals("Goodbye Earth", elements.get(0).getText());
        assertEquals("", elements.get(1).getText());
        assertNull(elements.get(0).getCharCodes());
        assertNull(elements.get(1).getCharCodes());
    }

    @Test
    void editText_crossElement_matchSpansFiveElementsLikeFragmentedTitle() throws Exception {
        PdfJsonDocument input =
                documentWithElements(
                        List.of(
                                textElement("The "),
                                textElement("Free "),
                                textElement("Adobe "),
                                textElement("Acrobat "),
                                textElement("Alternative")));
        when(pdfJsonConversionService.convertPdfToJsonDocument(any(MultipartFile.class)))
                .thenReturn(input);

        controller.editText(
                pdfFile(),
                null,
                null,
                editsJson(
                        List.of(
                                edit(
                                        "The Free Adobe Acrobat Alternative",
                                        "The PDF automation pipeline"))),
                null);

        ArgumentCaptor<PdfJsonDocument> captor = ArgumentCaptor.forClass(PdfJsonDocument.class);
        org.mockito.Mockito.verify(pdfJsonConversionService)
                .convertJsonToPdf(captor.capture(), any(OutputStream.class));
        List<PdfJsonTextElement> elements = captor.getValue().getPages().get(0).getTextElements();

        assertEquals("The PDF automation pipeline", elements.get(0).getText());
        for (int i = 1; i < elements.size(); i++) {
            assertEquals("", elements.get(i).getText(), "element " + i + " should be empty");
        }
    }

    @Test
    void editText_crossElement_preservesPrefixAndSuffix() throws Exception {
        PdfJsonDocument input =
                documentWithElements(
                        List.of(textElement("Greeting: Hello "), textElement("World! And more")));
        when(pdfJsonConversionService.convertPdfToJsonDocument(any(MultipartFile.class)))
                .thenReturn(input);

        controller.editText(
                pdfFile(),
                null,
                null,
                editsJson(List.of(edit("Hello World", "Goodbye Earth"))),
                null);

        ArgumentCaptor<PdfJsonDocument> captor = ArgumentCaptor.forClass(PdfJsonDocument.class);
        org.mockito.Mockito.verify(pdfJsonConversionService)
                .convertJsonToPdf(captor.capture(), any(OutputStream.class));
        List<PdfJsonTextElement> elements = captor.getValue().getPages().get(0).getTextElements();

        assertEquals("Greeting: Goodbye Earth", elements.get(0).getText());
        assertEquals("! And more", elements.get(1).getText());
    }

    @Test
    void editText_matchInOneElementOfMany_onlyTouchesThatElement() throws Exception {
        PdfJsonDocument input =
                documentWithElements(
                        List.of(
                                textElement("Hello "),
                                textElement("World!"),
                                textElement(" Goodbye")));
        when(pdfJsonConversionService.convertPdfToJsonDocument(any(MultipartFile.class)))
                .thenReturn(input);

        controller.editText(
                pdfFile(), null, null, editsJson(List.of(edit("World", "Earth"))), null);

        ArgumentCaptor<PdfJsonDocument> captor = ArgumentCaptor.forClass(PdfJsonDocument.class);
        org.mockito.Mockito.verify(pdfJsonConversionService)
                .convertJsonToPdf(captor.capture(), any(OutputStream.class));
        List<PdfJsonTextElement> elements = captor.getValue().getPages().get(0).getTextElements();

        assertEquals("Hello ", elements.get(0).getText());
        assertEquals("Earth!", elements.get(1).getText());
        assertEquals(" Goodbye", elements.get(2).getText());
        // Only the modified element's char codes get cleared.
        assertNotNull(elements.get(0).getCharCodes());
        assertNull(elements.get(1).getCharCodes());
        assertNotNull(elements.get(2).getCharCodes());
    }

    @Test
    void editText_crossElement_multipleMatchesAppliedRightToLeft() throws Exception {
        PdfJsonDocument input =
                documentWithElements(
                        List.of(
                                textElement("foo "),
                                textElement("bar baz "),
                                textElement("foo "),
                                textElement("bar")));
        when(pdfJsonConversionService.convertPdfToJsonDocument(any(MultipartFile.class)))
                .thenReturn(input);

        controller.editText(pdfFile(), null, null, editsJson(List.of(edit("foo bar", "X"))), null);

        ArgumentCaptor<PdfJsonDocument> captor = ArgumentCaptor.forClass(PdfJsonDocument.class);
        org.mockito.Mockito.verify(pdfJsonConversionService)
                .convertJsonToPdf(captor.capture(), any(OutputStream.class));
        List<PdfJsonTextElement> elements = captor.getValue().getPages().get(0).getTextElements();

        // Joined was "foo bar baz foo bar"; both "foo bar" runs replaced with "X".
        StringBuilder joined = new StringBuilder();
        for (PdfJsonTextElement el : elements) {
            joined.append(el.getText() == null ? "" : el.getText());
        }
        assertEquals("X baz X", joined.toString());
    }

    @Test
    void editText_subWordFragmentation_writesIntoFirstElement() throws Exception {
        // 11 sub-word elements covering "Hello World".
        PdfJsonDocument input =
                documentWithElements(
                        List.of(
                                textElement("H"),
                                textElement("e"),
                                textElement("l"),
                                textElement("l"),
                                textElement("o"),
                                textElement(" "),
                                textElement("W"),
                                textElement("o"),
                                textElement("r"),
                                textElement("l"),
                                textElement("d")));
        when(pdfJsonConversionService.convertPdfToJsonDocument(any(MultipartFile.class)))
                .thenReturn(input);

        controller.editText(
                pdfFile(),
                null,
                null,
                editsJson(List.of(edit("Hello World", "Goodbye Earth"))),
                null);

        ArgumentCaptor<PdfJsonDocument> captor = ArgumentCaptor.forClass(PdfJsonDocument.class);
        org.mockito.Mockito.verify(pdfJsonConversionService)
                .convertJsonToPdf(captor.capture(), any(OutputStream.class));
        List<PdfJsonTextElement> elements = captor.getValue().getPages().get(0).getTextElements();

        // Entire replacement goes into the first matched element; the other 10 are emptied.
        assertEquals("Goodbye Earth", elements.get(0).getText());
        for (int i = 1; i < elements.size(); i++) {
            assertEquals("", elements.get(i).getText(), "element " + i + " should be empty");
        }
    }

    @Test
    void editText_outputFilenameDerivedFromInput() throws Exception {
        FileUpload reportFile =
                TestFileUploads.of(buildEmptyPdf(), "report.pdf", "application/pdf");

        PdfJsonDocument input = documentWithText("nothing matches");
        when(pdfJsonConversionService.convertPdfToJsonDocument(any(MultipartFile.class)))
                .thenReturn(input);

        Response response =
                controller.editText(
                        reportFile, null, null, editsJson(List.of(edit("anything", "x"))), null);
        String contentDisposition = response.getHeaderString("Content-Disposition");
        assertNotNull(contentDisposition);
        assertTrue(contentDisposition.contains("report_edited.pdf"));
        assertFalse(contentDisposition.contains(".pdf_edited.pdf"));
    }
}
