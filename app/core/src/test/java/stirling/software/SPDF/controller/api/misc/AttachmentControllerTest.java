package stirling.software.SPDF.controller.api.misc;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.*;

import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDDocumentCatalog;
import org.apache.pdfbox.pdmodel.PDDocumentNameDictionary;
import org.apache.pdfbox.pdmodel.PDEmbeddedFilesNameTreeNode;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.common.filespecification.PDComplexFileSpecification;
import org.apache.pdfbox.pdmodel.common.filespecification.PDEmbeddedFile;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.MockedStatic;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.multipart.MultipartFile;

import stirling.software.SPDF.model.api.misc.AddAttachmentRequest;
import stirling.software.SPDF.model.api.misc.DeleteAttachmentRequest;
import stirling.software.SPDF.service.AttachmentServiceInterface;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;
import stirling.software.common.util.WebResponseUtils;

@ExtendWith(MockitoExtension.class)
class AttachmentControllerTest {
    private static ResponseEntity<Resource> streamingOk(byte[] bytes) {
        return ResponseEntity.ok(new ByteArrayResource(bytes));
    }

    @TempDir Path tempDir;

    @Mock private CustomPDFDocumentFactory pdfDocumentFactory;

    @Mock private AttachmentServiceInterface pdfAttachmentService;
    @Mock private TempFileManager tempFileManager;

    @InjectMocks private AttachmentController attachmentController;

    private MockMultipartFile pdfFile;
    private MockMultipartFile attachment1;
    private MockMultipartFile attachment2;
    private AddAttachmentRequest request;
    private PDDocument mockDocument;
    private PDDocument modifiedMockDocument;

    @BeforeEach
    void setUp() throws Exception {
        lenient()
                .when(tempFileManager.createTempFile(anyString()))
                .thenAnswer(
                        inv ->
                                Files.createTempFile(tempDir, "input", inv.<String>getArgument(0))
                                        .toFile());
        lenient()
                .when(tempFileManager.createManagedTempFile(anyString()))
                .thenAnswer(
                        inv -> {
                            File f =
                                    Files.createTempFile(
                                                    tempDir, "managed", inv.<String>getArgument(0))
                                            .toFile();
                            TempFile tf = mock(TempFile.class);
                            lenient().when(tf.getFile()).thenReturn(f);
                            lenient().when(tf.getPath()).thenReturn(f.toPath());
                            return tf;
                        });
        pdfFile =
                new MockMultipartFile(
                        "fileInput",
                        "test.pdf",
                        MediaType.APPLICATION_PDF_VALUE,
                        "PDF content".getBytes());
        attachment1 =
                new MockMultipartFile(
                        "attachment1",
                        "file1.txt",
                        MediaType.TEXT_PLAIN_VALUE,
                        "File 1 content".getBytes());
        attachment2 =
                new MockMultipartFile(
                        "attachment2",
                        "file2.jpg",
                        MediaType.IMAGE_JPEG_VALUE,
                        "Image content".getBytes());
        request = new AddAttachmentRequest();
        mockDocument = mock(PDDocument.class);
        modifiedMockDocument = mock(PDDocument.class);
    }

    @Test
    void addAttachments_Success() throws Exception {
        List<MultipartFile> attachments = List.of(attachment1, attachment2);
        request.setAttachments(attachments);
        request.setFileInput(pdfFile);
        ResponseEntity<Resource> expectedResponse = streamingOk("modified PDF content".getBytes());

        when(pdfDocumentFactory.load(request, false)).thenReturn(mockDocument);
        when(pdfAttachmentService.addAttachment(mockDocument, attachments))
                .thenReturn(mockDocument);

        try (MockedStatic<WebResponseUtils> mockedWebResponseUtils =
                mockStatic(WebResponseUtils.class)) {
            mockedWebResponseUtils
                    .when(
                            () ->
                                    WebResponseUtils.pdfDocToWebResponse(
                                            any(PDDocument.class),
                                            anyString(),
                                            any(TempFileManager.class)))
                    .thenReturn(expectedResponse);

            ResponseEntity<Resource> response = attachmentController.addAttachments(request);

            assertNotNull(response);
            assertEquals(HttpStatus.OK, response.getStatusCode());
            assertNotNull(response.getBody());
            verify(pdfDocumentFactory).load(request, false);
            verify(pdfAttachmentService).addAttachment(mockDocument, attachments);
        }
    }

    @Test
    void addAttachments_SingleAttachment() throws Exception {
        List<MultipartFile> attachments = List.of(attachment1);
        request.setAttachments(attachments);
        request.setFileInput(pdfFile);
        ResponseEntity<Resource> expectedResponse = streamingOk("modified PDF content".getBytes());

        when(pdfDocumentFactory.load(request, false)).thenReturn(mockDocument);
        when(pdfAttachmentService.addAttachment(mockDocument, attachments))
                .thenReturn(mockDocument);

        try (MockedStatic<WebResponseUtils> mockedWebResponseUtils =
                mockStatic(WebResponseUtils.class)) {
            mockedWebResponseUtils
                    .when(
                            () ->
                                    WebResponseUtils.pdfDocToWebResponse(
                                            any(PDDocument.class),
                                            anyString(),
                                            any(TempFileManager.class)))
                    .thenReturn(expectedResponse);

            ResponseEntity<Resource> response = attachmentController.addAttachments(request);

            assertNotNull(response);
            assertEquals(HttpStatus.OK, response.getStatusCode());
            assertNotNull(response.getBody());
            verify(pdfDocumentFactory).load(request, false);
            verify(pdfAttachmentService).addAttachment(mockDocument, attachments);
        }
    }

