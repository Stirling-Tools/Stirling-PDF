package stirling.software.SPDF.controller.api.security;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.awt.Color;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.util.List;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.PDResources;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.interactive.annotation.PDAnnotationText;
import org.apache.pdfbox.pdmodel.interactive.annotation.PDAnnotationWidget;
import org.apache.pdfbox.pdmodel.interactive.annotation.PDAppearanceDictionary;
import org.apache.pdfbox.pdmodel.interactive.annotation.PDAppearanceStream;
import org.apache.pdfbox.pdmodel.interactive.digitalsignature.PDSignature;
import org.apache.pdfbox.pdmodel.interactive.form.PDAcroForm;
import org.apache.pdfbox.pdmodel.interactive.form.PDNonTerminalField;
import org.apache.pdfbox.pdmodel.interactive.form.PDSignatureField;
import org.apache.pdfbox.pdmodel.interactive.form.PDTextField;
import org.apache.pdfbox.rendering.PDFRenderer;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.request.MockMultipartHttpServletRequestBuilder;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.multipart.MultipartFile;

import stirling.software.SPDF.model.api.security.RemoveCertSignRequest;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;

@DisplayName("RemoveCertSignController Tests")
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class RemoveCertSignControllerTest {
    private static ResponseEntity<Resource> streamingOk(byte[] bytes) {
        return ResponseEntity.ok(new ByteArrayResource(bytes));
    }

    private static byte[] drainBody(ResponseEntity<Resource> response) throws java.io.IOException {
        java.io.ByteArrayOutputStream baos = new java.io.ByteArrayOutputStream();
        try (java.io.InputStream __in = response.getBody().getInputStream()) {
            __in.transferTo(baos);
        }
        return baos.toByteArray();
    }

    @Mock private CustomPDFDocumentFactory pdfDocumentFactory;
    @Mock private TempFileManager tempFileManager;

    @InjectMocks private RemoveCertSignController removeCertSignController;

    private byte[] simplePdfBytes;

    @ParameterizedTest
    @NullSource
    @ValueSource(strings = {"false", "true"})
    @DisplayName(
            "Multipart option removes certificate fields and optionally their rendered artwork")
    void removesVisibleSignaturesOnlyWhenRequested(String option) throws Exception {
        byte[] input = createVisibleSignaturesPdf();
        when(pdfDocumentFactory.load(any(MultipartFile.class)))
                .thenAnswer(inv -> Loader.loadPDF(input));
        MockMultipartHttpServletRequestBuilder request =
                multipart("/api/v1/security/remove-cert-sign")
                        .file(
                                new MockMultipartFile(
                                        "fileInput", "signed.pdf", "application/pdf", input));
        if (option != null) {
            request.param("removeVisibleSignature", option);
        }
        byte[] output =
                MockMvcBuilders.standaloneSetup(removeCertSignController)
                        .build()
                        .perform(request)
                        .andExpect(status().isOk())
                        .andReturn()
                        .getResponse()
                        .getContentAsByteArray();

        boolean removeVisible = Boolean.parseBoolean(option);
        try (PDDocument original = Loader.loadPDF(input);
                PDDocument expectedDocument = Loader.loadPDF(input);
                PDDocument result = Loader.loadPDF(output)) {
            assertEquals(3, result.getNumberOfPages());
            assertTrue(result.getSignatureFields().isEmpty());
            assertTrue(result.getSignatureDictionaries().isEmpty());
            PDAcroForm form = result.getDocumentCatalog().getAcroForm();
            assertEquals("keep me", form.getField("group.notes").getValueAsString());
            if (removeVisible) {
                for (PDSignatureField signature : expectedDocument.getSignatureFields()) {
                    for (PDAnnotationWidget widget : signature.getWidgets()) {
                        widget.getCOSObject().removeItem(COSName.AP);
                    }
                }
            }

            PDFRenderer originalRenderer = new PDFRenderer(original);
            PDFRenderer expectedRenderer = new PDFRenderer(expectedDocument);
            PDFRenderer resultRenderer = new PDFRenderer(result);
            for (int pageIndex = 0; pageIndex < 3; pageIndex++) {
                BufferedImage before = originalRenderer.renderImage(pageIndex);
                assertEquals(Color.RED.getRGB(), before.getRGB(60, 140));
                BufferedImage expected = expectedRenderer.renderImage(pageIndex);
                BufferedImage actual = resultRenderer.renderImage(pageIndex);
                assertEquals(
                        (removeVisible ? Color.GREEN : Color.RED).getRGB(), actual.getRGB(60, 140));
                assertArrayEquals(
                        expected.getRGB(0, 0, 200, 200, null, 0, 200),
                        actual.getRGB(0, 0, 200, 200, null, 0, 200),
                        "Page content and unrelated annotations must be preserved");
                assertEquals(
                        pageIndex == 0 ? 2 : 1, result.getPage(pageIndex).getAnnotations().size());
                assertEquals(
                        "Keep this note",
                        result.getPage(pageIndex).getAnnotations().getFirst().getContents());
            }
        }
    }

    @Test
    void removesInvisibleSignatureWithoutAffectingUnsignedPages() throws Exception {
        byte[] input;
        try (PDDocument document = Loader.loadPDF(simplePdfBytes)) {
            PDAcroForm form = new PDAcroForm(document);
            document.getDocumentCatalog().setAcroForm(form);
            PDSignatureField signature = new PDSignatureField(form);
            signature.setValue(new PDSignature());
            form.getFields().add(signature);
            ByteArrayOutputStream bytes = new ByteArrayOutputStream();
            document.save(bytes);
            input = bytes.toByteArray();
        }
        when(pdfDocumentFactory.load(any(MultipartFile.class)))
                .thenAnswer(inv -> Loader.loadPDF(input));
        RemoveCertSignRequest request = new RemoveCertSignRequest();
        request.setFileInput(
                new MockMultipartFile("fileInput", "signed.pdf", "application/pdf", input));
        request.setRemoveVisibleSignature(true);
        try (PDDocument result =
                Loader.loadPDF(drainBody(removeCertSignController.removeCertSignPDF(request)))) {
            assertTrue(result.getSignatureFields().isEmpty());
            assertEquals(1, result.getNumberOfPages());
            assertTrue(result.getPage(0).getAnnotations().isEmpty());
        }
    }

    private byte[] createVisibleSignaturesPdf() throws Exception {
        try (PDDocument document = new PDDocument()) {
            PDAcroForm form = new PDAcroForm(document);
            document.getDocumentCatalog().setAcroForm(form);
            for (int i = 0; i < 3; i++) {
                PDPage page = new PDPage(new PDRectangle(200, 200));
                document.addPage(page);
                try (PDPageContentStream content = new PDPageContentStream(document, page)) {
                    content.setNonStrokingColor(Color.GREEN);
                    content.addRect(40, 40, 120, 50);
                    content.fill();
                }
                PDAnnotationText note = new PDAnnotationText();
                note.setContents("Keep this note");
                note.setRectangle(new PDRectangle(160, 160, 20, 20));
                page.getAnnotations().add(note);
            }
            PDSignatureField rootSignature = new PDSignatureField(form);
            rootSignature.setPartialName("signature");
            rootSignature.setValue(new PDSignature());
            form.getFields().add(rootSignature);
            addVisibleWidget(document, rootSignature.getWidgets().getFirst(), 0, true);

            PDNonTerminalField group = new PDNonTerminalField(form);
            group.setPartialName("group");
            form.getFields().add(group);
            PDSignatureField nestedSignature = new PDSignatureField(form);
            nestedSignature.setPartialName("nestedSignature");
            nestedSignature.setValue(new PDSignature());
            PDAnnotationWidget firstWidget = new PDAnnotationWidget();
            PDAnnotationWidget secondWidget = new PDAnnotationWidget();
            nestedSignature.setWidgets(List.of(firstWidget, secondWidget));
            firstWidget.setParent(nestedSignature);
            secondWidget.setParent(nestedSignature);
            addVisibleWidget(document, firstWidget, 1, true);
            addVisibleWidget(document, secondWidget, 2, false);
            PDTextField notes = new PDTextField(form);
            notes.setPartialName("notes");
            notes.getCOSObject().setString(COSName.V, "keep me");
            addVisibleWidget(document, notes.getWidgets().getFirst(), 0, true);
            notes.getWidgets().getFirst().setRectangle(new PDRectangle(50, 110, 100, 30));
            group.setChildren(List.of(nestedSignature, notes));
            nestedSignature.getCOSObject().setItem(COSName.PARENT, group);
            notes.getCOSObject().setItem(COSName.PARENT, group);
            ByteArrayOutputStream bytes = new ByteArrayOutputStream();
            document.save(bytes);
            return bytes.toByteArray();
        }
    }

    private void addVisibleWidget(
            PDDocument document, PDAnnotationWidget widget, int pageIndex, boolean setPage)
            throws IOException {
        PDPage page = document.getPage(pageIndex);
        widget.setRectangle(new PDRectangle(50, 50, 100, 30));
        if (setPage) {
            widget.setPage(page);
        }
        PDAppearanceStream appearance = new PDAppearanceStream(document);
        appearance.setBBox(new PDRectangle(100, 30));
        appearance.setResources(new PDResources());
        try (PDPageContentStream content = new PDPageContentStream(document, appearance)) {
            content.setNonStrokingColor(Color.RED);
            content.addRect(0, 0, 100, 30);
            content.fill();
        }
        PDAppearanceDictionary appearances = new PDAppearanceDictionary();
        appearances.setNormalAppearance(appearance);
        widget.setAppearance(appearances);
        page.getAnnotations().add(widget);
    }

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
        try (PDDocument doc = new PDDocument()) {
            doc.addPage(new PDPage());
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            doc.save(baos);
            simplePdfBytes = baos.toByteArray();
        }
    }

    @Nested
    @DisplayName("Remove Certificate Signature Tests")
    class RemoveCertSignTests {

        @Test
        @DisplayName("Should process PDF without signatures")
        void testRemoveCertSign_NoSignatures() throws Exception {
            MockMultipartFile pdfFile =
                    new MockMultipartFile(
                            "fileInput",
                            "test.pdf",
                            MediaType.APPLICATION_PDF_VALUE,
                            simplePdfBytes);

            RemoveCertSignRequest request = new RemoveCertSignRequest();
            request.setFileInput(pdfFile);

            when(pdfDocumentFactory.load(any(MultipartFile.class)))
                    .thenAnswer(inv -> Loader.loadPDF(simplePdfBytes));

            ResponseEntity<Resource> response = removeCertSignController.removeCertSignPDF(request);

            assertNotNull(response.getBody());
            assertTrue(drainBody(response).length > 0);
            assertEquals(HttpStatus.OK, response.getStatusCode());
        }

        @Test
        @DisplayName("Should process PDF with no AcroForm")
        void testRemoveCertSign_NoAcroForm() throws Exception {
            MockMultipartFile pdfFile =
                    new MockMultipartFile(
                            "fileInput",
                            "test.pdf",
                            MediaType.APPLICATION_PDF_VALUE,
                            simplePdfBytes);

            RemoveCertSignRequest request = new RemoveCertSignRequest();
            request.setFileInput(pdfFile);

            when(pdfDocumentFactory.load(any(MultipartFile.class)))
                    .thenAnswer(inv -> Loader.loadPDF(simplePdfBytes));

            ResponseEntity<Resource> response = removeCertSignController.removeCertSignPDF(request);

            assertNotNull(response.getBody());
        }

        @Test
        @DisplayName("Should process PDF with AcroForm but no signature fields")
        void testRemoveCertSign_AcroFormNoSignatures() throws Exception {
            byte[] pdfWithAcroForm;
            try (PDDocument doc = new PDDocument()) {
                doc.addPage(new PDPage());
                PDAcroForm acroForm = new PDAcroForm(doc);
                doc.getDocumentCatalog().setAcroForm(acroForm);
                ByteArrayOutputStream baos = new ByteArrayOutputStream();
                doc.save(baos);
                pdfWithAcroForm = baos.toByteArray();
            }

            MockMultipartFile pdfFile =
                    new MockMultipartFile(
                            "fileInput",
                            "test.pdf",
                            MediaType.APPLICATION_PDF_VALUE,
                            pdfWithAcroForm);

            RemoveCertSignRequest request = new RemoveCertSignRequest();
            request.setFileInput(pdfFile);

            when(pdfDocumentFactory.load(any(MultipartFile.class)))
                    .thenAnswer(inv -> Loader.loadPDF(pdfWithAcroForm));

            ResponseEntity<Resource> response = removeCertSignController.removeCertSignPDF(request);
            assertNotNull(response.getBody());
        }

        @Test
        @DisplayName("Should handle PDF with signature field in AcroForm")
        void testRemoveCertSign_WithSignatureField() throws Exception {
            byte[] pdfWithSig;
            try (PDDocument doc = new PDDocument()) {
                PDPage page = new PDPage();
                doc.addPage(page);
                PDAcroForm acroForm = new PDAcroForm(doc);
                doc.getDocumentCatalog().setAcroForm(acroForm);
                PDSignatureField sigField = new PDSignatureField(acroForm);
                acroForm.getFields().add(sigField);
                ByteArrayOutputStream baos = new ByteArrayOutputStream();
                doc.save(baos);
                pdfWithSig = baos.toByteArray();
            }

            MockMultipartFile pdfFile =
                    new MockMultipartFile(
                            "fileInput", "test.pdf", MediaType.APPLICATION_PDF_VALUE, pdfWithSig);

            RemoveCertSignRequest request = new RemoveCertSignRequest();
            request.setFileInput(pdfFile);

            when(pdfDocumentFactory.load(any(MultipartFile.class)))
                    .thenAnswer(inv -> Loader.loadPDF(pdfWithSig));

            ResponseEntity<Resource> response = removeCertSignController.removeCertSignPDF(request);
            assertNotNull(response.getBody());
        }

        @Test
        @DisplayName("Should produce correct filename suffix")
        void testRemoveCertSign_FilenameSuffix() throws Exception {
            MockMultipartFile pdfFile =
                    new MockMultipartFile(
                            "fileInput",
                            "signed_doc.pdf",
                            MediaType.APPLICATION_PDF_VALUE,
                            simplePdfBytes);

            RemoveCertSignRequest request = new RemoveCertSignRequest();
            request.setFileInput(pdfFile);

            when(pdfDocumentFactory.load(any(MultipartFile.class)))
                    .thenAnswer(inv -> Loader.loadPDF(simplePdfBytes));

            ResponseEntity<Resource> response = removeCertSignController.removeCertSignPDF(request);
            assertNotNull(response);
            assertEquals(HttpStatus.OK, response.getStatusCode());
        }

        @Test
        @DisplayName("Should handle null original filename")
        void testRemoveCertSign_NullFilename() throws Exception {
            MockMultipartFile pdfFile =
                    new MockMultipartFile(
                            "fileInput", null, MediaType.APPLICATION_PDF_VALUE, simplePdfBytes);

            RemoveCertSignRequest request = new RemoveCertSignRequest();
            request.setFileInput(pdfFile);

            when(pdfDocumentFactory.load(any(MultipartFile.class)))
                    .thenAnswer(inv -> Loader.loadPDF(simplePdfBytes));

            ResponseEntity<Resource> response = removeCertSignController.removeCertSignPDF(request);
            assertNotNull(response.getBody());
        }

        @Test
        @DisplayName("Should handle multi-page PDF")
        void testRemoveCertSign_MultiPage() throws Exception {
            byte[] multiPagePdf;
            try (PDDocument doc = new PDDocument()) {
                doc.addPage(new PDPage());
                doc.addPage(new PDPage());
                doc.addPage(new PDPage());
                ByteArrayOutputStream baos = new ByteArrayOutputStream();
                doc.save(baos);
                multiPagePdf = baos.toByteArray();
            }

            MockMultipartFile pdfFile =
                    new MockMultipartFile(
                            "fileInput",
                            "multi.pdf",
                            MediaType.APPLICATION_PDF_VALUE,
                            multiPagePdf);

            RemoveCertSignRequest request = new RemoveCertSignRequest();
            request.setFileInput(pdfFile);

            when(pdfDocumentFactory.load(any(MultipartFile.class)))
                    .thenAnswer(inv -> Loader.loadPDF(multiPagePdf));

            ResponseEntity<Resource> response = removeCertSignController.removeCertSignPDF(request);
            assertNotNull(response.getBody());
        }

        @Test
        @DisplayName("Should handle IOException from factory")
        void testRemoveCertSign_IOException() throws Exception {
            MockMultipartFile pdfFile =
                    new MockMultipartFile(
                            "fileInput",
                            "test.pdf",
                            MediaType.APPLICATION_PDF_VALUE,
                            simplePdfBytes);

            RemoveCertSignRequest request = new RemoveCertSignRequest();
            request.setFileInput(pdfFile);

            when(pdfDocumentFactory.load(any(MultipartFile.class)))
                    .thenThrow(new IOException("Cannot load PDF"));

            assertThrows(
                    Exception.class, () -> removeCertSignController.removeCertSignPDF(request));
        }
    }
}
