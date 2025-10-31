package stirling.software.SPDF.controller.api.security;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.List;

import org.apache.pdfbox.cos.COSDictionary;
import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDDocumentCatalog;
import org.apache.pdfbox.pdmodel.PDDocumentInformation;
import org.apache.pdfbox.pdmodel.PDDocumentNameDictionary;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.common.PDMetadata;
import org.apache.pdfbox.pdmodel.interactive.action.PDAction;
import org.apache.pdfbox.pdmodel.interactive.action.PDActionJavaScript;
import org.apache.pdfbox.pdmodel.interactive.action.PDActionLaunch;
import org.apache.pdfbox.pdmodel.interactive.action.PDActionURI;
import org.apache.pdfbox.pdmodel.interactive.action.PDDocumentCatalogAdditionalActions;
import org.apache.pdfbox.pdmodel.interactive.action.PDFormFieldAdditionalActions;
import org.apache.pdfbox.pdmodel.interactive.action.PDPageAdditionalActions;
import org.apache.pdfbox.pdmodel.interactive.annotation.PDAnnotation;
import org.apache.pdfbox.pdmodel.interactive.annotation.PDAnnotationFileAttachment;
import org.apache.pdfbox.pdmodel.interactive.annotation.PDAnnotationLink;
import org.apache.pdfbox.pdmodel.interactive.annotation.PDAnnotationWidget;
import org.apache.pdfbox.pdmodel.interactive.form.PDAcroForm;
import org.apache.pdfbox.pdmodel.interactive.form.PDField;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.model.api.security.SanitizePdfRequest;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.GeneralUtils;
import stirling.software.common.util.WebResponseUtils;

@RestController
@RequestMapping("/api/v1/security")
@Tag(name = "Security", description = "Security APIs")
@Slf4j
@RequiredArgsConstructor
public class SanitizeController {

    private final CustomPDFDocumentFactory pdfDocumentFactory;

    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE, value = "/sanitize-pdf")
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

        // Save the sanitized document to output stream
        ByteArrayOutputStream outputStream = new ByteArrayOutputStream();
        document.save(outputStream);
        document.close();

        return WebResponseUtils.bytesToWebResponse(
                outputStream.toByteArray(),
                GeneralUtils.generateFilename(inputFile.getOriginalFilename(), "_sanitized.pdf"));
    }

    private static void sanitizeJavaScript(PDDocument document) throws IOException {
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

        if (catalog.getOpenAction() instanceof PDActionJavaScript) {
            catalog.setOpenAction(null);
        }

        PDDocumentCatalogAdditionalActions catalogActions = catalog.getActions();
        if (catalogActions != null) {
            if (catalogActions.getWC() instanceof PDActionJavaScript) {
                catalogActions.setWC(null);
            }
            if (catalogActions.getWS() instanceof PDActionJavaScript) {
                catalogActions.setWS(null);
            }
            if (catalogActions.getDS() instanceof PDActionJavaScript) {
                catalogActions.setDS(null);
            }
            if (catalogActions.getWP() instanceof PDActionJavaScript) {
                catalogActions.setWP(null);
            }
            if (catalogActions.getDP() instanceof PDActionJavaScript) {
                catalogActions.setDP(null);
            }
        }

        PDAcroForm acroForm = catalog.getAcroForm();
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

        for (PDPage page : document.getPages()) {
            PDPageAdditionalActions pageActions = page.getActions();
            if (pageActions != null) {
                if (pageActions.getO() instanceof PDActionJavaScript) {
                    pageActions.setO(null);
                }
                if (pageActions.getC() instanceof PDActionJavaScript) {
                    pageActions.setC(null);
                }
            }

            for (PDAnnotation annotation : page.getAnnotations()) {
                if (annotation instanceof PDAnnotationWidget widget) {
                    PDAction action = widget.getAction();
                    if (action instanceof PDActionJavaScript) {
                        widget.setAction(null);
                    }
                }
            }
        }
    }

    private static void sanitizeEmbeddedFiles(PDDocument document) throws IOException {
        PDDocumentCatalog catalog = document.getDocumentCatalog();
        PDDocumentNameDictionary names = catalog.getNames();
        if (names != null) {
            names.setEmbeddedFiles(null);
        }

        for (PDPage page : document.getPages()) {
            List<PDAnnotation> annotations = page.getAnnotations();
            if (annotations != null && !annotations.isEmpty()) {
                annotations.removeIf(
                        annotation -> annotation instanceof PDAnnotationFileAttachment);
            }
        }
    }

    private static void sanitizeXMPMetadata(PDDocument document) {
        if (document.getDocumentCatalog() != null) {
            PDMetadata metadata = document.getDocumentCatalog().getMetadata();
            if (metadata != null) {
                document.getDocumentCatalog().setMetadata(null);
            }
        }
    }

    private static void sanitizeDocumentInfoMetadata(PDDocument document) {
        PDDocumentInformation docInfo = document.getDocumentInformation();
        if (docInfo != null) {
            PDDocumentInformation newInfo = new PDDocumentInformation();
            document.setDocumentInformation(newInfo);
        }
    }

    private static void sanitizeLinks(PDDocument document) throws IOException {
        for (PDPage page : document.getPages()) {
            for (PDAnnotation annotation : page.getAnnotations()) {
                if (annotation instanceof PDAnnotationLink linkAnnotation) {
                    PDAction action = linkAnnotation.getAction();
                    if ((action instanceof PDActionLaunch || action instanceof PDActionURI)) {
                        linkAnnotation.setAction(null);
                    }
                }
            }
        }
    }

    private static void sanitizeFonts(PDDocument document) {
        for (PDPage page : document.getPages()) {
            if (page != null
                    && page.getResources() != null
                    && page.getResources().getCOSObject() != null) {
                page.getResources().getCOSObject().removeItem(COSName.getPDFName("Font"));
            }
        }
    }
}