    @Test
    void addAttachments_IOExceptionFromPDFLoad() throws Exception {
        List<MultipartFile> attachments = List.of(attachment1);
        request.setAttachments(attachments);
        request.setFileInput(pdfFile);
        IOException ioException = new IOException("Failed to load PDF");

        when(pdfDocumentFactory.load(request, false)).thenThrow(ioException);

        assertThrows(IOException.class, () -> attachmentController.addAttachments(request));
        verify(pdfDocumentFactory).load(request, false);
        verifyNoInteractions(pdfAttachmentService);
    }

    @Test
    void addAttachments_IOExceptionFromAttachmentService() throws Exception {
        List<MultipartFile> attachments = List.of(attachment1);
        request.setAttachments(attachments);
        request.setFileInput(pdfFile);
        IOException ioException = new IOException("Failed to add attachment");

        when(pdfDocumentFactory.load(request, false)).thenReturn(mockDocument);
        when(pdfAttachmentService.addAttachment(mockDocument, attachments)).thenThrow(ioException);

        assertThrows(IOException.class, () -> attachmentController.addAttachments(request));
        verify(pdfAttachmentService).addAttachment(mockDocument, attachments);
    }

    // Build a PDF with one embedded attachment using PDFBox so JPDFium can read it back.
    private byte[] buildPdfWithAttachment(String attachmentName, byte[] attachmentBytes)
            throws IOException {
        Path path = tempDir.resolve("with-attachment.pdf");
        try (PDDocument doc = new PDDocument()) {
            doc.addPage(new PDPage(PDRectangle.LETTER));

            PDComplexFileSpecification spec = new PDComplexFileSpecification();
            spec.setFile(attachmentName);
            spec.setFileUnicode(attachmentName);

            PDEmbeddedFile embedded =
                    new PDEmbeddedFile(doc, new ByteArrayInputStream(attachmentBytes));
            embedded.setSize(attachmentBytes.length);
            spec.setEmbeddedFile(embedded);
            spec.setEmbeddedFileUnicode(embedded);

            PDDocumentCatalog catalog = doc.getDocumentCatalog();
            PDDocumentNameDictionary names = new PDDocumentNameDictionary(catalog);
            PDEmbeddedFilesNameTreeNode tree = new PDEmbeddedFilesNameTreeNode();
            tree.setNames(java.util.Map.of(attachmentName, spec));
            names.setEmbeddedFiles(tree);
            catalog.setNames(names);

            doc.save(path.toFile());
        }
        return Files.readAllBytes(path);
    }

    private int countAttachmentsInPdf(byte[] pdfBytes) throws IOException {
        try (PDDocument doc = Loader.loadPDF(pdfBytes)) {
            PDDocumentCatalog catalog = doc.getDocumentCatalog();
            if (catalog == null || catalog.getNames() == null) {
                return 0;
            }
            PDEmbeddedFilesNameTreeNode tree = catalog.getNames().getEmbeddedFiles();
            if (tree == null || tree.getNames() == null) {
                return 0;
            }
            return tree.getNames().size();
        }
    }

    @Test
    void deleteAttachment_removesNamedAttachment() throws Exception {
        byte[] pdfBytes = buildPdfWithAttachment("to_delete.txt", "payload".getBytes());
        assertEquals(1, countAttachmentsInPdf(pdfBytes));

        MockMultipartFile input =
                new MockMultipartFile(
                        "fileInput", "doc.pdf", MediaType.APPLICATION_PDF_VALUE, pdfBytes);
        DeleteAttachmentRequest req = new DeleteAttachmentRequest();
        req.setFileInput(input);
        req.setAttachmentName("to_delete.txt");

        ResponseEntity<Resource> response = attachmentController.deleteAttachment(req);
        assertNotNull(response);
        assertEquals(HttpStatus.OK, response.getStatusCode());

        try (InputStream in = response.getBody().getInputStream()) {
            byte[] outBytes = in.readAllBytes();
            assertThat(countAttachmentsInPdf(outBytes)).isZero();
        }
    }

    @Test
    void deleteAttachment_missingName_throws() {
        DeleteAttachmentRequest req = new DeleteAttachmentRequest();
        req.setFileInput(pdfFile);
        req.setAttachmentName("");

        assertThrows(
                IllegalArgumentException.class, () -> attachmentController.deleteAttachment(req));
    }

    @Test
    void deleteAttachment_notFound_throws() throws Exception {
        byte[] pdfBytes = buildPdfWithAttachment("present.txt", "stuff".getBytes());
        MockMultipartFile input =
                new MockMultipartFile(
                        "fileInput", "doc.pdf", MediaType.APPLICATION_PDF_VALUE, pdfBytes);
        DeleteAttachmentRequest req = new DeleteAttachmentRequest();
        req.setFileInput(input);
        req.setAttachmentName("does_not_exist.txt");

        assertThrows(
                IllegalArgumentException.class, () -> attachmentController.deleteAttachment(req));
    }
}
