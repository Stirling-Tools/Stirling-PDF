package stirling.software.SPDF.controller.api.security;

import java.io.IOException;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.encryption.AccessPermission;
import org.apache.pdfbox.pdmodel.encryption.StandardProtectionPolicy;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import io.github.pixee.security.Filenames;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;

import stirling.software.SPDF.model.api.security.AddPasswordRequest;
import stirling.software.SPDF.model.api.security.PDFPasswordRequest;
import stirling.software.SPDF.service.CustomPDDocumentFactory;
import stirling.software.SPDF.utils.WebResponseUtils;

@RestController
@RequestMapping("/api/v1/security")
@Tag(name = "Security", description = "Security APIs")
public class PasswordController {

    private static final Logger logger = LoggerFactory.getLogger(PasswordController.class);

    private final CustomPDDocumentFactory pdfDocumentFactory;

    @Autowired
    public PasswordController(CustomPDDocumentFactory pdfDocumentFactory) {
        this.pdfDocumentFactory = pdfDocumentFactory;
    }

    @PostMapping(consumes = "multipart/form-data", value = "/remove-password")
    @Operation(
            summary = "Remove password from a PDF file",
            description =
                    "This endpoint removes the password from a protected PDF file. Users need to provide the existing password. Input:PDF Output:PDF Type:SISO")
    public ResponseEntity<byte[]> removePassword(@ModelAttribute PDFPasswordRequest request)
            throws IOException {
        MultipartFile fileInput = request.getFileInput();
        String password = request.getPassword();
        PDDocument document = pdfDocumentFactory.load(fileInput, password);
        document.setAllSecurityToBeRemoved(true);
        return WebResponseUtils.pdfDocToWebResponse(
                document,
                Filenames.toSimpleFileName(fileInput.getOriginalFilename())
                                .replaceFirst("[.][^.]+$", "")
                        + "_password_removed.pdf");
    }

    @PostMapping(consumes = "multipart/form-data", value = "/add-password")
    @Operation(
            summary = "Add password to a PDF file",
            description =
                    "This endpoint adds password protection to a PDF file. Users can specify a set of permissions that should be applied to the file. Input:PDF Output:PDF")
    public ResponseEntity<byte[]> addPassword(@ModelAttribute AddPasswordRequest request)
            throws IOException {
        MultipartFile fileInput = request.getFileInput();
        String ownerPassword = request.getOwnerPassword();
        String password = request.getPassword();
        int keyLength = request.getKeyLength();
        boolean canAssembleDocument = request.isCanAssembleDocument();
        boolean canExtractContent = request.isCanExtractContent();
        boolean canExtractForAccessibility = request.isCanExtractForAccessibility();
        boolean canFillInForm = request.isCanFillInForm();
        boolean canModify = request.isCanModify();
        boolean canModifyAnnotations = request.isCanModifyAnnotations();
        boolean canPrint = request.isCanPrint();
        boolean canPrintFaithful = request.isCanPrintFaithful();

        PDDocument document = pdfDocumentFactory.load(fileInput);
        AccessPermission ap = new AccessPermission();
        ap.setCanAssembleDocument(!canAssembleDocument);
        ap.setCanExtractContent(!canExtractContent);
        ap.setCanExtractForAccessibility(!canExtractForAccessibility);
        ap.setCanFillInForm(!canFillInForm);
        ap.setCanModify(!canModify);
        ap.setCanModifyAnnotations(!canModifyAnnotations);
        ap.setCanPrint(!canPrint);
        ap.setCanPrintFaithful(!canPrintFaithful);
        StandardProtectionPolicy spp = new StandardProtectionPolicy(ownerPassword, password, ap);

        if (!"".equals(ownerPassword) || !"".equals(password)) {
            spp.setEncryptionKeyLength(keyLength);
        }
        spp.setPermissions(ap);
        document.protect(spp);

        if ("".equals(ownerPassword) && "".equals(password))
            return WebResponseUtils.pdfDocToWebResponse(
                    document,
                    Filenames.toSimpleFileName(fileInput.getOriginalFilename())
                                    .replaceFirst("[.][^.]+$", "")
                            + "_permissions.pdf");
        return WebResponseUtils.pdfDocToWebResponse(
                document,
                Filenames.toSimpleFileName(fileInput.getOriginalFilename())
                                .replaceFirst("[.][^.]+$", "")
                        + "_passworded.pdf");
    }
}
