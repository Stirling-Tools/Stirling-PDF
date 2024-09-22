package stirling.software.SPDF.controller.api.security;

import java.io.IOException;

import org.apache.pdfbox.cos.COSDictionary;
import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDDocumentCatalog;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageTree;
import org.apache.pdfbox.pdmodel.PDResources;
import org.apache.pdfbox.pdmodel.common.PDMetadata;
import org.apache.pdfbox.pdmodel.interactive.action.PDAction;
import org.apache.pdfbox.pdmodel.interactive.action.PDActionJavaScript;
import org.apache.pdfbox.pdmodel.interactive.action.PDActionLaunch;
import org.apache.pdfbox.pdmodel.interactive.action.PDActionURI;
import org.apache.pdfbox.pdmodel.interactive.action.PDFormFieldAdditionalActions;
import org.apache.pdfbox.pdmodel.interactive.annotation.PDAnnotation;
import org.apache.pdfbox.pdmodel.interactive.annotation.PDAnnotationLink;
import org.apache.pdfbox.pdmodel.interactive.annotation.PDAnnotationWidget;
import org.apache.pdfbox.pdmodel.interactive.form.PDAcroForm;
import org.apache.pdfbox.pdmodel.interactive.form.PDField;
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

import stirling.software.SPDF.model.api.security.SanitizePdfRequest;
import stirling.software.SPDF.service.CustomPDDocumentFactory;
import stirling.software.SPDF.utils.WebResponseUtils;

@RestController
@RequestMapping("/api/v1/security")
@Tag(name = "Security", description = "Security APIs")
public class SanitizeController {

    private final CustomPDDocumentFactory pdfDocumentFactory;

    @Autowired
    public SanitizeController(CustomPDDocumentFactory pdfDocumentFactory) {
        this.pdfDocumentFactory = pdfDocumentFactory;
    }

    @PostMapping(consumes = "multipart/form-data", value = "/sanitize-pdf")
    @Operation(
            summary = "Sanitize a PDF file",
            description =
                    "This endpoint processes a PDF file and removes specific elements based on the provided options. Input:PDF Output:PDF Type:SISO")
    public ResponseEntity<byte[]> sanitizePDF(@ModelAttribute SanitizePdfRequest request)
            throws IOException {
        MultipartFile inputFile = request.getFileInput();
        boolean removeJavaScript = request.isRemoveJavaScript();
        boolean removeEmbeddedFiles = request.isRemoveEmbeddedFiles();
        boolean removeMetadata = request.isRemoveMetadata();
        boolean removeLinks = request.isRemoveLinks();
        boolean removeFonts = request.isRemoveFonts();

        PDDocument document = pdfDocumentFactory.load(inputFile);
        if (removeJavaScript) {
            sanitizeJavaScript(document);
        }

        if (removeEmbeddedFiles) {
            sanitizeEmbeddedFiles(document);
        }

        if (removeMetadata) {
            sanitizeMetadata(document);
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
                if (annotation instanceof PDAnnotationWidget) {
                    PDAnnotationWidget widget = (PDAnnotationWidget) annotation;
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

    private void sanitizeMetadata(PDDocument document) {
        if (document.getDocumentCatalog() != null) {
            PDMetadata metadata = document.getDocumentCatalog().getMetadata();
            if (metadata != null) {
                document.getDocumentCatalog().setMetadata(null);
            }
        }
    }

    private void sanitizeLinks(PDDocument document) throws IOException {
        for (PDPage page : document.getPages()) {
            for (PDAnnotation annotation : page.getAnnotations()) {
                if (annotation != null && annotation instanceof PDAnnotationLink) {
                    PDAction action = ((PDAnnotationLink) annotation).getAction();
                    if (action != null
                            && (action instanceof PDActionLaunch
                                    || action instanceof PDActionURI)) {
                        ((PDAnnotationLink) annotation).setAction(null);
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
