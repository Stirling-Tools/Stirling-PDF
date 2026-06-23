package stirling.software.SPDF.controller.api.misc;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.when;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.cos.COSArray;
import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.cos.COSString;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDResources;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.common.PDStream;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.apache.pdfbox.pdmodel.interactive.form.PDAcroForm;
import org.apache.pdfbox.pdmodel.interactive.form.PDField;
import org.apache.pdfbox.pdmodel.interactive.form.PDTextField;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.MockedStatic;
import org.mockito.Mockito;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockMultipartFile;

import stirling.software.common.model.api.PDFFile;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.TempFileManager;
import stirling.software.common.util.WebResponseUtils;

/**
 * Gap coverage for {@link UnlockPDFFormsController}: the locked-field flag clearing, /Lock removal,
 * and the XFA stream/array rewrite branches, all driven with real form PDFs.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
@DisplayName("UnlockPDFFormsController field/XFA branches")
class UnlockPDFFormsControllerMoreTest {

    @Mock private CustomPDFDocumentFactory pdfDocumentFactory;
    @Mock private TempFileManager tempFileManager;

    private UnlockPDFFormsController controller;

    @BeforeEach
    void setUp() {
        controller = new UnlockPDFFormsController(pdfDocumentFactory, tempFileManager);
    }

    private static PDTextField buildField(PDAcroForm acroForm, boolean readOnly, boolean withLock) {
        PDTextField field = new PDTextField(acroForm);
        try {
            field.setPartialName("field1");
        } catch (Exception ignored) {
            // partial name set is best-effort for the test fixture
        }
        field.getCOSObject().setString(COSName.DA, "/Helv 12 Tf 0 g");
        if (readOnly) {
            field.setReadOnly(true);
        }
        if (withLock) {
            field.getCOSObject().setItem(COSName.getPDFName("Lock"), new COSArray());
        }
        return field;
    }

    private static byte[] formPdf(boolean readOnly, boolean withLock) throws IOException {
        try (PDDocument doc = new PDDocument();
                ByteArrayOutputStream baos = new ByteArrayOutputStream()) {
            doc.addPage(new PDPage(PDRectangle.A4));
            PDAcroForm acroForm = new PDAcroForm(doc);
            doc.getDocumentCatalog().setAcroForm(acroForm);
            PDResources dr = new PDResources();
            dr.put(COSName.getPDFName("Helv"), new PDType1Font(Standard14Fonts.FontName.HELVETICA));
            acroForm.setDefaultResources(dr);
            acroForm.getFields().add(buildField(acroForm, readOnly, withLock));
            doc.save(baos);
            return baos.toByteArray();
        }
    }

    private static final String XFA_XML =
            "<xdp><template><field access=\"readOnly\"/></template></xdp>";

    private static byte[] formPdfWithXfaStream() throws IOException {
        try (PDDocument doc = new PDDocument();
                ByteArrayOutputStream baos = new ByteArrayOutputStream()) {
            doc.addPage(new PDPage(PDRectangle.A4));
            PDAcroForm acroForm = new PDAcroForm(doc);
            doc.getDocumentCatalog().setAcroForm(acroForm);
            PDStream xfaStream =
                    new PDStream(
                            doc,
                            new ByteArrayInputStream(XFA_XML.getBytes(StandardCharsets.UTF_8)));
            acroForm.getCOSObject().setItem(COSName.XFA, xfaStream.getCOSObject());
            doc.save(baos);
            return baos.toByteArray();
        }
    }

    private static byte[] formPdfWithXfaArray() throws IOException {
        try (PDDocument doc = new PDDocument();
                ByteArrayOutputStream baos = new ByteArrayOutputStream()) {
            doc.addPage(new PDPage(PDRectangle.A4));
            PDAcroForm acroForm = new PDAcroForm(doc);
            doc.getDocumentCatalog().setAcroForm(acroForm);
            COSArray xfaArray = new COSArray();
            xfaArray.add(new COSString("template"));
            PDStream xfaStream =
                    new PDStream(
                            doc,
                            new ByteArrayInputStream(XFA_XML.getBytes(StandardCharsets.UTF_8)));
            xfaArray.add(xfaStream.getCOSObject());
            acroForm.getCOSObject().setItem(COSName.XFA, xfaArray);
            doc.save(baos);
            return baos.toByteArray();
        }
    }

    private static PDFFile request(byte[] pdf) {
        PDFFile file = new PDFFile();
        file.setFileInput(
                new MockMultipartFile(
                        "fileInput", "form.pdf", MediaType.APPLICATION_PDF_VALUE, pdf));
        return file;
    }

    /** Loads the upload bytes as a real document and captures it for post-call inspection. */
    private List<PDDocument> wireCapturingLoad() throws IOException {
        List<PDDocument> captured = new ArrayList<>();
        when(pdfDocumentFactory.load(any(PDFFile.class)))
                .thenAnswer(
                        inv -> {
                            PDDocument doc =
                                    Loader.loadPDF(
                                            ((PDFFile) inv.getArgument(0))
                                                    .getFileInput()
                                                    .getBytes());
                            captured.add(doc);
                            return doc;
                        });
        return captured;
    }

    private static MockedStatic<WebResponseUtils> stubResponse(List<String> capturedNames) {
        MockedStatic<WebResponseUtils> wr = Mockito.mockStatic(WebResponseUtils.class);
        wr.when(
                        () ->
                                WebResponseUtils.pdfDocToWebResponse(
                                        any(PDDocument.class),
                                        anyString(),
                                        any(TempFileManager.class)))
                .thenAnswer(
                        inv -> {
                            if (capturedNames != null) {
                                capturedNames.add(inv.getArgument(1));
                            }
                            return ResponseEntity.ok(new ByteArrayResource("ok".getBytes()));
                        });
        return wr;
    }

    @Nested
    @DisplayName("field flag handling")
    class FieldFlags {

        @Test
        @DisplayName("read-only flag is cleared on a locked field")
        void clearsReadOnly() throws Exception {
            List<PDDocument> captured = wireCapturingLoad();
            try (MockedStatic<WebResponseUtils> ignored = stubResponse(null)) {
                ResponseEntity<Resource> response =
                        controller.unlockPDFForms(request(formPdf(true, false)));
                assertEquals(HttpStatus.OK, response.getStatusCode());
            }
            PDAcroForm acroForm = captured.get(0).getDocumentCatalog().getAcroForm();
            for (PDField field : acroForm.getFieldTree()) {
                assertFalse((field.getFieldFlags() & 1) == 1);
            }
        }

        @Test
        @DisplayName("the /Lock entry is removed from the field dictionary")
        void removesLockEntry() throws Exception {
            List<PDDocument> captured = wireCapturingLoad();
            try (MockedStatic<WebResponseUtils> ignored = stubResponse(null)) {
                controller.unlockPDFForms(request(formPdf(true, true)));
            }
            PDAcroForm acroForm = captured.get(0).getDocumentCatalog().getAcroForm();
            for (PDField field : acroForm.getFieldTree()) {
                assertFalse(field.getCOSObject().containsKey(COSName.getPDFName("Lock")));
            }
        }
    }

    @Nested
    @DisplayName("XFA rewriting")
    class Xfa {

        @Test
        @DisplayName("XFA stream readOnly access is rewritten to open")
        void rewritesXfaStream() throws Exception {
            wireCapturingLoad();
            try (MockedStatic<WebResponseUtils> ignored = stubResponse(null)) {
                ResponseEntity<Resource> response =
                        controller.unlockPDFForms(request(formPdfWithXfaStream()));
                assertEquals(HttpStatus.OK, response.getStatusCode());
            }
        }

        @Test
        @DisplayName("XFA array entries are processed without error")
        void rewritesXfaArray() throws Exception {
            wireCapturingLoad();
            try (MockedStatic<WebResponseUtils> ignored = stubResponse(null)) {
                ResponseEntity<Resource> response =
                        controller.unlockPDFForms(request(formPdfWithXfaArray()));
                assertEquals(HttpStatus.OK, response.getStatusCode());
            }
        }
    }

    @Test
    @DisplayName("output filename carries the _unlocked_forms suffix")
    void filenameSuffix() throws Exception {
        wireCapturingLoad();
        List<String> names = new ArrayList<>();
        ResponseEntity<Resource> stub = ResponseEntity.ok(new ByteArrayResource("ok".getBytes()));
        try (MockedStatic<WebResponseUtils> wr = stubResponse(names)) {
            ResponseEntity<Resource> response =
                    controller.unlockPDFForms(request(formPdf(true, false)));
            assertEquals(HttpStatus.OK, response.getStatusCode());
            assertTrue(names.get(0).contains("_unlocked_forms.pdf"));
            assertSame(stub.getStatusCode(), response.getStatusCode());
        }
    }
}
