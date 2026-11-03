package stirling.software.SPDF.controller.api.security;

import java.io.IOException;
import java.nio.file.Files;
import java.security.SecureRandom;
import java.util.HexFormat;

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

import stirling.software.SPDF.config.swagger.StandardPdfResponse;
import stirling.software.SPDF.model.api.security.AddPasswordRequest;
import stirling.software.SPDF.model.api.security.PDFPasswordRequest;
import stirling.software.SPDF.model.api.security.RemovePasswordRequest;
import stirling.software.SPDF.service.PdfPasswordRoles;
import stirling.software.SPDF.service.PdfPermissionSecurityHandler;
import stirling.software.SPDF.service.PdfSessionPermissions;
import stirling.software.common.annotations.AutoJobPostMapping;
import stirling.software.common.annotations.api.SecurityApi;
import stirling.software.common.enumeration.ResourceWeight;
import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.model.tool.ToolArity;
import stirling.software.common.model.tool.ToolFormat;
import stirling.software.common.model.tool.ToolIO;
import stirling.software.common.model.tool.ToolIOCase;
import stirling.software.common.model.tool.ToolIOWhen;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.ExceptionUtils;
import stirling.software.common.util.GeneralUtils;
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;
import stirling.software.common.util.WebResponseUtils;
import stirling.software.jpdfium.doc.PdfSecurity;
import stirling.software.jpdfium.exception.JPDFiumException;

/**
 * Owns password and permission changes, plus preparation and restoration for protected tool inputs.
 * Documents and credentials live only for the request.
 */
@SecurityApi
@RequiredArgsConstructor
public class PasswordController {

    private static final SecureRandom SECURE_RANDOM = new SecureRandom();

    private final CustomPDFDocumentFactory pdfDocumentFactory;
    private final TempFileManager tempFileManager;
    private final ApplicationProperties applicationProperties;

    @AutoJobPostMapping(
            consumes = MediaType.MULTIPART_FORM_DATA_VALUE,
            value = "/remove-password",
            resourceWeight = ResourceWeight.MEDIUM_WEIGHT)
    @StandardPdfResponse
    @ToolIO(
            accepts = {ToolFormat.PDF, ToolFormat.PDF_ENCRYPTED},
            produces = ToolFormat.PDF,
            cases =
                    @ToolIOCase(
                            when = @ToolIOWhen(param = "password", matches = ""),
                            produces = ToolFormat.ANY,
                            arity = ToolArity.SISO))
    @Operation(
            summary = "Remove password from a PDF file",
            description =
                    "This endpoint removes the password from a protected PDF file while preserving"
                            + " its document permissions. Users need to provide the existing"
                            + " password. Optional ownerPassword, sourcePassword or retainedOpeningPassword"
                            + " enable selective removal: nonempty password and ownerPassword select"
                            + " which passwords to remove; blank selections retain them. removeAll explicitly removes all protection, subject to the owner-password policy. Source and"
                            + " retained credentials never select removal.")
    public ResponseEntity<Resource> removePassword(@ModelAttribute RemovePasswordRequest request)
            throws IOException {
        MultipartFile fileInput = request.getFileInput();
        String password = request.getPassword();

        boolean selective =
                request.getOwnerPassword() != null
                        || request.getSourcePassword() != null
                        || request.getRetainedOpeningPassword() != null;
        String credential = password;
        if (selective) {
            credential = request.getOwnerPassword();
            if (credential == null || credential.isEmpty()) {
                credential = request.getSourcePassword();
                if (credential == null) credential = password;
            }
            if (credential == null) credential = "";
        }
        if (request.isRemoveAll()) {
            credential =
                    request.getSourcePassword() == null ? password : request.getSourcePassword();
            if (credential == null) credential = "";
        }
        try (PDDocument document =
                request.isRemoveAll()
                        ? pdfDocumentFactory.load(fileInput, credential, true)
                        : pdfDocumentFactory.load(fileInput, credential)) {
            if (request.isRemoveAll()) {
                PdfSessionPermissions.requireOwner(
                        document, applicationProperties.getSecurity().isHonorOwnerPasswords());
                document.setAllSecurityToBeRemoved(true);
            } else if (selective) {
                removeSelectedPasswords(document, request, credential);
            } else {
                document.setAllSecurityToBeRemoved(true);
                if (document.isEncrypted()) {
                    // Owner-password access reports all permissions, so read the stored flags.
                    AccessPermission permissions =
                            new AccessPermission(document.getEncryption().getPermissions());
                    if (!permissions.isOwnerPermission()) {
                        // An empty owner password would grant unrestricted access on opening.
                        byte[] ownerPasswordBytes = new byte[32];
                        SECURE_RANDOM.nextBytes(ownerPasswordBytes);
                        StandardProtectionPolicy protection =
                                new StandardProtectionPolicy(
                                        HexFormat.of().formatHex(ownerPasswordBytes),
                                        "",
                                        permissions);
                        protection.setEncryptionKeyLength(256);
                        document.setAllSecurityToBeRemoved(false);
                        document.protect(protection);
                    }
                }
            }
            return WebResponseUtils.pdfDocToWebResponse(
                    document,
                    GeneralUtils.generateFilename(
                            fileInput.getOriginalFilename(), "_password_removed.pdf"),
                    tempFileManager);
        } catch (IOException e) {
            // Handle password errors specifically
            if (ExceptionUtils.isPasswordError(e)) {
                throw ExceptionUtils.createPdfPasswordException(e);
            }
            ExceptionUtils.logException("password removal", e);
            throw ExceptionUtils.handlePdfException(e);
        }
    }

