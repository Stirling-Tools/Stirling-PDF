package stirling.software.SPDF.controller.api.security;

import java.io.IOException;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.encryption.AccessPermission;
import org.apache.pdfbox.pdmodel.encryption.StandardProtectionPolicy;
import org.jboss.resteasy.reactive.RestForm;
import org.jboss.resteasy.reactive.multipart.FileUpload;

import io.swagger.v3.oas.annotations.Operation;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;

import lombok.RequiredArgsConstructor;

import stirling.software.SPDF.config.swagger.StandardPdfResponse;
import stirling.software.SPDF.model.api.security.AddPasswordRequest;
import stirling.software.SPDF.model.api.security.PDFPasswordRequest;
import stirling.software.common.annotations.AutoJobPostMapping;
import stirling.software.common.annotations.api.SecurityApi;
import stirling.software.common.enumeration.ResourceWeight;
import stirling.software.common.model.MultipartFile;
import stirling.software.common.model.multipart.FileUploadMultipartFile;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.ExceptionUtils;
import stirling.software.common.util.GeneralUtils;
import stirling.software.common.util.TempFileManager;
import stirling.software.common.util.WebResponseUtils;

@SecurityApi
@Path("/api/v1/security")
@ApplicationScoped
@RequiredArgsConstructor
public class PasswordController {

    private final CustomPDFDocumentFactory pdfDocumentFactory;
    private final TempFileManager tempFileManager;

    @POST
    @Path("/remove-password")
    @Consumes(MediaType.MULTIPART_FORM_DATA)
    @AutoJobPostMapping(
            consumes = MediaType.MULTIPART_FORM_DATA,
            value = "/remove-password",
            resourceWeight = ResourceWeight.MEDIUM_WEIGHT)
    @StandardPdfResponse
    @Operation(
            summary = "Remove password from a PDF file",
            description =
                    "This endpoint removes the password from a protected PDF file. Users need to"
                            + " provide the existing password. Input:PDF Output:PDF Type:SISO")
    public Response removePassword(
            @RestForm("fileInput") FileUpload fileUpload,
            @RestForm("fileId") String fileId,
            @RestForm("password") String passwordForm)
            throws IOException {
        PDFPasswordRequest request = new PDFPasswordRequest();
        request.setFileInput(FileUploadMultipartFile.of(fileUpload));
        request.setFileId(fileId);
        request.setPassword(passwordForm);

        MultipartFile fileInput = request.getFileInput();
        String password = request.getPassword();

        try (PDDocument document = pdfDocumentFactory.load(fileInput, password)) {
            document.setAllSecurityToBeRemoved(true);
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

    @POST
    @Path("/add-password")
    @Consumes(MediaType.MULTIPART_FORM_DATA)
    @AutoJobPostMapping(
            consumes = MediaType.MULTIPART_FORM_DATA,
            value = "/add-password",
            resourceWeight = ResourceWeight.MEDIUM_WEIGHT)
    @StandardPdfResponse
    @Operation(
            summary = "Add password to a PDF file",
            description =
                    "This endpoint adds password protection to a PDF file. Users can specify a set"
                            + " of permissions that should be applied to the file. Input:PDF"
                            + " Output:PDF")
    public Response addPassword(
            @RestForm("fileInput") FileUpload fileUpload,
            @RestForm("fileId") String fileId,
            @RestForm("ownerPassword") String ownerPasswordForm,
            @RestForm("password") String passwordForm,
            @RestForm("keyLength") Integer keyLengthForm,
            @RestForm("preventAssembly") Boolean preventAssemblyForm,
            @RestForm("preventExtractContent") Boolean preventExtractContentForm,
            @RestForm("preventExtractForAccessibility") Boolean preventExtractForAccessibilityForm,
            @RestForm("preventFillInForm") Boolean preventFillInFormForm,
            @RestForm("preventModify") Boolean preventModifyForm,
            @RestForm("preventModifyAnnotations") Boolean preventModifyAnnotationsForm,
            @RestForm("preventPrinting") Boolean preventPrintingForm,
            @RestForm("preventPrintingFaithful") Boolean preventPrintingFaithfulForm)
            throws IOException {
        AddPasswordRequest request = new AddPasswordRequest();
        request.setFileInput(FileUploadMultipartFile.of(fileUpload));
        request.setFileId(fileId);
        request.setOwnerPassword(ownerPasswordForm);
        request.setPassword(passwordForm);
        if (keyLengthForm != null) {
            request.setKeyLength(keyLengthForm);
        }
        request.setPreventAssembly(preventAssemblyForm);
        request.setPreventExtractContent(preventExtractContentForm);
        request.setPreventExtractForAccessibility(preventExtractForAccessibilityForm);
        request.setPreventFillInForm(preventFillInFormForm);
        request.setPreventModify(preventModifyForm);
        request.setPreventModifyAnnotations(preventModifyAnnotationsForm);
        request.setPreventPrinting(preventPrintingForm);
        request.setPreventPrintingFaithful(preventPrintingFaithfulForm);

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

            if ((ownerPassword != null && ownerPassword.length() > 0)
                    || (password != null && password.length() > 0)) {
                spp.setEncryptionKeyLength(keyLength);
            }
            spp.setPermissions(ap);
            document.protect(spp);

            if ((ownerPassword == null || ownerPassword.length() == 0)
                    && (password == null || password.length() == 0))
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
