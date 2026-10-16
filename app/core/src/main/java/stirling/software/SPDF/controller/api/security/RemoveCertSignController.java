package stirling.software.SPDF.controller.api.security;

import java.io.IOException;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

import org.apache.pdfbox.cos.COSBase;
import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDDocumentCatalog;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.interactive.annotation.PDAnnotation;
import org.apache.pdfbox.pdmodel.interactive.annotation.PDAnnotationWidget;
import org.apache.pdfbox.pdmodel.interactive.form.PDAcroForm;
import org.apache.pdfbox.pdmodel.interactive.form.PDField;
import org.apache.pdfbox.pdmodel.interactive.form.PDNonTerminalField;
import org.apache.pdfbox.pdmodel.interactive.form.PDSignatureField;
import org.springframework.core.io.Resource;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.multipart.MultipartFile;

import io.swagger.v3.oas.annotations.Operation;

import lombok.RequiredArgsConstructor;

import stirling.software.SPDF.config.swagger.StandardPdfResponse;
import stirling.software.common.annotations.AutoJobPostMapping;
import stirling.software.common.annotations.api.SecurityApi;
import stirling.software.common.enumeration.ResourceWeight;
import stirling.software.common.model.api.PDFFile;
import stirling.software.common.model.tool.ToolFormat;
import stirling.software.common.model.tool.ToolIO;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.GeneralUtils;
import stirling.software.common.util.TempFileManager;
import stirling.software.common.util.WebResponseUtils;

@SecurityApi
@RequiredArgsConstructor
public class RemoveCertSignController {

    private final CustomPDFDocumentFactory pdfDocumentFactory;
    private final TempFileManager tempFileManager;

    @AutoJobPostMapping(
            consumes = MediaType.MULTIPART_FORM_DATA_VALUE,
            value = "/remove-cert-sign",
            resourceWeight = ResourceWeight.MEDIUM_WEIGHT)
    @StandardPdfResponse
    @ToolIO(produces = ToolFormat.PDF)
    @Operation(
            summary = "Remove digital signature from PDF",
            description =
                    "This endpoint accepts a PDF file and returns the PDF file without the digital"
                            + " signature.")
    public ResponseEntity<Resource> removeCertSignPDF(@ModelAttribute PDFFile request)
            throws Exception {
        MultipartFile pdf = request.getFileInput();

        // Load the PDF document with proper resource management
        try (PDDocument document = pdfDocumentFactory.load(pdf)) {

            // Get the document catalog
            PDDocumentCatalog catalog = document.getDocumentCatalog();

            // Get the AcroForm
            PDAcroForm acroForm = catalog.getAcroForm();
            if (acroForm != null) {
                removeSignatureFields(document, acroForm);
            }
            // Return the modified PDF as a response
            return WebResponseUtils.pdfDocToWebResponse(
                    document,
                    GeneralUtils.generateFilename(pdf.getOriginalFilename(), "_unsigned.pdf"),
                    tempFileManager);
        }
    }

    /**
     * Deletes every signature field together with its widget annotations. Flattening instead would
     * draw each visible signature into the page content, so it could no longer be removed.
     */
    private static void removeSignatureFields(PDDocument document, PDAcroForm acroForm)
            throws IOException {
        List<PDSignatureField> signatureFields = new ArrayList<>();
        for (PDField field : acroForm.getFieldTree()) {
            if (field instanceof PDSignatureField signatureField) {
                signatureFields.add(signatureField);
            }
        }
        if (signatureFields.isEmpty()) {
            return;
        }

        Set<COSBase> widgets = new HashSet<>();
        for (PDSignatureField field : signatureFields) {
            for (PDAnnotationWidget widget : field.getWidgets()) {
                widgets.add(widget.getCOSObject());
            }
        }
        // A widget's /P entry is optional, so every page is checked.
        for (PDPage page : document.getPages()) {
            List<PDAnnotation> annotations = page.getAnnotations();
            List<PDAnnotation> kept = new ArrayList<>(annotations.size());
            for (PDAnnotation annotation : annotations) {
                if (!widgets.contains(annotation.getCOSObject())) {
                    kept.add(annotation);
                }
            }
            if (kept.size() != annotations.size()) {
                page.setAnnotations(kept);
            }
        }

        for (PDSignatureField field : signatureFields) {
            PDNonTerminalField parent = field.getParent();
            List<PDField> siblings =
                    new ArrayList<>(parent != null ? parent.getChildren() : acroForm.getFields());
            siblings.removeIf(sibling -> sibling.getCOSObject() == field.getCOSObject());
            if (parent != null) {
                parent.setChildren(siblings);
            } else {
                acroForm.setFields(siblings);
            }
        }

        acroForm.getCOSObject().removeItem(COSName.SIG_FLAGS);
        // /DocMDP and /UR3 point to the signature dictionaries of the removed fields.
        document.getDocumentCatalog().getCOSObject().removeItem(COSName.PERMS);
    }
}
