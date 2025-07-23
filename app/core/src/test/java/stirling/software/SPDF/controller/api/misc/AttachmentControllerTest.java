package stirling.software.SPDF.controller.api.misc;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;


import java.io.IOException;
import java.util.List;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.MockedStatic;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.multipart.MultipartFile;

import stirling.software.SPDF.model.api.misc.AddAttachmentRequest;
import stirling.software.SPDF.service.AttachmentServiceInterface;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.WebResponseUtils;


@ExtendWith(MockitoExtension.class)
@DisplayName("AttachmentController Tests")
class AttachmentControllerTest {

    @Mock
    private CustomPDFDocumentFactory pdfDocumentFactory;

    @Mock
    private AttachmentServiceInterface pdfAttachmentService;

    @InjectMocks
    private AttachmentController attachmentController;

    private MockMultipartFile pdfFile;
    private MockMultipartFile attachment1;
    private MockMultipartFile attachment2;
    private AddAttachmentRequest request;
    private PDDocument mockDocument;
    private PDDocument modifiedMockDocument;

    @BeforeEach
    void setUp() {
        pdfFile = new MockMultipartFile("fileInput", "test.pdf", "application/pdf", "PDF content".getBytes());
        attachment1 = new MockMultipartFile("attachment1", "file1.txt", "text/plain", "File 1 content".getBytes());
        attachment2 = new MockMultipartFile("attachment2", "file2.jpg", "image/jpeg", "Image content".getBytes());
        request = new AddAttachmentRequest();
        mockDocument = mock(PDDocument.class);
        modifiedMockDocument = mock(PDDocument.class);
    }

    @Nested
    @DisplayName("Success Tests for Adding Attachments")
    class SuccessTests {

        @Test
        @DisplayName("Successfully adds multiple attachments to PDF")
        void addAttachments_Success_MultipleAttachments() throws IOException {
            // Arrange
            List<MultipartFile> attachments = List.of(attachment1, attachment2);
            request.setAttachments(attachments);
            request.setFileInput(pdfFile);
            ResponseEntity<byte[]> expectedResponse = ResponseEntity.ok("modified PDF content".getBytes());

            when(pdfDocumentFactory.load(pdfFile, false)).thenReturn(mockDocument);
            when(pdfAttachmentService.addAttachment(mockDocument, attachments)).thenReturn(modifiedMockDocument);

            try (MockedStatic<WebResponseUtils> mockedWebResponseUtils = mockStatic(WebResponseUtils.class)) {
                mockedWebResponseUtils.when(() -> WebResponseUtils.pdfDocToWebResponse(eq(modifiedMockDocument), eq("test_with_attachments.pdf")))
                    .thenReturn(expectedResponse);

                // Act
                ResponseEntity<byte[]> response = attachmentController.addAttachments(request);

                // Assert
                assertNotNull(response, "Response should not be null");
                assertEquals(HttpStatus.OK, response.getStatusCode(), "Status code should be OK");
                assertNotNull(response.getBody(), "Response body should not be null");
                verify(pdfDocumentFactory).load(pdfFile, false);
                verify(pdfAttachmentService).addAttachment(mockDocument, attachments);
            }
        }

        @Test
        @DisplayName("Successfully adds a single attachment to PDF")
        void addAttachments_Success_SingleAttachment() throws IOException {
            // Arrange
            List<MultipartFile> attachments = List.of(attachment1);
            request.setAttachments(attachments);
            request.setFileInput(pdfFile);
            ResponseEntity<byte[]> expectedResponse = ResponseEntity.ok("modified PDF content".getBytes());

            when(pdfDocumentFactory.load(pdfFile, false)).thenReturn(mockDocument);
            when(pdfAttachmentService.addAttachment(mockDocument, attachments)).thenReturn(modifiedMockDocument);

            try (MockedStatic<WebResponseUtils> mockedWebResponseUtils = mockStatic(WebResponseUtils.class)) {
                mockedWebResponseUtils.when(() -> WebResponseUtils.pdfDocToWebResponse(eq(modifiedMockDocument), eq("test_with_attachments.pdf")))
                    .thenReturn(expectedResponse);

                // Act
                ResponseEntity<byte[]> response = attachmentController.addAttachments(request);

                // Assert
                assertNotNull(response, "Response should not be null");
                assertEquals(HttpStatus.OK, response.getStatusCode(), "Status code should be OK");
                assertNotNull(response.getBody(), "Response body should not be null");
                verify(pdfDocumentFactory).load(pdfFile, false);
                verify(pdfAttachmentService).addAttachment(mockDocument, attachments);
            }
        }
    }

    @Nested
    @DisplayName("Error Tests for Adding Attachments")
    class ErrorTests {

        @Test
        @DisplayName("Throws IOException when PDF loading fails")
        void addAttachments_IOExceptionFromPDFLoad() throws IOException {
            // Arrange
            List<MultipartFile> attachments = List.of(attachment1);
            request.setAttachments(attachments);
            request.setFileInput(pdfFile);
            IOException ioException = new IOException("Failed to load PDF");

            when(pdfDocumentFactory.load(pdfFile, false)).thenThrow(ioException);

            // Act & Assert
            assertThrows(IOException.class, () -> attachmentController.addAttachments(request),
                "Should throw IOException when PDF loading fails");
            verify(pdfDocumentFactory).load(pdfFile, false);
            verifyNoInteractions(pdfAttachmentService);
        }

        @Test
        @DisplayName("Throws IOException when attachment service fails")
        void addAttachments_IOExceptionFromAttachmentService() throws IOException {
            // Arrange
            List<MultipartFile> attachments = List.of(attachment1);
            request.setAttachments(attachments);
            request.setFileInput(pdfFile);
            IOException ioException = new IOException("Failed to add attachment");

            when(pdfDocumentFactory.load(pdfFile, false)).thenReturn(mockDocument);
            when(pdfAttachmentService.addAttachment(mockDocument, attachments)).thenThrow(ioException);

            // Act & Assert
            assertThrows(IOException.class, () -> attachmentController.addAttachments(request));
            verify(pdfAttachmentService).addAttachment(mockDocument, attachments);
        }
    }
}
