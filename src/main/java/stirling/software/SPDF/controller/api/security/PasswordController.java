package stirling.software.SPDF.controller.api.security;

import java.io.IOException;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.encryption.AccessPermission;
import org.apache.pdfbox.pdmodel.encryption.StandardProtectionPolicy;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import io.github.pixee.security.Filenames;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;

import lombok.RequiredArgsConstructor;

import stirling.software.SPDF.model.api.security.AddPasswordRequest;
import stirling.software.SPDF.model.api.security.PDFPasswordRequest;
import stirling.software.SPDF.service.CustomPDFDocumentFactory;
import stirling.software.SPDF.utils.WebResponseUtils;

@RestController
@RequestMapping("/api/v1/security")
@Tag(name = "Security", description = "Security APIs")
@RequiredArgsConstructor
public class PasswordController {

    private final CustomPDFDocumentFactory pdfDocumentFactory;

    @PostMapping(consumes = "multipart/form-data", value = "/remove-password")
    @Operation(
            summary = "Remove password from a PDF file",
            description =
                    "This endpoint removes the password from a protected PDF file. Users need to"
                            + " provide the existing password. Input:PDF Output:PDF Type:SISO")
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
                    "This endpoint adds password protection to a PDF file. Users can specify a set"
                            + " of permissions that should be applied to the file. Input:PDF"
                            + " Output:PDF")
    public ResponseEntity<byte[]> addPassword(@ModelAttribute AddPasswordRequest request)
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

        PDDocument document = pdfDocumentFactory.load(fileInput);
        AccessPermission ap = new AccessPermission();
        ap.setCanAssembleDocument(!preventAssembly);
        ap.setCanExtractContent(!preventExtractContent);
        ap.setCanExtractForAccessibility(!preventExtractForAccessibility);
        ap.setCanFillInForm(!preventFillInForm);
        ap.setCanModify(!preventModify);
        ap.setCanModifyAnnotations(!preventModifyAnnotations);
        ap.setCanPrint(!preventPrinting);
        ap.setCanPrintFaithful(!preventPrintingFaithful);
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
