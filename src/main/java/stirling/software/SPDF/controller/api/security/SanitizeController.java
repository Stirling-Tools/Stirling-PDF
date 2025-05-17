package stirling.software.SPDF.controller.api.security;

import java.io.IOException;

import org.apache.pdfbox.cos.COSDictionary;
import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.pdmodel.*;
import org.apache.pdfbox.pdmodel.common.PDMetadata;
import org.apache.pdfbox.pdmodel.interactive.action.*;
import org.apache.pdfbox.pdmodel.interactive.annotation.PDAnnotation;
import org.apache.pdfbox.pdmodel.interactive.annotation.PDAnnotationLink;
import org.apache.pdfbox.pdmodel.interactive.annotation.PDAnnotationWidget;
import org.apache.pdfbox.pdmodel.interactive.form.PDAcroForm;
import org.apache.pdfbox.pdmodel.interactive.form.PDField;
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

import stirling.software.SPDF.model.api.security.SanitizePdfRequest;
import stirling.software.SPDF.service.CustomPDFDocumentFactory;
import stirling.software.SPDF.utils.WebResponseUtils;

@RestController
@RequestMapping("/api/v1/security")
@Tag(name = "Security", description = "Security APIs")
@RequiredArgsConstructor
public class SanitizeController {

    private final CustomPDFDocumentFactory pdfDocumentFactory;

    @PostMapping(consumes = "multipart/form-data", value = "/sanitize-pdf")
    @Operation(
            summary = "Sanitize a PDF file",
            description =
                    "This endpoint processes a PDF file and removes specific elements based on the"
                            + " provided options. Input:PDF Output:PDF Type:SISO")
    public ResponseEntity<byte[]> sanitizePDF(@ModelAttribute SanitizePdfRequest request)
            throws IOException {
        MultipartFile inputFile = request.getFileInput();
        boolean removeJavaScript = Boolean.TRUE.equals(request.getRemoveJavaScript());
        boolean removeEmbeddedFiles = Boolean.TRUE.equals(request.getRemoveEmbeddedFiles());
        boolean removeXMPMetadata = Boolean.TRUE.equals(request.getRemoveXMPMetadata());
        boolean removeMetadata = Boolean.TRUE.equals(request.getRemoveMetadata());
        boolean removeLinks = Boolean.TRUE.equals(request.getRemoveLinks());
        boolean removeFonts = Boolean.TRUE.equals(request.getRemoveFonts());

        PDDocument document = pdfDocumentFactory.load(inputFile, true);
        if (removeJavaScript) {
            sanitizeJavaScript(document);
        }

        if (removeEmbeddedFiles) {
            sanitizeEmbeddedFiles(document);
        }

        if (removeXMPMetadata) {
            sanitizeXMPMetadata(document);
        }

        if (removeMetadata) {
            sanitizeDocumentInfoMetadata(document);
        }

        if (removeLinks) {
            sanitizeLinks(document);
        }

        if (removeFonts) {
            sanitizeFonts(document);
        }

        return WebResponseUtils.pdfDocToWebResponse(
                document,
                Filenames.toSimpleFileName(inputFile.getOriginalFilename())
                                .replaceFirst("[.][^.]+$", "")
                        + "_sanitized.pdf");
    }

    private void sanitizeJavaScript(PDDocument document) throws IOException {
        // Get the root dictionary (catalog) of the PDF
        PDDocumentCatalog catalog = document.getDocumentCatalog();

        // Get the Names dictionary
        COSDictionary namesDict =
                (COSDictionary) catalog.getCOSObject().getDictionaryObject(COSName.NAMES);

        if (namesDict != null) {
            // Get the JavaScript dictionary
            COSDictionary javaScriptDict =
                    (COSDictionary) namesDict.getDictionaryObject(COSName.getPDFName("JavaScript"));

            if (javaScriptDict != null) {
                // Remove the JavaScript dictionary
                namesDict.removeItem(COSName.getPDFName("JavaScript"));
            }
        }

        for (PDPage page : document.getPages()) {
            for (PDAnnotation annotation : page.getAnnotations()) {
                if (annotation instanceof PDAnnotationWidget widget) {
                    PDAction action = widget.getAction();
                    if (action instanceof PDActionJavaScript) {
                        widget.setAction(null);
                    }
                }
            }
            PDAcroForm acroForm = document.getDocumentCatalog().getAcroForm();
            if (acroForm != null) {
                for (PDField field : acroForm.getFields()) {
                    PDFormFieldAdditionalActions actions = field.getActions();
                    if (actions != null) {
                        if (actions.getC() instanceof PDActionJavaScript) {
                            actions.setC(null);
                        }
                        if (actions.getF() instanceof PDActionJavaScript) {
                            actions.setF(null);
                        }
                        if (actions.getK() instanceof PDActionJavaScript) {
                            actions.setK(null);
                        }
                        if (actions.getV() instanceof PDActionJavaScript) {
                            actions.setV(null);
                        }
                    }
                }
            }
        }
    }

    private void sanitizeEmbeddedFiles(PDDocument document) {
        PDPageTree allPages = document.getPages();

        for (PDPage page : allPages) {
            PDResources res = page.getResources();
            if (res != null && res.getCOSObject() != null) {
                res.getCOSObject().removeItem(COSName.getPDFName("EmbeddedFiles"));
            }
        }
    }

    private void sanitizeXMPMetadata(PDDocument document) {
        if (document.getDocumentCatalog() != null) {
            PDMetadata metadata = document.getDocumentCatalog().getMetadata();
            if (metadata != null) {
                document.getDocumentCatalog().setMetadata(null);
            }
        }
    }

    private void sanitizeDocumentInfoMetadata(PDDocument document) {
        PDDocumentInformation docInfo = document.getDocumentInformation();
        if (docInfo != null) {
            PDDocumentInformation newInfo = new PDDocumentInformation();
            document.setDocumentInformation(newInfo);
        }
    }

    private void sanitizeLinks(PDDocument document) throws IOException {
        for (PDPage page : document.getPages()) {
            for (PDAnnotation annotation : page.getAnnotations()) {
                if (annotation != null && annotation instanceof PDAnnotationLink linkAnnotation) {
                    PDAction action = linkAnnotation.getAction();
                    if (action != null
                            && (action instanceof PDActionLaunch
                                    || action instanceof PDActionURI)) {
                        linkAnnotation.setAction(null);
                    }
                }
            }
        }
    }

    private void sanitizeFonts(PDDocument document) {
        for (PDPage page : document.getPages()) {
            if (page != null
                    && page.getResources() != null
                    && page.getResources().getCOSObject() != null) {
                page.getResources().getCOSObject().removeItem(COSName.getPDFName("Font"));
            }
        }
    }
}
