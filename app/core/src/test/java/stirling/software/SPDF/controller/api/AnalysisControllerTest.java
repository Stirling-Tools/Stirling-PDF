package stirling.software.SPDF.controller.api;

import static org.junit.jupiter.api.Assertions.*;
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
import org.apache.pdfbox.pdmodel.interactive.form.PDField;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;

import stirling.software.common.model.api.PDFFile;
import stirling.software.common.service.CustomPDFDocumentFactory;

@ExtendWith(MockitoExtension.class)
class AnalysisControllerTest {

    @Mock private CustomPDFDocumentFactory pdfDocumentFactory;

    @InjectMocks private AnalysisController analysisController;

    private PDFFile createPdfFile(MockMultipartFile multipartFile) {
        PDFFile pdfFile = new PDFFile();
        pdfFile.setFileInput(multipartFile);
        return pdfFile;
    }

    private MockMultipartFile createMockFile() {
        return new MockMultipartFile(
                "file", "test.pdf", MediaType.APPLICATION_PDF_VALUE, new byte[] {1, 2, 3});
    }

    @Test
    void getPageCount_returnsTotalPages() throws IOException {
        MockMultipartFile mockFile = createMockFile();
        PDFFile pdfFile = createPdfFile(mockFile);

        PDDocument document = mock(PDDocument.class);
        when(pdfDocumentFactory.load(mockFile)).thenReturn(document);
        when(document.getNumberOfPages()).thenReturn(7);

        Map<String, Integer> result = analysisController.getPageCount(pdfFile);

        assertEquals(7, result.get("pageCount"));
        verify(document).getNumberOfPages();
        verify(document).close();
    }

    @Test
    void getBasicInfo_returnsPageCountVersionAndSize() throws IOException {
        MockMultipartFile mockFile = createMockFile();
        PDFFile pdfFile = createPdfFile(mockFile);

        PDDocument document = mock(PDDocument.class);
        when(pdfDocumentFactory.load(mockFile)).thenReturn(document);
        when(document.getNumberOfPages()).thenReturn(3);
        when(document.getVersion()).thenReturn(1.7f);

        Map<String, Object> result = analysisController.getBasicInfo(pdfFile);

        assertEquals(3, result.get("pageCount"));
        assertEquals(1.7f, result.get("pdfVersion"));
        assertEquals(mockFile.getSize(), result.get("fileSize"));
    }

    @Test
    void getDocumentProperties_returnsMetadata() throws IOException {
        MockMultipartFile mockFile = createMockFile();
        PDFFile pdfFile = createPdfFile(mockFile);

        PDDocument document = mock(PDDocument.class);
        when(pdfDocumentFactory.load(mockFile, true)).thenReturn(document);

        PDDocumentInformation information = mock(PDDocumentInformation.class);
        when(document.getDocumentInformation()).thenReturn(information);

        when(information.getTitle()).thenReturn("Title");
        when(information.getAuthor()).thenReturn("Author");
        when(information.getSubject()).thenReturn("Subject");
        when(information.getKeywords()).thenReturn("Keywords");
        when(information.getCreator()).thenReturn("Creator");
        when(information.getProducer()).thenReturn("Producer");

        GregorianCalendar creationDate = new GregorianCalendar(2024, Calendar.JANUARY, 1);
        GregorianCalendar modificationDate = new GregorianCalendar(2024, Calendar.JANUARY, 2);
        when(information.getCreationDate()).thenReturn(creationDate);
        when(information.getModificationDate()).thenReturn(modificationDate);

        Map<String, String> result = analysisController.getDocumentProperties(pdfFile);

        assertEquals("Title", result.get("title"));
        assertEquals("Author", result.get("author"));
        assertEquals("Subject", result.get("subject"));
        assertEquals("Keywords", result.get("keywords"));
        assertEquals("Creator", result.get("creator"));
        assertEquals("Producer", result.get("producer"));
        assertEquals(creationDate.toString(), result.get("creationDate"));
        assertEquals(modificationDate.toString(), result.get("modificationDate"));
    }

