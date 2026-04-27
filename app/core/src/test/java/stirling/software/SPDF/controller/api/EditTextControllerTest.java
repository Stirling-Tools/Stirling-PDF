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
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.multipart.MultipartFile;

import stirling.software.SPDF.model.api.general.EditTextRequest;
import stirling.software.SPDF.model.json.PdfJsonDocument;
import stirling.software.SPDF.model.json.PdfJsonPage;
import stirling.software.SPDF.model.json.PdfJsonTextElement;
import stirling.software.SPDF.service.PdfJsonConversionService;
import stirling.software.common.model.api.general.EditTextOperation;
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;

@ExtendWith(MockitoExtension.class)
class EditTextControllerTest {

    @Mock private PdfJsonConversionService pdfJsonConversionService;
    @Mock private TempFileManager tempFileManager;

    @InjectMocks private EditTextController controller;

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
    }

    private static MultipartFile pdfFile() {
        return new MockMultipartFile(
                "fileInput", "doc.pdf", "application/pdf", "stub-pdf-bytes".getBytes());
    }

    private static EditTextOperation edit(String find, String replace) {
        EditTextOperation op = new EditTextOperation();
        op.setFind(find);
        op.setReplace(replace);
        return op;
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
        EditTextRequest request = new EditTextRequest();
        request.setFileInput(null);
        request.setEdits(List.of(edit("foo", "bar")));

        assertThrows(IllegalArgumentException.class, () -> controller.editText(request));
    }

    @Test
    void editText_emptyEditsThrows() {
        EditTextRequest request = new EditTextRequest();
        request.setFileInput(pdfFile());
        request.setEdits(List.of());

        assertThrows(IllegalArgumentException.class, () -> controller.editText(request));
    }

    @Test
    void editText_nullEditsThrows() {
        EditTextRequest request = new EditTextRequest();
        request.setFileInput(pdfFile());
        request.setEdits(null);

        assertThrows(IllegalArgumentException.class, () -> controller.editText(request));
    }

    @Test
    void editText_emptyFindStringThrows() {
        EditTextRequest request = new EditTextRequest();
        request.setFileInput(pdfFile());
        request.setEdits(List.of(edit("", "replacement")));

        assertThrows(IllegalArgumentException.class, () -> controller.editText(request));
    }

    @Test
    void editText_invalidRegexThrows() throws Exception {
        EditTextRequest request = new EditTextRequest();
        request.setFileInput(pdfFile());
        request.setEdits(List.of(edit("(unclosed", "x")));
        request.setUseRegex(true);

        assertThrows(IllegalArgumentException.class, () -> controller.editText(request));
    }

    @Test
    void editText_literalFindReplace_mutatesMatchingSpansAndClearsCharCodes() throws Exception {
        EditTextRequest request = new EditTextRequest();
        request.setFileInput(pdfFile());
        request.setEdits(List.of(edit("foo", "bar")));

        PdfJsonDocument input = documentWithText("foo and foo", "no match here");
        when(pdfJsonConversionService.convertPdfToJsonDocument(any(MultipartFile.class)))
                .thenReturn(input);

        ResponseEntity<Resource> response = controller.editText(request);

        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertNotNull(response.getBody());

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
    void editText_regexFindReplace_supportsBackreferences() throws Exception {
        EditTextRequest request = new EditTextRequest();
        request.setFileInput(pdfFile());
        request.setEdits(List.of(edit("(\\w+)@example\\.com", "$1@stirling.com")));
        request.setUseRegex(true);

        PdfJsonDocument input = documentWithText("contact alice@example.com today");
        when(pdfJsonConversionService.convertPdfToJsonDocument(any(MultipartFile.class)))
                .thenReturn(input);

        controller.editText(request);

        ArgumentCaptor<PdfJsonDocument> captor = ArgumentCaptor.forClass(PdfJsonDocument.class);
        org.mockito.Mockito.verify(pdfJsonConversionService)
                .convertJsonToPdf(captor.capture(), any(OutputStream.class));
        assertEquals(
                "contact alice@stirling.com today",
                captor.getValue().getPages().get(0).getTextElements().get(0).getText());
    }

    @Test
    void editText_wholeWordSearch_doesNotMatchInsideWords() throws Exception {
        EditTextRequest request = new EditTextRequest();
        request.setFileInput(pdfFile());
        request.setEdits(List.of(edit("cat", "dog")));
        request.setWholeWordSearch(true);

        PdfJsonDocument input = documentWithText("the cat is in the catalogue");
        when(pdfJsonConversionService.convertPdfToJsonDocument(any(MultipartFile.class)))
                .thenReturn(input);

        controller.editText(request);

        ArgumentCaptor<PdfJsonDocument> captor = ArgumentCaptor.forClass(PdfJsonDocument.class);
        org.mockito.Mockito.verify(pdfJsonConversionService)
                .convertJsonToPdf(captor.capture(), any(OutputStream.class));
        assertEquals(
                "the dog is in the catalogue",
                captor.getValue().getPages().get(0).getTextElements().get(0).getText());
    }

    @Test
    void editText_pageFilter_onlyAffectsListedPages() throws Exception {
        EditTextRequest request = new EditTextRequest();
        request.setFileInput(pdfFile());
        request.setEdits(List.of(edit("foo", "bar")));
        request.setPageNumbers("2");

        PdfJsonDocument input = documentWithText("foo on page 1", "foo on page 2", "foo on page 3");
        when(pdfJsonConversionService.convertPdfToJsonDocument(any(MultipartFile.class)))
                .thenReturn(input);

        controller.editText(request);

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
        EditTextRequest request = new EditTextRequest();
        request.setFileInput(pdfFile());
        request.setEdits(List.of(edit("foo", "bar")));
        request.setPageNumbers("2-3");

        PdfJsonDocument input =
                documentWithText("foo page 1", "foo page 2", "foo page 3", "foo page 4");
        when(pdfJsonConversionService.convertPdfToJsonDocument(any(MultipartFile.class)))
                .thenReturn(input);

        controller.editText(request);

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
        EditTextRequest request = new EditTextRequest();
        request.setFileInput(pdfFile());
        request.setEdits(List.of(edit("foo", "bar"), edit("bar", "baz")));

        PdfJsonDocument input = documentWithText("foo");
        when(pdfJsonConversionService.convertPdfToJsonDocument(any(MultipartFile.class)))
                .thenReturn(input);

        controller.editText(request);

        ArgumentCaptor<PdfJsonDocument> captor = ArgumentCaptor.forClass(PdfJsonDocument.class);
        org.mockito.Mockito.verify(pdfJsonConversionService)
                .convertJsonToPdf(captor.capture(), any(OutputStream.class));
        assertEquals("baz", captor.getValue().getPages().get(0).getTextElements().get(0).getText());
    }

    @Test
    void editText_replaceWithEmptyString_deletesMatch() throws Exception {
        EditTextRequest request = new EditTextRequest();
        request.setFileInput(pdfFile());
        request.setEdits(List.of(edit("DRAFT ", "")));

        PdfJsonDocument input = documentWithText("DRAFT Confidential Memo");
        when(pdfJsonConversionService.convertPdfToJsonDocument(any(MultipartFile.class)))
                .thenReturn(input);

        controller.editText(request);

        ArgumentCaptor<PdfJsonDocument> captor = ArgumentCaptor.forClass(PdfJsonDocument.class);
        org.mockito.Mockito.verify(pdfJsonConversionService)
                .convertJsonToPdf(captor.capture(), any(OutputStream.class));
        assertEquals(
                "Confidential Memo",
                captor.getValue().getPages().get(0).getTextElements().get(0).getText());
    }

    @Test
    void editText_noMatches_returnsPdfWithoutMutation() throws Exception {
        EditTextRequest request = new EditTextRequest();
        request.setFileInput(pdfFile());
        request.setEdits(List.of(edit("notfound", "replacement")));

        PdfJsonDocument input = documentWithText("nothing to match");
        int[] originalCodes = input.getPages().get(0).getTextElements().get(0).getCharCodes();
        when(pdfJsonConversionService.convertPdfToJsonDocument(any(MultipartFile.class)))
                .thenReturn(input);

        ResponseEntity<Resource> response = controller.editText(request);

        assertEquals(HttpStatus.OK, response.getStatusCode());
        // Char codes left intact when nothing was replaced.
        assertEquals(
                originalCodes, input.getPages().get(0).getTextElements().get(0).getCharCodes());
        assertEquals(
                "nothing to match", input.getPages().get(0).getTextElements().get(0).getText());
    }

    @Test
    void editText_dollarInLiteralReplacement_isQuoted() throws Exception {
        // Without quoting, '$1' would be interpreted as a backreference and crash.
        EditTextRequest request = new EditTextRequest();
        request.setFileInput(pdfFile());
        request.setEdits(List.of(edit("price", "$100")));

        PdfJsonDocument input = documentWithText("the price is set");
        when(pdfJsonConversionService.convertPdfToJsonDocument(any(MultipartFile.class)))
                .thenReturn(input);

        controller.editText(request);

        ArgumentCaptor<PdfJsonDocument> captor = ArgumentCaptor.forClass(PdfJsonDocument.class);
        org.mockito.Mockito.verify(pdfJsonConversionService)
                .convertJsonToPdf(captor.capture(), any(OutputStream.class));
        assertEquals(
                "the $100 is set",
                captor.getValue().getPages().get(0).getTextElements().get(0).getText());
    }

    @Test
    void editText_emptyDocument_returnsResponseWithoutErrors() throws Exception {
        EditTextRequest request = new EditTextRequest();
        request.setFileInput(pdfFile());
        request.setEdits(List.of(edit("foo", "bar")));

        PdfJsonDocument input = new PdfJsonDocument();
        input.setPages(new ArrayList<>());
        when(pdfJsonConversionService.convertPdfToJsonDocument(any(MultipartFile.class)))
                .thenReturn(input);

        ResponseEntity<Resource> response = controller.editText(request);

        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertNotNull(response.getBody());
    }

    @Test
    void editText_textElementWithNullText_isSkipped() throws Exception {
        EditTextRequest request = new EditTextRequest();
        request.setFileInput(pdfFile());
        request.setEdits(List.of(edit("foo", "bar")));

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

        controller.editText(request);

        ArgumentCaptor<PdfJsonDocument> captor = ArgumentCaptor.forClass(PdfJsonDocument.class);
        org.mockito.Mockito.verify(pdfJsonConversionService)
                .convertJsonToPdf(captor.capture(), any(OutputStream.class));
        PdfJsonDocument mutated = captor.getValue();
        assertNull(mutated.getPages().get(0).getTextElements().get(0).getText());
        assertEquals("bar here", mutated.getPages().get(0).getTextElements().get(1).getText());
    }

    @Test
    void editText_outputFilenameDerivedFromInput() throws Exception {
        EditTextRequest request = new EditTextRequest();
        request.setFileInput(
                new MockMultipartFile(
                        "fileInput", "report.pdf", "application/pdf", buildEmptyPdf()));
        request.setEdits(List.of(edit("anything", "x")));

        PdfJsonDocument input = documentWithText("nothing matches");
        when(pdfJsonConversionService.convertPdfToJsonDocument(any(MultipartFile.class)))
                .thenReturn(input);

        ResponseEntity<Resource> response = controller.editText(request);
        String contentDisposition =
                response.getHeaders()
                        .getFirst(org.springframework.http.HttpHeaders.CONTENT_DISPOSITION);
        assertNotNull(contentDisposition);
        assertTrue(contentDisposition.contains("report_edited.pdf"));
        assertFalse(contentDisposition.contains(".pdf_edited.pdf"));
    }
}
