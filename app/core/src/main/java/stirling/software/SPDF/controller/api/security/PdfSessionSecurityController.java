package stirling.software.SPDF.controller.api.security;

import java.io.IOException;
import java.nio.file.Files;

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
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;
import stirling.software.common.util.WebResponseUtils;
import stirling.software.jpdfium.doc.PdfSecurity;
import stirling.software.jpdfium.exception.JPDFiumException;

/**
 * Stateless helpers for interactive unlocking. Neither endpoint retains credentials or documents.
 */
@SecurityApi
@RequiredArgsConstructor
public class PdfSessionSecurityController {
    private final CustomPDFDocumentFactory pdfDocumentFactory;
    private final TempFileManager tempFileManager;

    /**
     * Passwords are never returned; permissions describe the authenticated access to the original
     * bytes.
     */
    public record SecurityInfo(
            boolean encrypted,
            boolean signed,
            boolean ownerAuthenticated,
            int permissions,
            int encryptionKeyLength,
            int encryptionRevision,
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
                    document.isEncrypted()
                            ? document.getEncryption().getPermissions()
                            : permission.getPermissionBytes(),
                    document.isEncrypted() ? document.getEncryption().getLength() : 0,
                    document.isEncrypted() ? document.getEncryption().getRevision() : 0,
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
            throws IOException {
        int sourcePermissions;
        int sourceKeyLength;
        int sourceRevision;
        try (PDDocument source = pdfDocumentFactory.load(sourceFile, password, true)) {
            if (!source.isEncrypted())
                throw new IOException("The protection source is not encrypted");
            if (!source.getSignatureDictionaries().isEmpty())
                throw new IOException("Protection restoration does not support signed source PDFs");
            // Effective owner access is unrestricted even when the encryption dictionary is not.
            sourcePermissions = source.getEncryption().getPermissions();
            sourceKeyLength = source.getEncryption().getLength();
            sourceRevision = source.getEncryption().getRevision();
        }

        TempFile output = tempFileManager.createManagedTempFile(".pdf");
        boolean transferred = false;
        try (TempFile input = new TempFile(tempFileManager, ".pdf");
                TempFile source = new TempFile(tempFileManager, ".pdf")) {
            fileInput.transferTo(input.getFile());
            sourceFile.transferTo(source.getFile());
            try {
                PdfSecurity.copyEncryption(
                        input.getPath(), output.getPath(), source.getPath(), password);
            } catch (JPDFiumException e) {
                throw new IOException("Unable to restore PDF protection", e);
            }
            try (var stream = Files.newInputStream(output.getPath());
                    PDDocument protectedDocument =
                            pdfDocumentFactory.load(stream, password, true)) {
                if (!protectedDocument.isEncrypted()
                        || protectedDocument.getEncryption().getPermissions() != sourcePermissions
                        || protectedDocument.getEncryption().getLength() != sourceKeyLength
                        || protectedDocument.getEncryption().getRevision() != sourceRevision)
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