    private void removeSelectedPasswords(
            PDDocument document, RemovePasswordRequest request, String credential)
            throws IOException {
        String openingPassword = request.getPassword() == null ? "" : request.getPassword();
        String ownerPassword = request.getOwnerPassword() == null ? "" : request.getOwnerPassword();
        String retainedOpeningPassword =
                request.getRetainedOpeningPassword() == null
                        ? ""
                        : request.getRetainedOpeningPassword();
        boolean removeOpening = !openingPassword.isEmpty();
        boolean removeOwner = !ownerPassword.isEmpty();
        if (!removeOpening && !removeOwner) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Enter a password to remove");
        }
        PdfSessionPermissions.requireOwner(document, false);
        boolean openingSet =
                document.isEncrypted() && !PdfPasswordRoles.isOpeningPassword(document, "");
        boolean ownerSet = PdfPasswordRoles.hasSeparateOwnerPassword(document, credential);
        if (removeOpening
                && (!openingSet
                        || !PdfPasswordRoles.isOpeningPassword(document, openingPassword))) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST, "The opening password is incorrect or is not set");
        }
        if (removeOwner && (!ownerSet || !PdfSessionPermissions.isOwnerAuthenticated(document))) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST, "The permissions password is incorrect or is not set");
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
    }

    @AutoJobPostMapping(
            consumes = MediaType.MULTIPART_FORM_DATA_VALUE,
            value = "/add-password",
            resourceWeight = ResourceWeight.MEDIUM_WEIGHT)
    @StandardPdfResponse
    @ToolIO(
            accepts = {ToolFormat.PDF, ToolFormat.PDF_ENCRYPTED},
            produces = ToolFormat.PDF_ENCRYPTED,
            cases =
                    @ToolIOCase(
                            when = {
                                @ToolIOWhen(param = "password", matches = ""),
                                @ToolIOWhen(param = "ownerPassword", matches = ""),
                                @ToolIOWhen(param = "preserveExisting", matches = "false")
                            },
                            produces = ToolFormat.PDF,
                            arity = ToolArity.SISO))
    @Operation(
            summary = "Add password to a PDF file",
            description =
                    "This endpoint adds password protection to a PDF file. Users can specify a set"
                            + " of permissions that should be applied to the file. sourcePassword authenticates an existing protected source; preserveExisting changes permissions while retaining existing credentials. Omitting these options preserves the existing add-password behaviour.")
    public ResponseEntity<Resource> addPassword(@ModelAttribute AddPasswordRequest request)
            throws IOException {
        boolean explicitProtection =
                request.getSourcePassword() != null || request.isPreserveExisting();
        try (PDDocument document =
                pdfDocumentFactory.load(
                        request.getFileInput(),
                        request.getSourcePassword() == null ? "" : request.getSourcePassword(),
                        true)) {
            if (explicitProtection || document.isEncrypted()) {
                PdfSessionPermissions.requireOwner(
                        document, applicationProperties.getSecurity().isHonorOwnerPasswords());
            }
            var permissions = requestedPermissions(request);
            if (request.isPreserveExisting() && document.isEncrypted()) {
                String credential =
                        request.getSourcePassword() == null ? "" : request.getSourcePassword();
                if (request.getOwnerPassword() == null || request.getOwnerPassword().isEmpty()) {
                    if (!permissions.isOwnerPermission()
                            && !PdfPasswordRoles.hasSeparateOwnerPassword(document, credential)) {
                        throw new ResponseStatusException(
                                HttpStatus.BAD_REQUEST,
                                "Choose a separate permissions password to restrict actions");
                    }
                    PdfPermissionSecurityHandler.changePermissions(
                            document, credential, permissions);
                    return WebResponseUtils.pdfDocToWebResponse(
                            document,
                            GeneralUtils.generateFilename(
                                    request.getFileInput().getOriginalFilename(),
                                    "_permissions.pdf"),
                            tempFileManager);
                }
                String reader = request.getPassword() == null ? "" : request.getPassword();
                if (!PdfPasswordRoles.isOpeningPassword(document, reader)) {
                    if (!PdfPasswordRoles.isOpeningPassword(document, credential)) {
                        throw new ResponseStatusException(
                                HttpStatus.BAD_REQUEST,
                                "Open the PDF with its opening password before replacing the permissions password");
                    }
                    reader = credential;
                }
                request.setPassword(reader);
                request.setKeyLength(document.getEncryption().getLength());
            }
            return applyProtection(document, request, permissions, explicitProtection);
        }
    }

    private ResponseEntity<Resource> applyProtection(
            PDDocument document,
            AddPasswordRequest request,
            AccessPermission permissions,
            boolean validate)
            throws IOException {
        String owner = request.getOwnerPassword() == null ? "" : request.getOwnerPassword();
        String reader = request.getPassword() == null ? "" : request.getPassword();
        if (validate) {
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
        }
        var protection = new StandardProtectionPolicy(owner, reader, permissions);
        if (!owner.isEmpty() || !reader.isEmpty())
            protection.setEncryptionKeyLength(request.getKeyLength());
        if (validate
                && document.isEncrypted()
                && request.getKeyLength() == document.getEncryption().getLength()) {
            protection.setPreferAES(document.getEncryption().getVersion() >= 4);
        }
        document.protect(protection);
        String suffix =
                owner.isEmpty() && reader.isEmpty() ? "_permissions.pdf" : "_passworded.pdf";
        String filename =
                GeneralUtils.generateFilename(request.getFileInput().getOriginalFilename(), suffix);
        if (!validate || permissions.isOwnerPermission()) {
            return WebResponseUtils.pdfDocToWebResponse(document, filename, tempFileManager);
        }
        var output = tempFileManager.createManagedTempFile(".pdf");
        try {
            document.save(output.getFile());
            // PDF password encoding/truncation can collapse distinct credentials into the same
            // role.
            try (var stream = Files.newInputStream(output.getPath());
                    var result = pdfDocumentFactory.load(stream, reader, true)) {
                if (PdfSessionPermissions.isOwnerAuthenticated(result)) {
                    throw new ResponseStatusException(
                            HttpStatus.BAD_REQUEST,
                            "The opening and permissions passwords must remain distinct after PDF encoding");
                }
            }
            return WebResponseUtils.pdfFileToWebResponse(output, filename);
        } catch (IOException | RuntimeException e) {
            output.close();
            throw e;
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
