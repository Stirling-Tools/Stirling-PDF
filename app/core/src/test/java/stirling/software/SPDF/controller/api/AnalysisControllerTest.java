package stirling.software.SPDF.controller.api;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

import java.io.IOException;
import java.util.*;

import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDDocumentCatalog;
import org.apache.pdfbox.pdmodel.PDDocumentInformation;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageTree;
import org.apache.pdfbox.pdmodel.PDResources;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.encryption.AccessPermission;
import org.apache.pdfbox.pdmodel.encryption.PDEncryption;
import org.apache.pdfbox.pdmodel.interactive.annotation.PDAnnotation;
import org.apache.pdfbox.pdmodel.interactive.form.PDAcroForm;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockMultipartFile;

import stirling.software.common.model.api.PDFFile;
import stirling.software.common.service.CustomPDFDocumentFactory;

@ExtendWith(MockitoExtension.class)
class AnalysisControllerTest {

    @Mock private CustomPDFDocumentFactory pdfDocumentFactory;
    @InjectMocks private AnalysisController analysisController;

    private MockMultipartFile mockFile;

    @BeforeEach
    void setUp() {
        mockFile =
                new MockMultipartFile(
                        "fileInput", "test.pdf", "application/pdf", "fake-pdf".getBytes());
    }

    private PDFFile createRequest() {
        PDFFile request = new PDFFile();
        request.setFileInput(mockFile);
        return request;
    }

    // --- getPageCount ---

    @Test
    void getPageCount_returnsCorrectCount() throws IOException {
        PDFFile request = createRequest();
        PDDocument doc = mock(PDDocument.class);
        when(pdfDocumentFactory.load(mockFile)).thenReturn(doc);
        when(doc.getNumberOfPages()).thenReturn(5);

        ResponseEntity<?> response = analysisController.getPageCount(request);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        @SuppressWarnings("unchecked")
        Map<String, Object> body = (Map<String, Object>) response.getBody();
        assertThat(body).containsEntry("pageCount", 5);
        verify(doc).close();
    }

    @Test
    void getPageCount_emptyDocument() throws IOException {
        PDFFile request = createRequest();
        PDDocument doc = mock(PDDocument.class);
        when(pdfDocumentFactory.load(mockFile)).thenReturn(doc);
        when(doc.getNumberOfPages()).thenReturn(0);

        ResponseEntity<?> response = analysisController.getPageCount(request);

        @SuppressWarnings("unchecked")
        Map<String, Object> body = (Map<String, Object>) response.getBody();
        assertThat(body).containsEntry("pageCount", 0);
    }

    @Test
    void getPageCount_ioException() throws IOException {
        PDFFile request = createRequest();
        when(pdfDocumentFactory.load(mockFile)).thenThrow(new IOException("corrupt"));

        assertThatThrownBy(() -> analysisController.getPageCount(request))
                .isInstanceOf(IOException.class);
    }

    // --- getBasicInfo ---

    @Test
    void getBasicInfo_returnsAllFields() throws IOException {
        PDFFile request = createRequest();
        PDDocument doc = mock(PDDocument.class);
        when(pdfDocumentFactory.load(mockFile)).thenReturn(doc);
        when(doc.getNumberOfPages()).thenReturn(3);
        when(doc.getVersion()).thenReturn(1.7f);

        ResponseEntity<?> response = analysisController.getBasicInfo(request);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        @SuppressWarnings("unchecked")
        Map<String, Object> body = (Map<String, Object>) response.getBody();
        assertThat(body).containsEntry("pageCount", 3);
        assertThat(body).containsEntry("pdfVersion", 1.7f);
        assertThat(body).containsKey("fileSize");
    }

    // --- getDocumentProperties ---

    @Test
    void getDocumentProperties_returnsMetadata() throws IOException {
        PDFFile request = createRequest();
        PDDocument doc = mock(PDDocument.class);
        PDDocumentInformation info = mock(PDDocumentInformation.class);
        when(pdfDocumentFactory.load(mockFile, true)).thenReturn(doc);
        when(doc.getDocumentInformation()).thenReturn(info);
        when(info.getTitle()).thenReturn("Test Title");
        when(info.getAuthor()).thenReturn("Author");
        when(info.getSubject()).thenReturn("Subject");
        when(info.getKeywords()).thenReturn("key1,key2");
        when(info.getCreator()).thenReturn("Creator");
        when(info.getProducer()).thenReturn("Producer");
        when(info.getCreationDate()).thenReturn(null);
        when(info.getModificationDate()).thenReturn(null);

        ResponseEntity<?> response = analysisController.getDocumentProperties(request);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        @SuppressWarnings("unchecked")
        Map<String, String> body = (Map<String, String>) response.getBody();
        assertThat(body).containsEntry("title", "Test Title");
        assertThat(body).containsEntry("author", "Author");
    }

