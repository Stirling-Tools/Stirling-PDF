package stirling.software.SPDF.controller.api.misc;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.stream.Stream;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.encryption.AccessPermission;
import org.apache.pdfbox.pdmodel.encryption.StandardProtectionPolicy;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Named;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.MethodSource;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.server.ResponseStatusException;

import stirling.software.SPDF.controller.api.converters.ConvertPDFToPDFA;
import stirling.software.SPDF.model.api.misc.AddAttachmentRequest;
import stirling.software.SPDF.model.api.misc.AttachmentInfo;
import stirling.software.SPDF.model.api.misc.BatchAttachmentRequest;
import stirling.software.SPDF.model.api.misc.DeleteAttachmentRequest;
import stirling.software.SPDF.model.api.misc.ExtractAttachmentsRequest;
import stirling.software.SPDF.model.api.misc.ExtractSingleAttachmentRequest;
import stirling.software.SPDF.model.api.misc.ListAttachmentsRequest;
import stirling.software.SPDF.model.api.misc.RenameAttachmentRequest;
import stirling.software.SPDF.service.AttachmentService;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.service.PdfMetadataService;
import stirling.software.common.util.ExceptionUtils;
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;

import tools.jackson.databind.json.JsonMapper;

class AttachmentControllerProtectedPdfTest {

    @FunctionalInterface
    interface AttachmentCall {
        Object call(AttachmentController controller, MockMultipartFile pdf) throws Exception;
    }

    @TempDir Path directory;

    private TempFileManager tempFiles;
    private AttachmentController controller;

    @BeforeEach
    void setUp() throws IOException {
        tempFiles = mock(TempFileManager.class);
        when(tempFiles.createTempFile(anyString()))
                .thenAnswer(
                        inv ->
                                Files.createTempFile(directory, "attachments-", inv.getArgument(0))
                                        .toFile());
        when(tempFiles.createManagedTempFile(anyString()))
                .thenAnswer(inv -> new TempFile(tempFiles, inv.getArgument(0)));
        controller =
                new AttachmentController(
                        new CustomPDFDocumentFactory(mock(PdfMetadataService.class)),
                        new AttachmentService(),
                        mock(ConvertPDFToPDFA.class),
                        tempFiles,
                        JsonMapper.builder().build());
    }

    private static MockMultipartFile pdf(StandardProtectionPolicy protection) throws IOException {
        try (PDDocument document = new PDDocument();
                ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            document.addPage(new PDPage());
            if (protection != null) {
                protection.setEncryptionKeyLength(256);
                document.protect(protection);
            }
            document.save(output);
            return new MockMultipartFile(
                    "fileInput",
                    "report.pdf",
                    MediaType.APPLICATION_PDF_VALUE,
                    output.toByteArray());
        }
    }

    private static MockMultipartFile ownerPasswordOnlyPdf() throws IOException {
        AccessPermission permissions = new AccessPermission();
        permissions.setCanModify(false);
        return pdf(new StandardProtectionPolicy("owner secret", "", permissions));
    }

    private static MockMultipartFile note() {
        return new MockMultipartFile(
                "attachments", "notes.txt", MediaType.TEXT_PLAIN_VALUE, "notes".getBytes());
    }

    static Stream<Named<AttachmentCall>> endpoints() {
        return Stream.of(
                Named.of(
                        "add-attachments",
                        (controller, pdf) -> {
                            AddAttachmentRequest request = new AddAttachmentRequest();
                            request.setFileInput(pdf);
                            request.setAttachments(List.of(note()));
                            return controller.addAttachments(request);
                        }),
                Named.of(
                        "add-attachments as PDF/A-3b",
                        (controller, pdf) -> {
                            AddAttachmentRequest request = new AddAttachmentRequest();
                            request.setFileInput(pdf);
                            request.setAttachments(List.of(note()));
                            request.setConvertToPdfA3b(true);
                            return controller.addAttachments(request);
                        }),
                Named.of(
                        "batch-process-attachments",
                        (controller, pdf) -> {
                            BatchAttachmentRequest request = new BatchAttachmentRequest();
                            request.setFileInput(pdf);
                            request.setAttachments(List.of(note()));
                            return controller.batchProcessAttachments(request);
                        }),
                Named.of(
                        "rename-attachment",
                        (controller, pdf) -> {
                            RenameAttachmentRequest request = new RenameAttachmentRequest();
                            request.setFileInput(pdf);
                            request.setAttachmentName("payload.bin");
                            request.setNewName("renamed.bin");
                            return controller.renameAttachment(request);
                        }),
                Named.of(
                        "delete-attachment",
                        (controller, pdf) -> {
                            DeleteAttachmentRequest request = new DeleteAttachmentRequest();
                            request.setFileInput(pdf);
                            request.setAttachmentName("payload.bin");
                            return controller.deleteAttachment(request);
                        }),
                Named.of(
                        "list-attachments",
                        (controller, pdf) -> {
                            ListAttachmentsRequest request = new ListAttachmentsRequest();
                            request.setFileInput(pdf);
                            return controller.listAttachments(request);
                        }),
                Named.of(
                        "extract-attachments",
                        (controller, pdf) -> {
                            ExtractAttachmentsRequest request = new ExtractAttachmentsRequest();
                            request.setFileInput(pdf);
                            return controller.extractAttachments(request);
                        }),
                Named.of(
                        "extract-single-attachment",
                        (controller, pdf) -> {
                            ExtractSingleAttachmentRequest request =
                                    new ExtractSingleAttachmentRequest();
                            request.setFileInput(pdf);
                            request.setAttachmentName("payload.bin");
                            return controller.extractSingleAttachment(request);
                        }));
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("endpoints")
    void refusesAPdfProtectedOnlyByAPermissionsPassword(AttachmentCall endpoint) throws Exception {
        MockMultipartFile restricted = ownerPasswordOnlyPdf();

        ResponseStatusException refused =
                assertThrows(
                        ResponseStatusException.class, () -> endpoint.call(controller, restricted));

        assertEquals(HttpStatus.BAD_REQUEST, refused.getStatusCode());
        assertEquals(
                "This tool doesn't support encrypted PDFs. Remove the password first.",
                refused.getReason());
        verify(tempFiles, never()).createManagedTempFile(anyString());
    }

    @Test
    void refusesAPdfThatNeedsAnOpeningPassword() throws Exception {
        BatchAttachmentRequest request = new BatchAttachmentRequest();
        request.setFileInput(
                pdf(
                        new StandardProtectionPolicy(
                                "owner secret", "reader secret", new AccessPermission())));
        request.setAttachments(List.of(note()));

        assertThrows(
                ExceptionUtils.PdfPasswordException.class,
                () -> controller.batchProcessAttachments(request));
        verify(tempFiles, never()).createManagedTempFile(anyString());
    }

    @Test
    void stillAddsAttachmentsToAnUnprotectedPdf() throws Exception {
        BatchAttachmentRequest request = new BatchAttachmentRequest();
        request.setFileInput(pdf(null));
        request.setAttachments(List.of(note()));

        ResponseEntity<Resource> response = controller.batchProcessAttachments(request);

        try (InputStream body = response.getBody().getInputStream();
                PDDocument output = Loader.loadPDF(body.readAllBytes())) {
            assertEquals(
                    List.of("notes.txt"),
                    new AttachmentService()
                            .listAttachments(output).stream()
                                    .map(AttachmentInfo::getFilename)
                                    .toList());
        }
    }
}
