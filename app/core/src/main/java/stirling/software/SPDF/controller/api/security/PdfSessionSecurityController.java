package stirling.software.SPDF.controller.api.security;

import java.io.IOException;
import java.nio.file.Files;
import java.util.List;
import java.util.Map;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.encryption.AccessPermission;
import org.springframework.core.io.Resource;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.multipart.MultipartFile;

import io.swagger.v3.oas.annotations.Operation;

import lombok.RequiredArgsConstructor;

import stirling.software.SPDF.model.api.security.PDFPasswordRequest;
import stirling.software.common.annotations.api.SecurityApi;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.ProcessExecutor;
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;
import stirling.software.common.util.WebResponseUtils;

import tools.jackson.databind.ObjectMapper;

/**
 * Stateless helpers for interactive unlocking. Neither endpoint retains credentials or documents.
 */
@SecurityApi
@RequiredArgsConstructor
public class PdfSessionSecurityController {
    private final CustomPDFDocumentFactory pdfDocumentFactory;
    private final TempFileManager tempFileManager;
    private final ObjectMapper objectMapper;

    /**
     * Passwords are never returned; permissions describe the authenticated access to the original
     * bytes.
     */
    public record SecurityInfo(
            boolean encrypted,
            boolean signed,
            boolean ownerAuthenticated,
            int permissions,
            boolean canModify,
            boolean canAssemble,
            int pageCount) {}

    /** Authenticate without saving, changing metadata, or removing encryption. */
    @Operation(hidden = true)
    @PostMapping(value = "/inspect-pdf-security", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public SecurityInfo inspect(@ModelAttribute PDFPasswordRequest request) throws IOException {
        try (PDDocument document =
                pdfDocumentFactory.load(request.getFileInput(), request.getPassword(), true)) {
            AccessPermission permission = document.getCurrentAccessPermission();
            return new SecurityInfo(
                    document.isEncrypted(),
                    !document.getSignatureDictionaries().isEmpty(),
                    permission.isOwnerPermission(),
                    permission.getPermissionBytes(),
                    permission.canModify(),
                    permission.canAssembleDocument(),
                    document.getNumberOfPages());
        }
    }

    /**
     * Restore the source's encryption, including an unknown second password, before returning a
     * processed PDF.
     */
    @Operation(hidden = true)
    @PostMapping(value = "/restore-pdf-protection", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<Resource> restore(
            @RequestParam MultipartFile fileInput,
            @RequestParam MultipartFile sourceFile,
            @RequestParam String password)
            throws IOException, InterruptedException {
        try (PDDocument source = pdfDocumentFactory.load(sourceFile, password, true)) {
            if (!source.isEncrypted())
                throw new IOException("The protection source is not encrypted");
            if (!source.getSignatureDictionaries().isEmpty())
                throw new IOException("Protection restoration does not support signed source PDFs");
        }

        TempFile output = tempFileManager.createManagedTempFile(".pdf");
        boolean transferred = false;
        try (TempFile input = new TempFile(tempFileManager, ".pdf");
                TempFile source = new TempFile(tempFileManager, ".pdf");
                TempFile job = new TempFile(tempFileManager, ".json")) {
            fileInput.transferTo(input.getFile());
            sourceFile.transferTo(source.getFile());
            // A JSON job keeps passwords (including newlines) out of command arguments and process
            // logs.
            objectMapper.writeValue(
                    job.getFile(),
                    Map.of(
                            "inputFile", input.getAbsolutePath(),
                            "outputFile", output.getAbsolutePath(),
                            "copyEncryption", source.getAbsolutePath(),
                            "encryptionFilePassword", password));
            var result =
                    ProcessExecutor.getInstance(ProcessExecutor.Processes.QPDF)
                            .runCommandWithOutputHandling(
                                    List.of("qpdf", "--job-json-file=" + job.getAbsolutePath()));
            if ((result.getRc() != 0 && result.getRc() != 3) || Files.size(output.getPath()) == 0)
                throw new IOException(
                        "Unable to restore PDF protection; no unprotected result was returned");
            try (var stream = Files.newInputStream(output.getPath());
                    PDDocument protectedDocument =
                            pdfDocumentFactory.load(stream, password, true)) {
                if (!protectedDocument.isEncrypted())
                    throw new IOException("Output protection verification failed");
            }
            var response =
                    WebResponseUtils.pdfFileToWebResponse(output, fileInput.getOriginalFilename());
            transferred = true;
            return response;
        } finally {
            if (!transferred) output.close();
        }
    }
}
