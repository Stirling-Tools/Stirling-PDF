package stirling.software.SPDF.controller.api.security;

import java.io.IOException;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.encryption.AccessPermission;
import org.apache.pdfbox.pdmodel.encryption.StandardProtectionPolicy;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Schema;
import stirling.software.SPDF.utils.PdfUtils;
@RestController
public class PasswordController {

    private static final Logger logger = LoggerFactory.getLogger(PasswordController.class);


    @PostMapping(consumes = "multipart/form-data", value = "/remove-password")
    @Operation(
        summary = "Remove password from a PDF file",
        description = "This endpoint removes the password from a protected PDF file. Users need to provide the existing password."
    )
    public ResponseEntity<byte[]> removePassword(
        @RequestPart(required = true, value = "fileInput")
        @Parameter(description = "The input PDF file from which the password should be removed", required = true)
            MultipartFile fileInput,
        @RequestParam(name = "password")
        @Parameter(description = "The password of the PDF file", required = true)
            String password) throws IOException {
        PDDocument document = PDDocument.load(fileInput.getBytes(), password);
        document.setAllSecurityToBeRemoved(true);
        return PdfUtils.pdfDocToWebResponse(document, fileInput.getOriginalFilename().replaceFirst("[.][^.]+$", "") + "_password_removed.pdf");
    }

    @PostMapping(consumes = "multipart/form-data", value = "/add-password")
    @Operation(
        summary = "Add password to a PDF file",
        description = "This endpoint adds password protection to a PDF file. Users can specify a set of permissions that should be applied to the file."
    )
    public ResponseEntity<byte[]> addPassword(
        @RequestPart(required = true, value = "fileInput")
        @Parameter(description = "The input PDF file to which the password should be added", required = true)
            MultipartFile fileInput,
        @RequestParam(defaultValue = "", name = "ownerPassword")
        @Parameter(description = "The owner password to be added to the PDF file (Restricts what can be done with the document once it is opened)")
            String ownerPassword,
        @RequestParam(defaultValue = "", name = "password")
        @Parameter(description = "The password to be added to the PDF file (Restricts the opening of the document itself.)")
            String password,
        @RequestParam(defaultValue = "128", name = "keyLength")
        @Parameter(description = "The length of the encryption key", schema = @Schema(allowableValues = {"40", "128", "256"}))
            int keyLength,
        @RequestParam(defaultValue = "false", name = "canAssembleDocument")
        @Parameter(description = "Whether the document assembly is allowed", example = "false")
            boolean canAssembleDocument,
        @RequestParam(defaultValue = "false", name = "canExtractContent")
        @Parameter(description = "Whether content extraction for accessibility is allowed", example = "false")
            boolean canExtractContent,
        @RequestParam(defaultValue = "false", name = "canExtractForAccessibility")
        @Parameter(description = "Whether content extraction for accessibility is allowed", example = "false")
            boolean canExtractForAccessibility,
        @RequestParam(defaultValue = "false", name = "canFillInForm")
        @Parameter(description = "Whether form filling is allowed", example = "false")
            boolean canFillInForm,
        @RequestParam(defaultValue = "false", name = "canModify")
        @Parameter(description = "Whether the document modification is allowed", example = "false")
            boolean canModify,
        @RequestParam(defaultValue = "false", name = "canModifyAnnotations")
        @Parameter(description = "Whether modification of annotations is allowed", example = "false")
            boolean canModifyAnnotations,
        @RequestParam(defaultValue = "false", name = "canPrint")
        @Parameter(description = "Whether printing of the document is allowed", example = "false")
            boolean canPrint,
        @RequestParam(defaultValue = "false", name = "canPrintFaithful")
        @Parameter(description = "Whether faithful printing is allowed", example = "false")
            boolean canPrintFaithful
    ) throws IOException {

        PDDocument document = PDDocument.load(fileInput.getBytes());
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
        
     
        
        spp.setEncryptionKeyLength(keyLength);

        spp.setPermissions(ap);

        document.protect(spp);

        return PdfUtils.pdfDocToWebResponse(document, fileInput.getOriginalFilename().replaceFirst("[.][^.]+$", "") + "_passworded.pdf");
    }


}
