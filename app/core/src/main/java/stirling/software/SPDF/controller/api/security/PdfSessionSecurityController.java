package stirling.software.SPDF.controller.api.security;

import java.io.IOException;
import java.nio.file.Files;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.encryption.AccessPermission;
import org.apache.pdfbox.pdmodel.encryption.InvalidPasswordException;
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
import stirling.software.SPDF.service.PdfPasswordRoles;
import stirling.software.SPDF.service.PdfPermissionSecurityHandler;
import stirling.software.SPDF.service.PdfProtectionService;
import stirling.software.SPDF.service.PdfSessionPermissions;
import stirling.software.common.annotations.api.SecurityApi;
import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;
import stirling.software.common.util.WebResponseUtils;

/** Stateless helpers for interactive unlocking. No endpoint retains credentials or documents. */
@SecurityApi
@RequiredArgsConstructor
public class PdfSessionSecurityController {
    private final CustomPDFDocumentFactory pdfDocumentFactory;
    private final TempFileManager tempFileManager;
    private final PdfProtectionService protectionService;
    private final ApplicationProperties applicationProperties;

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
            String credentialFingerprint,
            boolean requiresOpeningPassword,
            boolean openingAuthenticated,
            boolean hasOwnerPassword,
            boolean honorOwnerPasswords) {}

    /** Authenticate without saving, changing metadata, or removing encryption. */
    @Operation(hidden = true)
    @PostMapping(value = "/inspect-pdf-security", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public SecurityInfo inspect(@ModelAttribute PDFPasswordRequest request) throws IOException {
        String password = request.getPassword() == null ? "" : request.getPassword();
        try (PDDocument document =
                pdfDocumentFactory.load(request.getFileInput(), password, true)) {
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
                    PdfSessionPermissions.credentialFingerprint(document),
                    document.isEncrypted() && requiresOpeningPassword(request.getFileInput()),
                    PdfPasswordRoles.isOpeningPassword(document, password),
                    PdfPasswordRoles.hasSeparateOwnerPassword(document, password),
                    applicationProperties.getSecurity().isHonorOwnerPasswords());
        }
    }

    private boolean requiresOpeningPassword(MultipartFile file) throws IOException {
        try (PDDocument ignored = pdfDocumentFactory.load(file, "", true)) {
            return false;
        } catch (InvalidPasswordException e) {
            return true;
        }
    }

    /**
     * Changes permissions without replacing the opening credential, including when it is unknown.
     */
    @Operation(hidden = true)
    @PostMapping(value = "/change-pdf-permissions", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<Resource> changePermissions(
            @ModelAttribute AddPasswordRequest request,
            @RequestParam(defaultValue = "") String sourcePassword)
            throws IOException {
        try (PDDocument source =
                pdfDocumentFactory.load(request.getFileInput(), sourcePassword, true)) {
            PdfSessionPermissions.requireOwner(
                    source, applicationProperties.getSecurity().isHonorOwnerPasswords());
            if (source.isEncrypted()) {
                if (request.getOwnerPassword() == null || request.getOwnerPassword().isEmpty()) {
                    if (!requestedPermissions(request).isOwnerPermission()
                            && !PdfPasswordRoles.hasSeparateOwnerPassword(source, sourcePassword)) {
                        throw new ResponseStatusException(
                                HttpStatus.BAD_REQUEST,
                                "Choose a separate permissions password to restrict actions");
                    }
                    PdfPermissionSecurityHandler.changePermissions(
                            source, sourcePassword, requestedPermissions(request));
                    return WebResponseUtils.pdfDocToWebResponse(
                            source, "permissions_updated.pdf", tempFileManager);
                }
                String reader = request.getPassword() == null ? "" : request.getPassword();
                if (!PdfPasswordRoles.isOpeningPassword(source, reader)) {
                    if (!PdfPasswordRoles.isOpeningPassword(source, sourcePassword)) {
                        throw new ResponseStatusException(
                                HttpStatus.BAD_REQUEST,
                                "Open the PDF with its opening password before replacing the permissions password");
                    }
                    reader = sourcePassword;
                }
                request.setPassword(reader);
                request.setKeyLength(source.getEncryption().getLength());
            }
        }
        return setProtection(request, sourcePassword);
    }

    /** Nonempty inputs select passwords for removal; session credentials never select removal. */
    @Operation(hidden = true)
    @PostMapping(value = "/remove-pdf-passwords", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<Resource> removePasswords(
            @ModelAttribute PDFPasswordRequest request,
            @RequestParam(defaultValue = "") String ownerPassword,
            @RequestParam(defaultValue = "") String sourcePassword,
            @RequestParam(defaultValue = "") String retainedOpeningPassword)
            throws IOException {
        String openingPassword = request.getPassword() == null ? "" : request.getPassword();
        boolean removeOpening = !openingPassword.isEmpty();
        boolean removeOwner = !ownerPassword.isEmpty();
        if (!removeOpening && !removeOwner) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Enter a password to remove");
        }
        String credential = removeOwner ? ownerPassword : sourcePassword;
        try (PDDocument document =
                pdfDocumentFactory.load(request.getFileInput(), credential, true)) {
            PdfSessionPermissions.requireOwner(document, false);
            boolean openingSet =
                    document.isEncrypted() && requiresOpeningPassword(request.getFileInput());
            boolean ownerSet = PdfPasswordRoles.hasSeparateOwnerPassword(document, credential);
            if (removeOpening
                    && (!openingSet
                            || !PdfPasswordRoles.isOpeningPassword(document, openingPassword))) {
                throw new ResponseStatusException(
                        HttpStatus.BAD_REQUEST, "The opening password is incorrect or is not set");
            }
            if (removeOwner
                    && (!ownerSet || !PdfSessionPermissions.isOwnerAuthenticated(document))) {
                throw new ResponseStatusException(
                        HttpStatus.BAD_REQUEST,
                        "The permissions password is incorrect or is not set");
            }
            if ((!openingSet || removeOpening) && (!ownerSet || removeOwner)) {
                document.setAllSecurityToBeRemoved(true);
            } else if (removeOpening) {
                // Replacing U also changes the owner-password derivation. Verification is needed
                // to retain that credential even when enforcement is disabled by server policy.
                if (!PdfSessionPermissions.isOwnerAuthenticated(document)) {
                    throw new ResponseStatusException(
                            HttpStatus.BAD_REQUEST,
                            "Verify the permissions password to retain it while removing the opening password");
                }
                var protection =
                        new StandardProtectionPolicy(
                                credential,
                                "",
                                new AccessPermission(document.getEncryption().getPermissions()));
                protection.setEncryptionKeyLength(document.getEncryption().getLength());
                protection.setPreferAES(document.getEncryption().getVersion() >= 4);
                document.protect(protection);
            } else {
                if (!PdfPasswordRoles.isOpeningPassword(document, retainedOpeningPassword)) {
                    throw new ResponseStatusException(
                            HttpStatus.BAD_REQUEST,
                            "Open the PDF with its opening password before removing only the permissions password");
                }
                var protection =
                        new StandardProtectionPolicy(
                                "", retainedOpeningPassword, new AccessPermission());
                protection.setEncryptionKeyLength(document.getEncryption().getLength());
                protection.setPreferAES(document.getEncryption().getVersion() >= 4);
                document.protect(protection);
            }
            return WebResponseUtils.pdfDocToWebResponse(
                    document, "password_removed.pdf", tempFileManager);
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
            PdfSessionPermissions.requireOperation(
                    document,
                    endpoint,
                    applicationProperties.getSecurity().isHonorOwnerPasswords());
            document.setAllSecurityToBeRemoved(true);
            return WebResponseUtils.pdfDocToWebResponse(
                    document, request.getFileInput().getOriginalFilename(), tempFileManager);
        }
    }

    /**
     * Retains restrictions and a verified permissions password, or an explicitly chosen
     * replacement.
     */
    @Operation(hidden = true)
    @PostMapping(
            value = "/remove-pdf-opening-password",
            consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<Resource> removeOpeningPassword(
            @ModelAttribute PDFPasswordRequest request,
            @RequestParam(defaultValue = "") String newOwnerPassword)
            throws IOException {
        try (PDDocument document =
                pdfDocumentFactory.load(request.getFileInput(), request.getPassword(), true)) {
            PdfSessionPermissions.requireOwner(
                    document, applicationProperties.getSecurity().isHonorOwnerPasswords());
            if (document.isEncrypted()) {
                String owner =
                        PdfSessionPermissions.isOwnerAuthenticated(document)
                                ? request.getPassword()
                                : newOwnerPassword;
                if (owner.isEmpty()) {
                    throw new ResponseStatusException(
                            HttpStatus.BAD_REQUEST,
                            "Choose a new permissions password to retain restrictions");
                }
                var permissions = new AccessPermission(document.getEncryption().getPermissions());
                var protection = new StandardProtectionPolicy(owner, "", permissions);
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
        var permissions = requestedPermissions(request);
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
            PdfSessionPermissions.requireOwner(
                    document, applicationProperties.getSecurity().isHonorOwnerPasswords());
            var protection = new StandardProtectionPolicy(owner, reader, permissions);
            protection.setEncryptionKeyLength(request.getKeyLength());
            if (document.isEncrypted()
                    && request.getKeyLength() == document.getEncryption().getLength()) {
                protection.setPreferAES(document.getEncryption().getVersion() >= 4);
            }
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

    private AccessPermission requestedPermissions(AddPasswordRequest request) {
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
        return permissions;
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
            protectionService.restore(
                    input.getPath(), source.getPath(), password, output.getPath());
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

    /** Creates an explicitly unprotected copy subject to the server's owner-password policy. */
    @Operation(hidden = true)
    @PostMapping(value = "/remove-pdf-protection", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<Resource> removeProtection(@ModelAttribute PDFPasswordRequest request)
            throws IOException {
        try (PDDocument document =
                pdfDocumentFactory.load(request.getFileInput(), request.getPassword(), true)) {
            PdfSessionPermissions.requireOwner(
                    document, applicationProperties.getSecurity().isHonorOwnerPasswords());
            document.setAllSecurityToBeRemoved(true);
            return WebResponseUtils.pdfDocToWebResponse(
                    document, "unprotected.pdf", tempFileManager);
        }
    }
}
