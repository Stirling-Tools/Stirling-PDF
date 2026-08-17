package stirling.software.SPDF.controller.api.misc;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.io.File;
import java.nio.file.Files;
import java.util.List;
import java.util.Optional;

import org.apache.pdfbox.pdmodel.PDDocument;
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
import org.springframework.web.multipart.MultipartFile;

import stirling.software.SPDF.controller.api.converters.ConvertPDFToPDFA;
import stirling.software.SPDF.model.api.misc.AttachmentInfo;
import stirling.software.SPDF.model.api.misc.DeleteAttachmentRequest;
import stirling.software.SPDF.model.api.misc.ExtractAttachmentsRequest;
import stirling.software.SPDF.model.api.misc.ListAttachmentsRequest;
import stirling.software.SPDF.model.api.misc.RenameAttachmentRequest;
import stirling.software.SPDF.service.AttachmentServiceInterface;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;
import stirling.software.common.util.WebResponseUtils;

/**
 * Coverage for the AttachmentController endpoints not exercised by AttachmentControllerTest:
 * extract, list, rename, delete plus their validation paths and the add-attachment validation
 * branches.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
@DisplayName("AttachmentController extract/list/rename/delete")
class AttachmentControllerMoreTest {

    @Mock private CustomPDFDocumentFactory pdfDocumentFactory;
    @Mock private AttachmentServiceInterface pdfAttachmentService;
    @Mock private ConvertPDFToPDFA convertPDFToPDFA;
    @Mock private TempFileManager tempFileManager;

    private AttachmentController controller;

    private PDDocument mockDocument;

    @BeforeEach
    void setUp() throws Exception {
        controller =
                new AttachmentController(
                        pdfDocumentFactory,
                        pdfAttachmentService,
                        convertPDFToPDFA,
                        tempFileManager);
        mockDocument = mock(PDDocument.class);

        when(tempFileManager.createManagedTempFile(anyString()))
                .thenAnswer(
                        inv -> {
                            File f =
                                    Files.createTempFile("att_test", inv.<String>getArgument(0))
                                            .toFile();
                            TempFile tf = mock(TempFile.class);
                            lenient().when(tf.getFile()).thenReturn(f);
                            lenient().when(tf.getPath()).thenReturn(f.toPath());
                            return tf;
                        });
    }

    private static MockMultipartFile pdf() {
        return new MockMultipartFile(
                "fileInput", "doc.pdf", MediaType.APPLICATION_PDF_VALUE, "pdf".getBytes());
    }

    @Nested
    @DisplayName("extractAttachments")
    class Extract {

        @Test
        @DisplayName("writes a zip when attachments are present")
        void extractsToZip() throws Exception {
            ExtractAttachmentsRequest request = new ExtractAttachmentsRequest();
            request.setFileInput(pdf());

            when(pdfDocumentFactory.load(request, true)).thenReturn(mockDocument);
            when(pdfAttachmentService.extractAttachments(mockDocument))
                    .thenReturn(Optional.of("zip-bytes".getBytes()));

            ResponseEntity<Resource> expected =
                    ResponseEntity.ok(new ByteArrayResource("zip-bytes".getBytes()));
            try (MockedStatic<WebResponseUtils> wr = Mockito.mockStatic(WebResponseUtils.class)) {
                wr.when(
                                () ->
                                        WebResponseUtils.zipFileToWebResponse(
                                                any(TempFile.class), anyString()))
                        .thenReturn(expected);

                ResponseEntity<Resource> response = controller.extractAttachments(request);

                assertEquals(HttpStatus.OK, response.getStatusCode());
                verify(pdfAttachmentService).extractAttachments(mockDocument);
            }
        }

        @Test
        @DisplayName("throws when no attachments are found")
        void noAttachmentsThrows() throws Exception {
            ExtractAttachmentsRequest request = new ExtractAttachmentsRequest();
            request.setFileInput(pdf());

            when(pdfDocumentFactory.load(request, true)).thenReturn(mockDocument);
            when(pdfAttachmentService.extractAttachments(mockDocument))
                    .thenReturn(Optional.empty());

            assertThrows(
                    IllegalArgumentException.class, () -> controller.extractAttachments(request));
        }

        @Test
        @DisplayName("uses fileId for the output name when no upload filename is available")
        void usesFileIdForName() throws Exception {
            ExtractAttachmentsRequest request = new ExtractAttachmentsRequest();
            request.setFileId("server-file-id");

            when(pdfDocumentFactory.load(request, true)).thenReturn(mockDocument);
            when(pdfAttachmentService.extractAttachments(mockDocument))
                    .thenReturn(Optional.of("zip".getBytes()));

            ResponseEntity<Resource> expected =
                    ResponseEntity.ok(new ByteArrayResource("zip".getBytes()));
            try (MockedStatic<WebResponseUtils> wr = Mockito.mockStatic(WebResponseUtils.class)) {
                wr.when(
                                () ->
                                        WebResponseUtils.zipFileToWebResponse(
                                                any(TempFile.class), anyString()))
                        .thenReturn(expected);

                ResponseEntity<Resource> response = controller.extractAttachments(request);

                assertEquals(HttpStatus.OK, response.getStatusCode());
            }
        }
    }

    @Nested
    @DisplayName("listAttachments")
    class ListAttachments {

        @Test
        @DisplayName("returns the attachment metadata list")
        void returnsList() throws Exception {
            ListAttachmentsRequest request = new ListAttachmentsRequest();
            request.setFileInput(pdf());

            AttachmentInfo info = new AttachmentInfo();
            when(pdfDocumentFactory.load(request, true)).thenReturn(mockDocument);
            when(pdfAttachmentService.listAttachments(mockDocument)).thenReturn(List.of(info));

            ResponseEntity<List<AttachmentInfo>> response = controller.listAttachments(request);

            assertEquals(HttpStatus.OK, response.getStatusCode());
            assertNotNull(response.getBody());
            assertEquals(1, response.getBody().size());
        }

        @Test
        @DisplayName("returns an empty list when the PDF has no attachments")
        void returnsEmptyList() throws Exception {
            ListAttachmentsRequest request = new ListAttachmentsRequest();
            request.setFileInput(pdf());

            when(pdfDocumentFactory.load(request, true)).thenReturn(mockDocument);
            when(pdfAttachmentService.listAttachments(mockDocument)).thenReturn(List.of());

            ResponseEntity<List<AttachmentInfo>> response = controller.listAttachments(request);

            assertEquals(0, response.getBody().size());
        }
    }

    @Nested
    @DisplayName("renameAttachment")
    class Rename {

        @Test
        @DisplayName("renames and returns the updated PDF")
        void renames() throws Exception {
            RenameAttachmentRequest request = new RenameAttachmentRequest();
            request.setFileInput(pdf());
            request.setAttachmentName("old.txt");
            request.setNewName("new.txt");

            when(pdfDocumentFactory.load(request, false)).thenReturn(mockDocument);
            when(pdfAttachmentService.renameAttachment(mockDocument, "old.txt", "new.txt"))
                    .thenReturn(mockDocument);

            ResponseEntity<Resource> expected =
                    ResponseEntity.ok(new ByteArrayResource("pdf".getBytes()));
            try (MockedStatic<WebResponseUtils> wr = Mockito.mockStatic(WebResponseUtils.class)) {
                wr.when(
                                () ->
                                        WebResponseUtils.pdfDocToWebResponse(
                                                any(PDDocument.class),
                                                anyString(),
                                                any(TempFileManager.class)))
                        .thenReturn(expected);

                ResponseEntity<Resource> response = controller.renameAttachment(request);

                assertEquals(HttpStatus.OK, response.getStatusCode());
                verify(pdfAttachmentService).renameAttachment(mockDocument, "old.txt", "new.txt");
            }
        }

        @Test
        @DisplayName("rejects a blank attachment name")
        void blankAttachmentNameThrows() {
            RenameAttachmentRequest request = new RenameAttachmentRequest();
            request.setFileInput(pdf());
            request.setAttachmentName("  ");
            request.setNewName("new.txt");

            assertThrows(
                    IllegalArgumentException.class, () -> controller.renameAttachment(request));
            verifyNoInteractions(pdfAttachmentService);
        }

        @Test
        @DisplayName("rejects a null new name")
        void nullNewNameThrows() {
            RenameAttachmentRequest request = new RenameAttachmentRequest();
            request.setFileInput(pdf());
            request.setAttachmentName("old.txt");
            request.setNewName(null);

            assertThrows(
                    IllegalArgumentException.class, () -> controller.renameAttachment(request));
        }
    }

    @Nested
    @DisplayName("deleteAttachment")
    class Delete {

        @Test
        @DisplayName("deletes and returns the updated PDF")
        void deletes() throws Exception {
            DeleteAttachmentRequest request = new DeleteAttachmentRequest();
            request.setFileInput(pdf());
            request.setAttachmentName("file.txt");

            when(pdfDocumentFactory.load(request, false)).thenReturn(mockDocument);
            when(pdfAttachmentService.deleteAttachment(mockDocument, "file.txt"))
                    .thenReturn(mockDocument);

            ResponseEntity<Resource> expected =
                    ResponseEntity.ok(new ByteArrayResource("pdf".getBytes()));
            try (MockedStatic<WebResponseUtils> wr = Mockito.mockStatic(WebResponseUtils.class)) {
                wr.when(
                                () ->
                                        WebResponseUtils.pdfDocToWebResponse(
                                                any(PDDocument.class),
                                                anyString(),
                                                any(TempFileManager.class)))
                        .thenReturn(expected);

                ResponseEntity<Resource> response = controller.deleteAttachment(request);

                assertEquals(HttpStatus.OK, response.getStatusCode());
                verify(pdfAttachmentService).deleteAttachment(mockDocument, "file.txt");
            }
        }

        @Test
        @DisplayName("rejects a null attachment name")
        void nullAttachmentNameThrows() {
            DeleteAttachmentRequest request = new DeleteAttachmentRequest();
            request.setFileInput(pdf());
            request.setAttachmentName(null);

            assertThrows(
                    IllegalArgumentException.class, () -> controller.deleteAttachment(request));
            verifyNoInteractions(pdfAttachmentService);
        }
    }

    @Nested
    @DisplayName("addAttachments validation")
    class AddValidation {

        @Test
        @DisplayName("rejects a null attachment list")
        void nullAttachmentsThrows() {
            stirling.software.SPDF.model.api.misc.AddAttachmentRequest request =
                    new stirling.software.SPDF.model.api.misc.AddAttachmentRequest();
            request.setFileInput(pdf());
            request.setAttachments(null);

            assertThrows(IllegalArgumentException.class, () -> controller.addAttachments(request));
        }

        @Test
        @DisplayName("rejects an empty attachment list")
        void emptyAttachmentsThrows() {
            stirling.software.SPDF.model.api.misc.AddAttachmentRequest request =
                    new stirling.software.SPDF.model.api.misc.AddAttachmentRequest();
            request.setFileInput(pdf());
            request.setAttachments(List.of());

            assertThrows(IllegalArgumentException.class, () -> controller.addAttachments(request));
        }

        @Test
        @DisplayName("rejects an empty attachment entry")
        void emptyAttachmentEntryThrows() {
            MultipartFile empty =
                    new MockMultipartFile("attachment", "empty.txt", "text/plain", new byte[0]);
            stirling.software.SPDF.model.api.misc.AddAttachmentRequest request =
                    new stirling.software.SPDF.model.api.misc.AddAttachmentRequest();
            request.setFileInput(pdf());
            request.setAttachments(List.of(empty));

            assertThrows(IllegalArgumentException.class, () -> controller.addAttachments(request));
            verifyNoInteractions(pdfAttachmentService);
        }
    }
}
