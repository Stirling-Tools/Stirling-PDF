package stirling.software.SPDF.controller.api.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;

import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.util.Calendar;
import java.util.GregorianCalendar;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDDocumentInformation;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.documentinterchange.logicalstructure.PDStructureTreeRoot;
import org.apache.pdfbox.pdmodel.encryption.AccessPermission;
import org.apache.pdfbox.pdmodel.encryption.StandardProtectionPolicy;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.apache.pdfbox.pdmodel.graphics.image.LosslessFactory;
import org.apache.pdfbox.pdmodel.graphics.image.PDImageXObject;
import org.apache.pdfbox.pdmodel.interactive.action.PDActionJavaScript;
import org.apache.pdfbox.pdmodel.interactive.annotation.PDAnnotationLink;
import org.apache.pdfbox.pdmodel.interactive.documentnavigation.outline.PDDocumentOutline;
import org.apache.pdfbox.pdmodel.interactive.documentnavigation.outline.PDOutlineItem;
import org.apache.pdfbox.pdmodel.interactive.form.PDAcroForm;
import org.apache.pdfbox.pdmodel.interactive.form.PDCheckBox;
import org.apache.pdfbox.pdmodel.interactive.form.PDTextField;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.multipart.MultipartFile;

import stirling.software.SPDF.service.VeraPDFService;
import stirling.software.common.model.api.PDFFile;
import stirling.software.common.service.CustomPDFDocumentFactory;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.json.JsonMapper;