    @Test
    void getPageDimensions_returnsDimensionsForEachPage() throws IOException {
        MockMultipartFile mockFile = createMockFile();
        PDFFile pdfFile = createPdfFile(mockFile);

        PDDocument document = mock(PDDocument.class);
        when(pdfDocumentFactory.load(mockFile)).thenReturn(document);

        PDPageTree pageTree = mock(PDPageTree.class);
        when(document.getPages()).thenReturn(pageTree);

        PDPage page1 = mock(PDPage.class);
        PDPage page2 = mock(PDPage.class);
        when(pageTree.iterator()).thenReturn(Arrays.asList(page1, page2).iterator());

        when(page1.getBBox()).thenReturn(new PDRectangle(0, 0, 200, 300));
        when(page2.getBBox()).thenReturn(new PDRectangle(0, 0, 400, 500));

        List<Map<String, Float>> result = analysisController.getPageDimensions(pdfFile);

        assertEquals(2, result.size());
        assertEquals(200f, result.get(0).get("width"));
        assertEquals(300f, result.get(0).get("height"));
        assertEquals(400f, result.get(1).get("width"));
        assertEquals(500f, result.get(1).get("height"));
    }

    @Test
    void getFormFields_returnsFormInformationWhenFormExists() throws IOException {
        MockMultipartFile mockFile = createMockFile();
        PDFFile pdfFile = createPdfFile(mockFile);

        PDDocument document = mock(PDDocument.class);
        when(pdfDocumentFactory.load(mockFile)).thenReturn(document);

        PDDocumentCatalog catalog = mock(PDDocumentCatalog.class);
        when(document.getDocumentCatalog()).thenReturn(catalog);

        PDAcroForm form = mock(PDAcroForm.class);
        when(catalog.getAcroForm()).thenReturn(form);

        List<PDField> fields = Arrays.asList(mock(PDField.class), mock(PDField.class));
        when(form.getFields()).thenReturn(fields);
        when(form.hasXFA()).thenReturn(true);
        when(form.isSignaturesExist()).thenReturn(false);

        Map<String, Object> result = analysisController.getFormFields(pdfFile);

        assertEquals(2, result.get("fieldCount"));
        assertEquals(true, result.get("hasXFA"));
        assertEquals(false, result.get("isSignaturesExist"));
    }

    @Test
    void getFormFields_returnsDefaultsWhenFormMissing() throws IOException {
        MockMultipartFile mockFile = createMockFile();
        PDFFile pdfFile = createPdfFile(mockFile);

        PDDocument document = mock(PDDocument.class);
        when(pdfDocumentFactory.load(mockFile)).thenReturn(document);

        PDDocumentCatalog catalog = mock(PDDocumentCatalog.class);
        when(document.getDocumentCatalog()).thenReturn(catalog);
        when(catalog.getAcroForm()).thenReturn(null);

        Map<String, Object> result = analysisController.getFormFields(pdfFile);

        assertEquals(0, result.get("fieldCount"));
        assertEquals(false, result.get("hasXFA"));
        assertEquals(false, result.get("isSignaturesExist"));
    }

