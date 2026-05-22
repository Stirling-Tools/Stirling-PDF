package stirling.software.SPDF.controller.api.security;

import java.io.File;
import java.nio.file.Files;
import java.nio.file.StandardCopyOption;
import java.util.List;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDDocumentCatalog;
import org.apache.pdfbox.pdmodel.interactive.form.PDAcroForm;
import org.apache.pdfbox.pdmodel.interactive.form.PDField;
import org.apache.pdfbox.pdmodel.interactive.form.PDSignatureField;
import org.springframework.core.io.Resource;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.multipart.MultipartFile;

import io.swagger.v3.oas.annotations.Operation;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.config.swagger.StandardPdfResponse;
import stirling.software.common.annotations.AutoJobPostMapping;
import stirling.software.common.annotations.api.SecurityApi;
import stirling.software.common.enumeration.ResourceWeight;
import stirling.software.common.model.api.PDFFile;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.GeneralUtils;
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;
import stirling.software.common.util.WebResponseUtils;
import stirling.software.jpdfium.PdfDocument;

@SecurityApi
@Slf4j
@RequiredArgsConstructor
public class RemoveCertSignController {

    private final CustomPDFDocumentFactory pdfDocumentFactory;
    private final TempFileManager tempFileManager;

    @AutoJobPostMapping(
            consumes = MediaType.MULTIPART_FORM_DATA_VALUE,
            value = "/remove-cert-sign",
            resourceWeight = ResourceWeight.MEDIUM_WEIGHT)
    @StandardPdfResponse
    @Operation(
            summary = "Remove digital signature from PDF",
            description =
                    "This endpoint accepts a PDF file and returns the PDF file without the digital"
                            + " signature. Input:PDF, Output:PDF Type:SISO")
    public ResponseEntity<Resource> removeCertSignPDF(@ModelAttribute PDFFile request)
            throws Exception {
        MultipartFile pdf = request.getFileInput();
        String outName = GeneralUtils.generateFilename(pdf.getOriginalFilename(), "_unsigned.pdf");

        File inputTempFile = tempFileManager.convertMultipartFileToFile(pdf);
        try {
            if (!needsSignatureFlatten(inputTempFile)) {
                log.info("No signature fields detected; returning input as-is.");
                TempFile passthrough = tempFileManager.createManagedTempFile(".pdf");
                try {
                    Files.copy(
                            inputTempFile.toPath(),
                            passthrough.getFile().toPath(),
                            StandardCopyOption.REPLACE_EXISTING);
                } catch (Exception e) {
                    passthrough.close();
                    throw e;
                }
                return WebResponseUtils.pdfFileToWebResponse(passthrough, outName);
            }

            // PDFBox flattens the /Sig field - JPDFium can read signatures but not strip them.
            try (PDDocument document = pdfDocumentFactory.load(inputTempFile)) {
                PDDocumentCatalog catalog = document.getDocumentCatalog();
                PDAcroForm acroForm = catalog.getAcroForm();
                if (acroForm != null) {
                    List<PDField> fieldsToRemove =
                            acroForm.getFields().stream()
                                    .filter(field -> field instanceof PDSignatureField)
                                    .toList();
                    if (!fieldsToRemove.isEmpty()) {
                        acroForm.flatten(fieldsToRemove, false);
                    }
                }
                return WebResponseUtils.pdfDocToWebResponse(document, outName, tempFileManager);
            }
        } finally {
            tempFileManager.deleteTempFile(inputTempFile);
        }
    }

    private boolean needsSignatureFlatten(File inputFile) {
        try (PdfDocument check = PdfDocument.open(inputFile.toPath())) {
            return !check.signatures().isEmpty();
        } catch (Exception e) {
            log.debug(
                    "JPDFium signature pre-check failed; falling back to PDFBox flatten: {}",
                    e.getMessage());
            return true;
        }
    }
}
