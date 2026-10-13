package stirling.software.SPDF.controller.api.security;

import java.io.IOException;
import java.nio.file.Files;
import java.util.List;
import java.util.Map;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.encryption.AccessPermission;
import org.apache.pdfbox.pdmodel.encryption.StandardProtectionPolicy;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import io.swagger.v3.oas.annotations.Operation;

import lombok.RequiredArgsConstructor;

import stirling.software.SPDF.model.api.security.AddPasswordRequest;
import stirling.software.SPDF.model.api.security.PDFPasswordRequest;
import stirling.software.SPDF.service.PdfSessionPermissions;
import stirling.software.common.annotations.api.SecurityApi;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.ProcessExecutor;
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;
import stirling.software.common.util.WebResponseUtils;

import tools.jackson.databind.ObjectMapper;

/** Stateless helpers for interactive unlocking. No endpoint retains credentials or documents. */
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
            int encryptionKeyLength,
            int encryptionRevision,
            boolean canModify,
            boolean canAssemble,
            int pageCount,
            boolean canExtract,
            boolean canPrint,
            boolean canPrintFaithful,
            String credentialFingerprint) {}

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
                    PdfSessionPermissions.isOwnerAuthenticated(document),
                    document.isEncrypted()
                            ? document.getEncryption().getPermissions()
                            : permission.getPermissionBytes(),
                    document.isEncrypted() ? document.getEncryption().getLength() : 0,
                    document.isEncrypted() ? document.getEncryption().getRevision() : 0,
                    permission.canModify(),
                    permission.canAssembleDocument(),
                    document.getNumberOfPages(),
                    permission.canExtractContent(),
                    permission.canPrint(),
                    permission.canPrintFaithful(),
                    PdfSessionPermissions.credentialFingerprint(document));
        }
    }

    /**
     * Working bytes may only be used transiently for the authorised operation, never as an export.
     */
    @Operation(hidden = true)
    @PostMapping(value = "/prepare-pdf-session", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<Resource> prepare(
            @ModelAttribute PDFPasswordRequest request, @RequestParam String endpoint)
            throws IOException {
        try (PDDocument document =
                pdfDocumentFactory.load(request.getFileInput(), request.getPassword(), true)) {
            PdfSessionPermissions.requireOperation(document, endpoint);
            document.setAllSecurityToBeRemoved(true);
            return WebResponseUtils.pdfDocToWebResponse(
                    document, request.getFileInput().getOriginalFilename(), tempFileManager);
        }
    }

    /**
     * Removes the opening password with owner authority, retaining a known permissions password.
     */
    @Operation(hidden = true)
    @PostMapping(
            value = "/remove-pdf-opening-password",
            consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<Resource> removeOpeningPassword(
            @ModelAttribute PDFPasswordRequest request) throws IOException {
        try (PDDocument document =
                pdfDocumentFactory.load(request.getFileInput(), request.getPassword(), true)) {
            PdfSessionPermissions.requireOwner(document);
            if (document.isEncrypted()) {
                var permissions = new AccessPermission(document.getEncryption().getPermissions());
                var protection =
                        new StandardProtectionPolicy(request.getPassword(), "", permissions);
                protection.setEncryptionKeyLength(document.getEncryption().getLength());
                protection.setPreferAES(document.getEncryption().getVersion() >= 4);
                document.protect(protection);
            }
            return WebResponseUtils.pdfDocToWebResponse(
                    document, "opening_password_removed.pdf", tempFileManager);
        }
    }

    /**
     * Replaces protection deliberately; source authentication is separate from the new credentials.
     */
    @Operation(hidden = true)
    @PostMapping(value = "/set-pdf-protection", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<Resource> setProtection(
            @ModelAttribute AddPasswordRequest request,
            @RequestParam(defaultValue = "") String sourcePassword)
            throws IOException {
        var permissions = new AccessPermission();
        permissions.setCanAssembleDocument(!Boolean.TRUE.equals(request.getPreventAssembly()));
        permissions.setCanExtractContent(!Boolean.TRUE.equals(request.getPreventExtractContent()));
        permissions.setCanExtractForAccessibility(
                !Boolean.TRUE.equals(request.getPreventExtractForAccessibility()));
        permissions.setCanFillInForm(!Boolean.TRUE.equals(request.getPreventFillInForm()));
        permissions.setCanModify(!Boolean.TRUE.equals(request.getPreventModify()));
        permissions.setCanModifyAnnotations(
                !Boolean.TRUE.equals(request.getPreventModifyAnnotations()));
        permissions.setCanPrint(!Boolean.TRUE.equals(request.getPreventPrinting()));
        permissions.setCanPrintFaithful(!Boolean.TRUE.equals(request.getPreventPrintingFaithful()));
        String owner = request.getOwnerPassword() == null ? "" : request.getOwnerPassword();
        String reader = request.getPassword() == null ? "" : request.getPassword();
        if (!permissions.isOwnerPermission() && (owner.isEmpty() || owner.equals(reader))) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Restrictions require a nonempty permissions password different from the opening password");
        }
        if (owner.isEmpty() && reader.isEmpty()) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST, "Enter a password for the new protection");
        }
        if (request.getKeyLength() != 40
                && request.getKeyLength() != 128
                && request.getKeyLength() != 256) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST, "Unsupported encryption key length");
        }
        try (PDDocument document =
                pdfDocumentFactory.load(request.getFileInput(), sourcePassword, true)) {
            PdfSessionPermissions.requireOwner(document);
            var protection = new StandardProtectionPolicy(owner, reader, permissions);
            protection.setEncryptionKeyLength(request.getKeyLength());
            document.protect(protection);
            var output = tempFileManager.createManagedTempFile(".pdf");
            try {
                document.save(output.getFile());
                // PDF password encoding/truncation can make different strings authenticate as
                // the same credential. Check the actual result before presenting restrictions.
                if (!permissions.isOwnerPermission()) {
                    try (var stream = Files.newInputStream(output.getFile().toPath());
                            var result = pdfDocumentFactory.load(stream, reader, true)) {
                        if (PdfSessionPermissions.isOwnerAuthenticated(result)) {
                            throw new ResponseStatusException(
                                    HttpStatus.BAD_REQUEST,
                                    "The opening and permissions passwords must remain distinct after PDF encoding");
                        }
                    }
                }
                return WebResponseUtils.pdfFileToWebResponse(output, "protected.pdf");
            } catch (IOException | RuntimeException e) {
                output.close();
                throw e;
            }
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

    /** Creates an explicitly unprotected copy only after verifying owner authority. */
    @Operation(hidden = true)
    @PostMapping(value = "/remove-pdf-protection", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<Resource> removeProtection(@ModelAttribute PDFPasswordRequest request)
            throws IOException {
        try (PDDocument document =
                pdfDocumentFactory.load(request.getFileInput(), request.getPassword(), true)) {
            PdfSessionPermissions.requireOwner(document);
            document.setAllSecurityToBeRemoved(true);
            return WebResponseUtils.pdfDocToWebResponse(
                    document, "unprotected.pdf", tempFileManager);
        }
    }
}
