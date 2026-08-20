package stirling.software.SPDF.controller.api.misc;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.util.List;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.jboss.resteasy.reactive.multipart.FileUpload;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.MockedStatic;
import org.mockito.junit.jupiter.MockitoExtension;

import jakarta.ws.rs.core.Response;

import stirling.software.SPDF.controller.api.converters.ConvertPDFToPDFA;
import stirling.software.SPDF.model.api.misc.AddAttachmentRequest;
import stirling.software.SPDF.service.AttachmentServiceInterface;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.testsupport.TestFileUploads;
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;
import stirling.software.common.util.WebResponseUtils;

@ExtendWith(MockitoExtension.class)
class AttachmentControllerTest {

    private static Response streamingOk(byte[] bytes) {
        return Response.ok(bytes).build();
    }

    @Mock private CustomPDFDocumentFactory pdfDocumentFactory;

    @Mock private AttachmentServiceInterface pdfAttachmentService;
    @Mock private ConvertPDFToPDFA convertPDFToPDFA;
    @Mock private TempFileManager tempFileManager;

    @InjectMocks private AttachmentController attachmentController;

    private FileUpload pdfFile;
    private FileUpload attachment1;
    private FileUpload attachment2;
    private PDDocument mockDocument;

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
        pdfFile = TestFileUploads.of("PDF content".getBytes(), "test.pdf", "application/pdf");
        attachment1 = TestFileUploads.of("File 1 content".getBytes(), "file1.txt", "text/plain");
        attachment2 = TestFileUploads.of("Image content".getBytes(), "file2.jpg", "image/jpeg");
        mockDocument = mock(PDDocument.class);
    }

    @Test
    void addAttachments_Success() throws Exception {
        List<FileUpload> attachments = List.of(attachment1, attachment2);
        Response expectedResponse = streamingOk("modified PDF content".getBytes());

        when(pdfDocumentFactory.load(any(AddAttachmentRequest.class), eq(false)))
                .thenReturn(mockDocument);
        when(pdfAttachmentService.addAttachment(eq(mockDocument), anyList()))
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

            Response response =
                    attachmentController.addAttachments(pdfFile, null, attachments, false);

            assertNotNull(response);
            assertEquals(200, response.getStatus());
            assertNotNull(response.getEntity());
            verify(pdfDocumentFactory).load(any(AddAttachmentRequest.class), eq(false));
            verify(pdfAttachmentService).addAttachment(eq(mockDocument), anyList());
        }
    }

    @Test
    void addAttachments_SingleAttachment() throws Exception {
        List<FileUpload> attachments = List.of(attachment1);
        Response expectedResponse = streamingOk("modified PDF content".getBytes());

        when(pdfDocumentFactory.load(any(AddAttachmentRequest.class), eq(false)))
                .thenReturn(mockDocument);
        when(pdfAttachmentService.addAttachment(eq(mockDocument), anyList()))
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

            Response response =
                    attachmentController.addAttachments(pdfFile, null, attachments, false);

            assertNotNull(response);
            assertEquals(200, response.getStatus());
            assertNotNull(response.getEntity());
            verify(pdfDocumentFactory).load(any(AddAttachmentRequest.class), eq(false));
            verify(pdfAttachmentService).addAttachment(eq(mockDocument), anyList());
        }
    }

    @Test
    void addAttachments_IOExceptionFromPDFLoad() throws Exception {
        List<FileUpload> attachments = List.of(attachment1);
        IOException ioException = new IOException("Failed to load PDF");

        when(pdfDocumentFactory.load(any(AddAttachmentRequest.class), eq(false)))
                .thenThrow(ioException);

        assertThrows(
                IOException.class,
                () -> attachmentController.addAttachments(pdfFile, null, attachments, false));
        verify(pdfDocumentFactory).load(any(AddAttachmentRequest.class), eq(false));
        verifyNoInteractions(pdfAttachmentService);
    }

    @Test
    void addAttachments_IOExceptionFromAttachmentService() throws Exception {
        List<FileUpload> attachments = List.of(attachment1);
        IOException ioException = new IOException("Failed to add attachment");

        when(pdfDocumentFactory.load(any(AddAttachmentRequest.class), eq(false)))
                .thenReturn(mockDocument);
        when(pdfAttachmentService.addAttachment(eq(mockDocument), anyList()))
                .thenThrow(ioException);

        assertThrows(
                IOException.class,
                () -> attachmentController.addAttachments(pdfFile, null, attachments, false));
        verify(pdfAttachmentService).addAttachment(eq(mockDocument), anyList());
    }
}
