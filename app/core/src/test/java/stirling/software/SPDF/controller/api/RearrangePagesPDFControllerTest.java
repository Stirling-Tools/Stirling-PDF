package stirling.software.SPDF.controller.api;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;

import java.awt.Color;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.PDResources;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.apache.pdfbox.pdmodel.interactive.annotation.PDAnnotationWidget;
import org.apache.pdfbox.pdmodel.interactive.form.PDAcroForm;
import org.apache.pdfbox.pdmodel.interactive.form.PDField;
import org.apache.pdfbox.pdmodel.interactive.form.PDTextField;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.core.io.Resource;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockMultipartFile;

import stirling.software.SPDF.model.api.PDFWithPageNums;
import stirling.software.SPDF.model.api.general.RearrangePagesRequest;
import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.service.PdfMetadataService;
import stirling.software.common.util.TempFileManager;
import stirling.software.common.util.TempFileRegistry;

class RearrangePagesPDFControllerTest {

    @TempDir Path tempDir;

    private CustomPDFDocumentFactory pdfDocumentFactory;
    private TempFileManager tempFileManager;
    private RearrangePagesPDFController controller;

    @BeforeEach
    void setUp() {
        TempFileRegistry registry = new TempFileRegistry();
        ApplicationProperties applicationProperties = new ApplicationProperties();
        applicationProperties.getSystem().getTempFileManagement().setBaseTmpDir(tempDir.toString());
        applicationProperties.getSystem().getTempFileManagement().setPrefix("rearrange-test-");
        tempFileManager = new TempFileManager(registry, applicationProperties);
        PdfMetadataService metadataService =
                new PdfMetadataService(applicationProperties, "rearrange-test", false, null);
        pdfDocumentFactory = new CustomPDFDocumentFactory(metadataService, tempFileManager);
        controller = new RearrangePagesPDFController(pdfDocumentFactory, tempFileManager);
    }