    @Test
    void getDocumentProperties_nullValues() throws IOException {
        PDFFile request = createRequest();
        PDDocument doc = mock(PDDocument.class);
        PDDocumentInformation info = mock(PDDocumentInformation.class);
        when(pdfDocumentFactory.load(mockFile, true)).thenReturn(doc);
        when(doc.getDocumentInformation()).thenReturn(info);

        ResponseEntity<?> response = analysisController.getDocumentProperties(request);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        @SuppressWarnings("unchecked")
        Map<String, String> body = (Map<String, String>) response.getBody();
        assertThat(body.get("title")).isNull();
    }

    // --- getPageDimensions ---

    @Test
    void getPageDimensions_multiplePages() throws IOException {
        PDFFile request = createRequest();
        PDDocument doc = mock(PDDocument.class);
        PDPageTree pages = mock(PDPageTree.class);
        PDPage page1 = mock(PDPage.class);
        PDPage page2 = mock(PDPage.class);
        when(pdfDocumentFactory.load(mockFile)).thenReturn(doc);
        when(doc.getPages()).thenReturn(pages);
        when(pages.iterator()).thenReturn(List.of(page1, page2).iterator());
        when(page1.getBBox()).thenReturn(new PDRectangle(612, 792));
        when(page2.getBBox()).thenReturn(new PDRectangle(842, 595));

        ResponseEntity<?> response = analysisController.getPageDimensions(request);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        @SuppressWarnings("unchecked")
        List<Map<String, Float>> body = (List<Map<String, Float>>) response.getBody();
        assertThat(body).hasSize(2);
        assertThat(body.get(0)).containsEntry("width", 612f);
        assertThat(body.get(1)).containsEntry("width", 842f);
    }

    // --- getFormFields ---

    @Test
    void getFormFields_withForm() throws IOException {
        PDFFile request = createRequest();
        PDDocument doc = mock(PDDocument.class);
        PDDocumentCatalog catalog = mock(PDDocumentCatalog.class);
        PDAcroForm form = mock(PDAcroForm.class);
        when(pdfDocumentFactory.load(mockFile)).thenReturn(doc);
        when(doc.getDocumentCatalog()).thenReturn(catalog);
        when(catalog.getAcroForm()).thenReturn(form);
        when(form.getFields()).thenReturn(List.of());
        when(form.hasXFA()).thenReturn(false);
        when(form.isSignaturesExist()).thenReturn(true);

        ResponseEntity<?> response = analysisController.getFormFields(request);

        @SuppressWarnings("unchecked")
        Map<String, Object> body = (Map<String, Object>) response.getBody();
        assertThat(body).containsEntry("fieldCount", 0);
        assertThat(body).containsEntry("hasXFA", false);
        assertThat(body).containsEntry("isSignaturesExist", true);
    }

    @Test
    void getFormFields_noForm() throws IOException {
        PDFFile request = createRequest();
        PDDocument doc = mock(PDDocument.class);
        PDDocumentCatalog catalog = mock(PDDocumentCatalog.class);
        when(pdfDocumentFactory.load(mockFile)).thenReturn(doc);
        when(doc.getDocumentCatalog()).thenReturn(catalog);
        when(catalog.getAcroForm()).thenReturn(null);

        ResponseEntity<?> response = analysisController.getFormFields(request);

        @SuppressWarnings("unchecked")
        Map<String, Object> body = (Map<String, Object>) response.getBody();
        assertThat(body).containsEntry("fieldCount", 0);
        assertThat(body).containsEntry("hasXFA", false);
        assertThat(body).containsEntry("isSignaturesExist", false);
    }

    // --- getAnnotationInfo ---

    @Test
    void getAnnotationInfo_withAnnotations() throws IOException {
        PDFFile request = createRequest();
        PDDocument doc = mock(PDDocument.class);
        PDPageTree pages = mock(PDPageTree.class);
        PDPage page = mock(PDPage.class);
        PDAnnotation annot = mock(PDAnnotation.class);
        when(pdfDocumentFactory.load(mockFile)).thenReturn(doc);
        when(doc.getPages()).thenReturn(pages);
        when(pages.iterator()).thenReturn(List.of(page).iterator());
        when(page.getAnnotations()).thenReturn(List.of(annot));
        when(annot.getSubtype()).thenReturn("Link");

        ResponseEntity<?> response = analysisController.getAnnotationInfo(request);

        @SuppressWarnings("unchecked")
        Map<String, Object> body = (Map<String, Object>) response.getBody();
        assertThat(body).containsEntry("totalCount", 1);
        @SuppressWarnings("unchecked")
        Map<String, Integer> types = (Map<String, Integer>) body.get("typeBreakdown");
        assertThat(types).containsEntry("Link", 1);
    }