    @Test
    void getAnnotationInfo_countsAnnotationsByType() throws IOException {
        MockMultipartFile mockFile = createMockFile();
        PDFFile pdfFile = createPdfFile(mockFile);

        PDDocument document = mock(PDDocument.class);
        when(pdfDocumentFactory.load(mockFile)).thenReturn(document);

        PDPageTree pageTree = mock(PDPageTree.class);
        when(document.getPages()).thenReturn(pageTree);

        PDPage page = mock(PDPage.class);
        when(pageTree.iterator()).thenReturn(Collections.singletonList(page).iterator());

        PDAnnotation annotation1 = mock(PDAnnotation.class);
        PDAnnotation annotation2 = mock(PDAnnotation.class);
        when(page.getAnnotations()).thenReturn(Arrays.asList(annotation1, annotation2));
        when(annotation1.getSubtype()).thenReturn("Text");
        when(annotation2.getSubtype()).thenReturn("Highlight");

        Map<String, Object> result = analysisController.getAnnotationInfo(pdfFile);

        assertEquals(2, result.get("totalCount"));
        @SuppressWarnings("unchecked")
        Map<String, Integer> breakdown = (Map<String, Integer>) result.get("typeBreakdown");
        assertEquals(1, breakdown.get("Text"));
        assertEquals(1, breakdown.get("Highlight"));
    }

    @Test
    void getFontInfo_collectsUniqueFontNames() throws IOException {
        MockMultipartFile mockFile = createMockFile();
        PDFFile pdfFile = createPdfFile(mockFile);

        PDDocument document = mock(PDDocument.class);
        when(pdfDocumentFactory.load(mockFile)).thenReturn(document);

        PDPageTree pageTree = mock(PDPageTree.class);
        when(document.getPages()).thenReturn(pageTree);

        PDPage page = mock(PDPage.class);
        when(pageTree.iterator()).thenReturn(Collections.singletonList(page).iterator());

        PDResources resources = mock(PDResources.class);
        when(page.getResources()).thenReturn(resources);

        Set<COSName> fonts = new HashSet<>();
        fonts.add(COSName.getPDFName("FontA"));
        fonts.add(COSName.getPDFName("FontB"));
        when(resources.getFontNames()).thenReturn(fonts);

        Map<String, Object> result = analysisController.getFontInfo(pdfFile);

        assertEquals(2, result.get("fontCount"));
        @SuppressWarnings("unchecked")
        Set<String> fontNames = (Set<String>) result.get("fonts");
        assertTrue(fontNames.contains("FontA"));
        assertTrue(fontNames.contains("FontB"));
    }

    @Test
    void getSecurityInfo_returnsEncryptionDetails() throws IOException {
        MockMultipartFile mockFile = createMockFile();
        PDFFile pdfFile = createPdfFile(mockFile);

        PDDocument document = mock(PDDocument.class);
        when(pdfDocumentFactory.load(mockFile)).thenReturn(document);

        PDEncryption encryption = mock(PDEncryption.class);
        when(document.getEncryption()).thenReturn(encryption);
        when(encryption.getLength()).thenReturn(256);

        AccessPermission permission = new AccessPermission();
        permission.setCanPrint(false);
        permission.setCanModify(true);
        permission.setCanExtractContent(false);
        permission.setCanModifyAnnotations(true);
        when(document.getCurrentAccessPermission()).thenReturn(permission);

        Map<String, Object> result = analysisController.getSecurityInfo(pdfFile);

        assertEquals(true, result.get("isEncrypted"));
        assertEquals(256, result.get("keyLength"));
        @SuppressWarnings("unchecked")
        Map<String, Boolean> permissions = (Map<String, Boolean>) result.get("permissions");
        assertEquals(true, permissions.get("preventPrinting"));
        assertEquals(false, permissions.get("preventModify"));
        assertEquals(true, permissions.get("preventExtractContent"));
        assertEquals(false, permissions.get("preventModifyAnnotations"));
    }

    @Test
    void getSecurityInfo_returnsNotEncryptedWhenEncryptionMissing() throws IOException {
        MockMultipartFile mockFile = createMockFile();
        PDFFile pdfFile = createPdfFile(mockFile);

        PDDocument document = mock(PDDocument.class);
        when(pdfDocumentFactory.load(mockFile)).thenReturn(document);
        when(document.getEncryption()).thenReturn(null);

        Map<String, Object> result = analysisController.getSecurityInfo(pdfFile);

        assertEquals(false, result.get("isEncrypted"));
        assertFalse(result.containsKey("permissions"));
    }
}
