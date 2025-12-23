package stirling.software.SPDF.controller.api.misc;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import java.io.IOException;
import java.util.List;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.MockedStatic;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.multipart.MultipartFile;

import stirling.software.SPDF.model.api.misc.AddAttachmentRequest;
import stirling.software.SPDF.service.AttachmentServiceInterface;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.WebResponseUtils;

@ExtendWith(MockitoExtension.class)
class AttachmentControllerTest {

    @Mock private CustomPDFDocumentFactory pdfDocumentFactory;

    @Mock private AttachmentServiceInterface pdfAttachmentService;

    @InjectMocks private AttachmentController attachmentController;

    private MockMultipartFile pdfFile;
    private MockMultipartFile attachment1;
    private MockMultipartFile attachment2;
    private AddAttachmentRequest request;
    private PDDocument mockDocument;
    private PDDocument modifiedMockDocument;

    @BeforeEach
    void setUp() {
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
        ResponseEntity<byte[]> expectedResponse =
                ResponseEntity.ok("modified PDF content".getBytes());

        when(pdfDocumentFactory.load(request, false)).thenReturn(mockDocument);
        when(pdfAttachmentService.addAttachment(mockDocument, attachments))
                .thenReturn(mockDocument);

        try (MockedStatic<WebResponseUtils> mockedWebResponseUtils =
                mockStatic(WebResponseUtils.class)) {
            mockedWebResponseUtils
                    .when(
                            () ->
                                    WebResponseUtils.pdfDocToWebResponse(
                                            eq(mockDocument), eq("test_with_attachments.pdf")))
                    .thenReturn(expectedResponse);

            ResponseEntity<byte[]> response = attachmentController.addAttachments(request);

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
        ResponseEntity<byte[]> expectedResponse =
                ResponseEntity.ok("modified PDF content".getBytes());

        when(pdfDocumentFactory.load(request, false)).thenReturn(mockDocument);
        when(pdfAttachmentService.addAttachment(mockDocument, attachments))
                .thenReturn(mockDocument);

        try (MockedStatic<WebResponseUtils> mockedWebResponseUtils =
                mockStatic(WebResponseUtils.class)) {
            mockedWebResponseUtils
                    .when(
                            () ->
                                    WebResponseUtils.pdfDocToWebResponse(
                                            eq(mockDocument), eq("test_with_attachments.pdf")))
                    .thenReturn(expectedResponse);

            ResponseEntity<byte[]> response = attachmentController.addAttachments(request);

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
}