    @Test
    void getAnnotationInfo_noAnnotations() throws IOException {
        PDFFile request = createRequest();
        PDDocument doc = mock(PDDocument.class);
        PDPageTree pages = mock(PDPageTree.class);
        PDPage page = mock(PDPage.class);
        when(pdfDocumentFactory.load(mockFile)).thenReturn(doc);
        when(doc.getPages()).thenReturn(pages);
        when(pages.iterator()).thenReturn(List.of(page).iterator());
        when(page.getAnnotations()).thenReturn(List.of());

        ResponseEntity<?> response = analysisController.getAnnotationInfo(request);

        @SuppressWarnings("unchecked")
        Map<String, Object> body = (Map<String, Object>) response.getBody();
        assertThat(body).containsEntry("totalCount", 0);
    }

    // --- getFontInfo ---

    @Test
    void getFontInfo_withFonts() throws IOException {
        PDFFile request = createRequest();
        PDDocument doc = mock(PDDocument.class);
        PDPageTree pages = mock(PDPageTree.class);
        PDPage page = mock(PDPage.class);
        PDResources resources = mock(PDResources.class);
        when(pdfDocumentFactory.load(mockFile)).thenReturn(doc);
        when(doc.getPages()).thenReturn(pages);
        when(pages.iterator()).thenReturn(List.of(page).iterator());
        when(page.getResources()).thenReturn(resources);
        when(resources.getFontNames())
                .thenReturn(Set.of(COSName.getPDFName("F1"), COSName.getPDFName("F2")));

        ResponseEntity<?> response = analysisController.getFontInfo(request);

        @SuppressWarnings("unchecked")
        Map<String, Object> body = (Map<String, Object>) response.getBody();
        assertThat(body).containsEntry("fontCount", 2);
    }

    @Test
    void getFontInfo_noResources() throws IOException {
        PDFFile request = createRequest();
        PDDocument doc = mock(PDDocument.class);
        PDPageTree pages = mock(PDPageTree.class);
        PDPage page = mock(PDPage.class);
        when(pdfDocumentFactory.load(mockFile)).thenReturn(doc);
        when(doc.getPages()).thenReturn(pages);
        when(pages.iterator()).thenReturn(List.of(page).iterator());
        when(page.getResources()).thenReturn(null);

        ResponseEntity<?> response = analysisController.getFontInfo(request);

        @SuppressWarnings("unchecked")
        Map<String, Object> body = (Map<String, Object>) response.getBody();
        assertThat(body).containsEntry("fontCount", 0);
    }

    // --- getSecurityInfo ---

    @Test
    void getSecurityInfo_encrypted() throws IOException {
        PDFFile request = createRequest();
        PDDocument doc = mock(PDDocument.class);
        PDEncryption encryption = mock(PDEncryption.class);
        AccessPermission perm = mock(AccessPermission.class);
        when(pdfDocumentFactory.load(mockFile)).thenReturn(doc);
        when(doc.getEncryption()).thenReturn(encryption);
        when(encryption.getLength()).thenReturn(128);
        when(doc.getCurrentAccessPermission()).thenReturn(perm);
        when(perm.canPrint()).thenReturn(false);
        when(perm.canModify()).thenReturn(true);
        when(perm.canExtractContent()).thenReturn(true);
        when(perm.canModifyAnnotations()).thenReturn(false);

        ResponseEntity<?> response = analysisController.getSecurityInfo(request);

        @SuppressWarnings("unchecked")
        Map<String, Object> body = (Map<String, Object>) response.getBody();
        assertThat(body).containsEntry("isEncrypted", true);
        assertThat(body).containsEntry("keyLength", 128);
        @SuppressWarnings("unchecked")
        Map<String, Boolean> perms = (Map<String, Boolean>) body.get("permissions");
        assertThat(perms).containsEntry("preventPrinting", true);
        assertThat(perms).containsEntry("preventModify", false);
    }

    @Test
    void getSecurityInfo_notEncrypted() throws IOException {
        PDFFile request = createRequest();
        PDDocument doc = mock(PDDocument.class);
        when(pdfDocumentFactory.load(mockFile)).thenReturn(doc);
        when(doc.getEncryption()).thenReturn(null);

        ResponseEntity<?> response = analysisController.getSecurityInfo(request);

        @SuppressWarnings("unchecked")
        Map<String, Object> body = (Map<String, Object>) response.getBody();
        assertThat(body).containsEntry("isEncrypted", false);
        assertThat(body).doesNotContainKey("permissions");
    }
}
