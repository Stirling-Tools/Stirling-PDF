package stirling.software.SPDF.controller.api.security;

import java.io.IOException;
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
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import io.swagger.v3.oas.annotations.Operation;

import lombok.RequiredArgsConstructor;

import stirling.software.SPDF.config.swagger.StandardPdfResponse;
import stirling.software.SPDF.model.api.security.AddPasswordRequest;
import stirling.software.SPDF.model.api.security.RemovePasswordRequest;
import stirling.software.SPDF.service.PdfPasswordRoles;
import stirling.software.SPDF.service.PdfSessionPermissions;
import stirling.software.common.annotations.AutoJobPostMapping;
import stirling.software.common.annotations.api.SecurityApi;
import stirling.software.common.enumeration.ResourceWeight;
import stirling.software.common.model.tool.ToolArity;
import stirling.software.common.model.tool.ToolFormat;
import stirling.software.common.model.tool.ToolIO;
import stirling.software.common.model.tool.ToolIOCase;
import stirling.software.common.model.tool.ToolIOWhen;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.ExceptionUtils;
import stirling.software.common.util.GeneralUtils;
import stirling.software.common.util.TempFileManager;
import stirling.software.common.util.WebResponseUtils;

@SecurityApi
@RequiredArgsConstructor
public class PasswordController {

    private static final SecureRandom SECURE_RANDOM = new SecureRandom();

    private final CustomPDFDocumentFactory pdfDocumentFactory;
    private final TempFileManager tempFileManager;

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
                            + " which passwords to remove; blank selections retain them. Source and"
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
        try (PDDocument document = pdfDocumentFactory.load(fileInput, credential)) {
            if (selective) {
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
            produces = ToolFormat.PDF_ENCRYPTED,
            cases =
                    @ToolIOCase(
                            when = {
                                @ToolIOWhen(param = "password", matches = ""),
                                @ToolIOWhen(param = "ownerPassword", matches = "")
                            },
                            produces = ToolFormat.PDF,
                            arity = ToolArity.SISO))
    @Operation(
            summary = "Add password to a PDF file",
            description =
                    "This endpoint adds password protection to a PDF file. Users can specify a set"
                            + " of permissions that should be applied to the file.")
    public ResponseEntity<Resource> addPassword(@ModelAttribute AddPasswordRequest request)
            throws IOException {
        MultipartFile fileInput = request.getFileInput();
        String ownerPassword = request.getOwnerPassword();
        String password = request.getPassword();
        int keyLength = request.getKeyLength();
        boolean preventAssembly = Boolean.TRUE.equals(request.getPreventAssembly());
        boolean preventExtractContent = Boolean.TRUE.equals(request.getPreventExtractContent());
        boolean preventExtractForAccessibility =
                Boolean.TRUE.equals(request.getPreventExtractForAccessibility());
        boolean preventFillInForm = Boolean.TRUE.equals(request.getPreventFillInForm());
        boolean preventModify = Boolean.TRUE.equals(request.getPreventModify());
        boolean preventModifyAnnotations =
                Boolean.TRUE.equals(request.getPreventModifyAnnotations());
        boolean preventPrinting = Boolean.TRUE.equals(request.getPreventPrinting());
        boolean preventPrintingFaithful = Boolean.TRUE.equals(request.getPreventPrintingFaithful());

        try (PDDocument document = pdfDocumentFactory.load(fileInput)) {
            AccessPermission ap = new AccessPermission();
            ap.setCanAssembleDocument(!preventAssembly);
            ap.setCanExtractContent(!preventExtractContent);
            ap.setCanExtractForAccessibility(!preventExtractForAccessibility);
            ap.setCanFillInForm(!preventFillInForm);
            ap.setCanModify(!preventModify);
            ap.setCanModifyAnnotations(!preventModifyAnnotations);
            ap.setCanPrint(!preventPrinting);
            ap.setCanPrintFaithful(!preventPrintingFaithful);
            StandardProtectionPolicy spp =
                    new StandardProtectionPolicy(ownerPassword, password, ap);

            if ((ownerPassword != null && !ownerPassword.isEmpty())
                    || (password != null && !password.isEmpty())) {
                spp.setEncryptionKeyLength(keyLength);
            }
            spp.setPermissions(ap);
            document.protect(spp);

            if ((ownerPassword == null || ownerPassword.isEmpty())
                    && (password == null || password.isEmpty()))
                return WebResponseUtils.pdfDocToWebResponse(
                        document,
                        GeneralUtils.generateFilename(
                                fileInput.getOriginalFilename(), "_permissions.pdf"),
                        tempFileManager);
            return WebResponseUtils.pdfDocToWebResponse(
                    document,
                    GeneralUtils.generateFilename(
                            fileInput.getOriginalFilename(), "_passworded.pdf"),
                    tempFileManager);
        }
    }
}