    private MockMultipartFile buildPdf(int pageCount) throws IOException {
        try (PDDocument doc = new PDDocument()) {
            for (int i = 0; i < pageCount; i++) {
                PDPage page = new PDPage(PDRectangle.LETTER);
                doc.addPage(page);
                try (PDPageContentStream cs = new PDPageContentStream(doc, page)) {
                    cs.setNonStrokingColor(Color.BLACK);
                    cs.beginText();
                    cs.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA), 24);
                    cs.newLineAtOffset(72, 720);
                    cs.showText("Page " + (i + 1));
                    cs.endText();
                }
            }
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            doc.save(baos);
            return new MockMultipartFile(
                    "fileInput", "input.pdf", MediaType.APPLICATION_PDF_VALUE, baos.toByteArray());
        }
    }

    private MockMultipartFile buildPdfWithForm(int pageCount) throws IOException {
        try (PDDocument doc = new PDDocument()) {
            List<PDPage> pages = new ArrayList<>();
            for (int i = 0; i < pageCount; i++) {
                PDPage page = new PDPage(PDRectangle.LETTER);
                doc.addPage(page);
                pages.add(page);
            }
            PDAcroForm acroForm = new PDAcroForm(doc);
            acroForm.setDefaultResources(new PDResources());
            acroForm.setDefaultAppearance("/Helv 12 Tf 0 g");
            acroForm.setNeedAppearances(true);
            doc.getDocumentCatalog().setAcroForm(acroForm);
            List<PDField> fields = new ArrayList<>();
            PDTextField textField = new PDTextField(acroForm);
            textField.setPartialName("formField1");
            PDAnnotationWidget widget = new PDAnnotationWidget();
            widget.setRectangle(new PDRectangle(50, 700, 200, 20));
            widget.setPage(pages.get(0));
            List<PDAnnotationWidget> widgets = new ArrayList<>();
            widgets.add(widget);
            textField.setWidgets(widgets);
            pages.get(0).getAnnotations().add(widget);
            fields.add(textField);
            acroForm.setFields(fields);
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            doc.save(baos);
            return new MockMultipartFile(
                    "fileInput", "form.pdf", MediaType.APPLICATION_PDF_VALUE, baos.toByteArray());
        }
    }

    private byte[] drainResponse(ResponseEntity<Resource> response) throws IOException {
        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        try (var in = response.getBody().getInputStream()) {
            in.transferTo(baos);
        }
        return baos.toByteArray();
    }

    @Test
    void testDeletePages_Success() throws IOException {
        MockMultipartFile file = buildPdf(5);
        PDFWithPageNums request = new PDFWithPageNums();
        request.setFileInput(file);
        request.setPageNumbers("1,3");

        ResponseEntity<Resource> response = controller.deletePages(request);
        assertNotNull(response);
        assertEquals(200, response.getStatusCode().value());

        byte[] body = drainResponse(response);
        try (PDDocument out = Loader.loadPDF(body)) {
            assertEquals(3, out.getNumberOfPages());
        }
    }

    @Test
    void testDeletePages_RangeSyntax() throws IOException {
        MockMultipartFile file = buildPdf(6);
        PDFWithPageNums request = new PDFWithPageNums();
        request.setFileInput(file);
        request.setPageNumbers("2-4");

        byte[] body = drainResponse(controller.deletePages(request));
        try (PDDocument out = Loader.loadPDF(body)) {
            assertEquals(3, out.getNumberOfPages());
        }
    }

    @Test
    void testRearrangePages_ReverseOrder() throws IOException {
        MockMultipartFile file = buildPdf(3);
        RearrangePagesRequest request = new RearrangePagesRequest();
        request.setFileInput(file);
        request.setPageNumbers("");
        request.setCustomMode("REVERSE_ORDER");

        byte[] body = drainResponse(controller.rearrangePages(request));
        try (PDDocument out = Loader.loadPDF(body)) {
            assertEquals(3, out.getNumberOfPages());
        }
    }

    @Test
    void testRearrangePages_RemoveFirst() throws IOException {
        MockMultipartFile file = buildPdf(3);
        RearrangePagesRequest request = new RearrangePagesRequest();
        request.setFileInput(file);
        request.setPageNumbers("");
        request.setCustomMode("REMOVE_FIRST");

        byte[] body = drainResponse(controller.rearrangePages(request));
        try (PDDocument out = Loader.loadPDF(body)) {
            assertEquals(2, out.getNumberOfPages());
        }
    }

    @Test
    void testRearrangePages_RemoveLast() throws IOException {
        MockMultipartFile file = buildPdf(3);
        RearrangePagesRequest request = new RearrangePagesRequest();
        request.setFileInput(file);
        request.setPageNumbers("");
        request.setCustomMode("REMOVE_LAST");

        byte[] body = drainResponse(controller.rearrangePages(request));
        try (PDDocument out = Loader.loadPDF(body)) {
            assertEquals(2, out.getNumberOfPages());
        }
    }

    @Test
    void testRearrangePages_RemoveFirstAndLast() throws IOException {
        MockMultipartFile file = buildPdf(4);
        RearrangePagesRequest request = new RearrangePagesRequest();
        request.setFileInput(file);
        request.setPageNumbers("");
        request.setCustomMode("REMOVE_FIRST_AND_LAST");

        byte[] body = drainResponse(controller.rearrangePages(request));
        try (PDDocument out = Loader.loadPDF(body)) {
            assertEquals(2, out.getNumberOfPages());
        }
    }

    @Test
    void testRearrangePages_DuplexSort() throws IOException {
        MockMultipartFile file = buildPdf(4);
        RearrangePagesRequest request = new RearrangePagesRequest();
        request.setFileInput(file);
        request.setPageNumbers("");
        request.setCustomMode("DUPLEX_SORT");

        byte[] body = drainResponse(controller.rearrangePages(request));
        try (PDDocument out = Loader.loadPDF(body)) {
            assertEquals(4, out.getNumberOfPages());
        }
    }

    @Test
    void testRearrangePages_BookletSort() throws IOException {
        MockMultipartFile file = buildPdf(4);
        RearrangePagesRequest request = new RearrangePagesRequest();
        request.setFileInput(file);
        request.setPageNumbers("");
        request.setCustomMode("BOOKLET_SORT");

        byte[] body = drainResponse(controller.rearrangePages(request));
        try (PDDocument out = Loader.loadPDF(body)) {
            assertEquals(4, out.getNumberOfPages());
        }
    }

    @Test
    void testRearrangePages_OddEvenSplit() throws IOException {
        MockMultipartFile file = buildPdf(4);
        RearrangePagesRequest request = new RearrangePagesRequest();
        request.setFileInput(file);
        request.setPageNumbers("");
        request.setCustomMode("ODD_EVEN_SPLIT");

        byte[] body = drainResponse(controller.rearrangePages(request));
        try (PDDocument out = Loader.loadPDF(body)) {
            assertEquals(4, out.getNumberOfPages());
        }
    }

    @Test
    void testRearrangePages_CustomPageOrder() throws IOException {
        MockMultipartFile file = buildPdf(3);
        RearrangePagesRequest request = new RearrangePagesRequest();
        request.setFileInput(file);
        request.setPageNumbers("3,1,2");
        request.setCustomMode("custom");

        byte[] body = drainResponse(controller.rearrangePages(request));
        try (PDDocument out = Loader.loadPDF(body)) {
            assertEquals(3, out.getNumberOfPages());
        }
    }

    @Test
    void testRearrangePages_Duplicate() throws IOException {
        MockMultipartFile file = buildPdf(2);
        RearrangePagesRequest request = new RearrangePagesRequest();
        request.setFileInput(file);
        request.setPageNumbers("3");
        request.setCustomMode("DUPLICATE");

        byte[] body = drainResponse(controller.rearrangePages(request));
        try (PDDocument out = Loader.loadPDF(body)) {
            assertEquals(6, out.getNumberOfPages());
        }
    }

    @Test
    void testRearrangePages_SideStitchBooklet() throws IOException {
        MockMultipartFile file = buildPdf(4);
        RearrangePagesRequest request = new RearrangePagesRequest();
        request.setFileInput(file);
        request.setPageNumbers("");
        request.setCustomMode("SIDE_STITCH_BOOKLET_SORT");

        byte[] body = drainResponse(controller.rearrangePages(request));
        try (PDDocument out = Loader.loadPDF(body)) {
            assertEquals(4, out.getNumberOfPages());
        }
    }

    @Test
    void testRearrangePages_PreservesPageRotation() throws IOException {
        try (PDDocument doc = new PDDocument()) {
            for (int i = 0; i < 3; i++) {
                PDPage page = new PDPage(PDRectangle.LETTER);
                page.setRotation(i * 90);
                doc.addPage(page);
            }
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            doc.save(baos);
            MockMultipartFile file =
                    new MockMultipartFile(
                            "fileInput",
                            "rot.pdf",
                            MediaType.APPLICATION_PDF_VALUE,
                            baos.toByteArray());
            RearrangePagesRequest request = new RearrangePagesRequest();
            request.setFileInput(file);
            request.setPageNumbers("");
            request.setCustomMode("REVERSE_ORDER");

            byte[] body = drainResponse(controller.rearrangePages(request));
            try (PDDocument out = Loader.loadPDF(body)) {
                assertEquals(3, out.getNumberOfPages());
                assertEquals(180, out.getPage(0).getRotation());
                assertEquals(90, out.getPage(1).getRotation());
                assertEquals(0, out.getPage(2).getRotation());
            }
        }
    }

    @Test
    void testRearrangePages_FormPdf_DoesNotCorrupt() throws IOException {
        MockMultipartFile file = buildPdfWithForm(3);
        RearrangePagesRequest request = new RearrangePagesRequest();
        request.setFileInput(file);
        request.setPageNumbers("");
        request.setCustomMode("REVERSE_ORDER");

        ResponseEntity<Resource> response = controller.rearrangePages(request);
        assertEquals(200, response.getStatusCode().value());

        byte[] body = drainResponse(response);
        try (PDDocument out = Loader.loadPDF(body)) {
            assertEquals(3, out.getNumberOfPages());
        }
    }

    @Test
    void testDeletePages_PreservesPageContent() throws IOException {
        MockMultipartFile file = buildPdf(4);
        PDFWithPageNums request = new PDFWithPageNums();
        request.setFileInput(file);
        request.setPageNumbers("2");

        byte[] body = drainResponse(controller.deletePages(request));
        try (PDDocument out = Loader.loadPDF(body)) {
            assertEquals(3, out.getNumberOfPages());
            for (int i = 0; i < out.getNumberOfPages(); i++) {
                assertNotNull(out.getPage(i).getMediaBox());
            }
        }
    }
}