/**
 * Coverage tests for {@link GetInfoOnPDF} driving feature-rich in-memory PDFs through the public
 * getPdfInfo endpoint so the many extract* branches run. VeraPDF + the factory are mocked.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class GetInfoOnPDFMoreTest {

    @Mock private CustomPDFDocumentFactory pdfDocumentFactory;
    @Mock private VeraPDFService veraPDFService;

    @InjectMocks private GetInfoOnPDF getInfoOnPDF;

    private final ObjectMapper om = JsonMapper.builder().build();

    /** Saves the doc, wires the factory to reload it from bytes, and calls the endpoint. */
    private JsonNode run(PDDocument doc) throws Exception {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        doc.save(out);
        doc.close();
        byte[] bytes = out.toByteArray();
        MockMultipartFile mf =
                new MockMultipartFile("fileInput", "test.pdf", "application/pdf", bytes);
        PDFFile request = new PDFFile();
        request.setFileInput(mf);
        when(pdfDocumentFactory.load(any(MultipartFile.class), eq(true)))
                .thenAnswer(inv -> Loader.loadPDF(bytes));
        ResponseEntity<byte[]> resp = getInfoOnPDF.getPdfInfo(request);
        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(resp.getBody()).isNotNull();
        return om.readTree(resp.getBody());
    }

    private static PDImageXObject smallImage(PDDocument doc) throws Exception {
        BufferedImage img = new BufferedImage(16, 16, BufferedImage.TYPE_INT_RGB);
        for (int x = 0; x < 16; x++) {
            for (int y = 0; y < 16; y++) {
                img.setRGB(x, y, (x * 16 + y) << 8);
            }
        }
        return LosslessFactory.createFromImage(doc, img);
    }

    @Nested
    @DisplayName("metadata and document info")
    class MetadataAndInfo {

        @Test
        @DisplayName("full document information is reported")
        void fullDocInfo() throws Exception {
            PDDocument doc = new PDDocument();
            doc.addPage(new PDPage(PDRectangle.A4));
            PDDocumentInformation info = doc.getDocumentInformation();
            info.setTitle("My Title");
            info.setAuthor("Jane Author");
            info.setSubject("Coverage subject");
            info.setKeywords("alpha, beta, gamma");
            info.setCreator("Creator App");
            info.setProducer("Producer Lib");
            info.setCreationDate(new GregorianCalendar(2021, Calendar.MARCH, 3));
            info.setModificationDate(new GregorianCalendar(2022, Calendar.APRIL, 4));
            info.setCustomMetadataValue("CustomKey", "CustomValue");

            JsonNode json = run(doc);
            assertThat(json.isObject()).isTrue();
            assertThat(json.size()).isGreaterThan(3);
        }

        @Test
        @DisplayName("minimal document with no info still produces a report")
        void minimalDoc() throws Exception {
            PDDocument doc = new PDDocument();
            doc.addPage(new PDPage(PDRectangle.LETTER));
            JsonNode json = run(doc);
            assertThat(json.isObject()).isTrue();
        }

        @Test
        @DisplayName("multi-page document with varied sizes and a rotated page")
        void multiPageVaried() throws Exception {
            PDDocument doc = new PDDocument();
            doc.addPage(new PDPage(PDRectangle.A4));
            doc.addPage(new PDPage(PDRectangle.LETTER));
            PDPage rotated = new PDPage(new PDRectangle(300, 500));
            rotated.setRotation(90);
            doc.addPage(rotated);
            PDPage legal = new PDPage(PDRectangle.LEGAL);
            doc.addPage(legal);
            JsonNode json = run(doc);
            assertThat(json.isObject()).isTrue();
        }
    }

    @Nested
    @DisplayName("content features")
    class ContentFeatures {

        @Test
        @DisplayName("page with text in multiple fonts and an image")
        void textImageFonts() throws Exception {
            PDDocument doc = new PDDocument();
            PDPage page = new PDPage(PDRectangle.A4);
            doc.addPage(page);
            try (PDPageContentStream cs = new PDPageContentStream(doc, page)) {
                cs.beginText();
                cs.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA), 12f);
                cs.newLineAtOffset(72, 700);
                cs.showText("Hello in Helvetica");
                cs.endText();
                cs.beginText();
                cs.setFont(new PDType1Font(Standard14Fonts.FontName.TIMES_ROMAN), 14f);
                cs.newLineAtOffset(72, 660);
                cs.showText("And Times Roman");
                cs.endText();
                cs.drawImage(smallImage(doc), 72, 500, 64, 64);
            }
            JsonNode json = run(doc);
            assertThat(json.isObject()).isTrue();
        }

        @Test
        @DisplayName("document with an outline and link annotation")
        void outlineAndLink() throws Exception {
            PDDocument doc = new PDDocument();
            PDPage p1 = new PDPage(PDRectangle.A4);
            PDPage p2 = new PDPage(PDRectangle.A4);
            doc.addPage(p1);
            doc.addPage(p2);

            PDDocumentOutline outline = new PDDocumentOutline();
            doc.getDocumentCatalog().setDocumentOutline(outline);
            PDOutlineItem root = new PDOutlineItem();
            root.setTitle("Chapter 1");
            outline.addLast(root);
            PDOutlineItem child = new PDOutlineItem();
            child.setTitle("Section 1.1");
            root.addLast(child);

            PDAnnotationLink link = new PDAnnotationLink();
            link.setRectangle(new PDRectangle(72, 700, 100, 20));
            p1.getAnnotations().add(link);

            JsonNode json = run(doc);
            assertThat(json.isObject()).isTrue();
        }

        @Test
        @DisplayName("document with JavaScript action and structure tree")
        void javascriptAndStructure() throws Exception {
            PDDocument doc = new PDDocument();
            doc.addPage(new PDPage(PDRectangle.A4));
            PDActionJavaScript js = new PDActionJavaScript("app.alert('hi');");
            doc.getDocumentCatalog().setOpenAction(js);
            doc.getDocumentCatalog().setStructureTreeRoot(new PDStructureTreeRoot());
            JsonNode json = run(doc);
            assertThat(json.isObject()).isTrue();
        }
    }

    @Nested
    @DisplayName("forms")
    class Forms {

        @Test
        @DisplayName("document with text field and checkbox AcroForm")
        void acroForm() throws Exception {
            PDDocument doc = new PDDocument();
            PDPage page = new PDPage(PDRectangle.A4);
            doc.addPage(page);
            PDAcroForm acro = new PDAcroForm(doc);
            doc.getDocumentCatalog().setAcroForm(acro);

            PDTextField text = new PDTextField(acro);
            text.setPartialName("name");
            acro.getFields().add(text);

            PDCheckBox check = new PDCheckBox(acro);
            check.setPartialName("agree");
            acro.getFields().add(check);

            JsonNode json = run(doc);
            assertThat(json.isObject()).isTrue();
        }
    }

    @Nested
    @DisplayName("encryption and permissions")
    class EncryptionPermissions {

        @Test
        @DisplayName("owner-encrypted document with restricted permissions")
        void encryptedRestricted() throws Exception {
            PDDocument doc = new PDDocument();
            doc.addPage(new PDPage(PDRectangle.A4));
            AccessPermission ap = new AccessPermission();
            ap.setCanPrint(false);
            ap.setCanModify(false);
            ap.setCanExtractContent(false);
            ap.setCanFillInForm(false);
            // Empty user password so the doc still loads, owner password locks permissions.
            StandardProtectionPolicy policy = new StandardProtectionPolicy("owner-secret", "", ap);
            policy.setEncryptionKeyLength(128);
            doc.protect(policy);
            JsonNode json = run(doc);
            assertThat(json.isObject()).isTrue();
        }
    }

    @Nested
    @DisplayName("error handling")
    class Errors {

        @Test
        @DisplayName("empty file input yields an error response")
        void emptyFile() throws Exception {
            MockMultipartFile mf =
                    new MockMultipartFile("fileInput", "x.pdf", "application/pdf", new byte[0]);
            PDFFile request = new PDFFile();
            request.setFileInput(mf);
            ResponseEntity<byte[]> resp = getInfoOnPDF.getPdfInfo(request);
            // createErrorResponse returns HTTP 200 with a JSON body carrying an "error" field.
            assertThat(resp.getBody()).isNotNull();
            JsonNode body = om.readTree(resp.getBody());
            assertThat(body.has("error")).isTrue();
            assertThat(body.get("error").asText("")).contains("Invalid");
        }

        @Test
        @DisplayName("veraPDF failure is swallowed and a report is still produced")
        void veraPdfFailureSwallowed() throws Exception {
            when(veraPDFService.validatePDF(any())).thenThrow(new RuntimeException("veraPDF boom"));
            PDDocument doc = new PDDocument();
            doc.addPage(new PDPage(PDRectangle.A4));
            JsonNode json = run(doc);
            assertThat(json.isObject()).isTrue();
        }
    }
}
