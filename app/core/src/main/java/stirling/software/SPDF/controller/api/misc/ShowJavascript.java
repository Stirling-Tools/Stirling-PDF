package stirling.software.SPDF.controller.api.misc;

import java.beans.PropertyEditorSupport;
import java.nio.charset.StandardCharsets;
import java.util.Map;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.common.PDNameTreeNode;
import org.apache.pdfbox.pdmodel.interactive.action.PDActionJavaScript;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.WebDataBinder;
import org.springframework.web.bind.annotation.InitBinder;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.multipart.MultipartFile;

import io.github.pixee.security.Filenames;
import io.swagger.v3.oas.annotations.Operation;

import jakarta.validation.Valid;

import lombok.RequiredArgsConstructor;

import stirling.software.SPDF.config.swagger.JavaScriptResponse;
import stirling.software.common.annotations.AutoJobPostMapping;
import stirling.software.common.annotations.api.MiscApi;
import stirling.software.common.model.api.PDFFile;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.service.FileStorage;
import stirling.software.common.util.ExceptionUtils;
import stirling.software.common.util.WebResponseUtils;

@MiscApi
@RequiredArgsConstructor
public class ShowJavascript {

    private final CustomPDFDocumentFactory pdfDocumentFactory;
    private final FileStorage fileStorage;

    /**
     * Initialize data binder for multipart file uploads. This method registers a custom editor for
     * MultipartFile to handle file uploads. It sets the MultipartFile to null if the uploaded file
     * is empty. This is necessary to avoid binding errors when the file is not present.
     */
    @InitBinder
    public void initBinder(WebDataBinder binder) {
        binder.registerCustomEditor(
                MultipartFile.class,
                new PropertyEditorSupport() {
                    @Override
                    public void setAsText(String text) throws IllegalArgumentException {
                        setValue(null);
                    }
                });
    }

    @AutoJobPostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE, value = "/show-javascript")
    @JavaScriptResponse
    @Operation(
            summary = "Grabs all JS from a PDF and returns a single JS file with all code",
            description = "desc. Input:PDF Output:JS Type:SISO")
    public ResponseEntity<byte[]> extractHeader(@Valid @ModelAttribute PDFFile request)
            throws Exception {
        MultipartFile inputFile;
        // Validate input
        inputFile = request.resolveFile(fileStorage);
        if (inputFile == null) {
            throw ExceptionUtils.createIllegalArgumentException(
                    "error.pdfRequired", "PDF file is required");
        }
        request.validatePdfFile(inputFile);
        StringBuilder script = new StringBuilder();
        boolean foundScript = false;

        try (PDDocument document = pdfDocumentFactory.load(inputFile)) {

            if (document.getDocumentCatalog() != null
                    && document.getDocumentCatalog().getNames() != null) {
                PDNameTreeNode<PDActionJavaScript> jsTree =
                        document.getDocumentCatalog().getNames().getJavaScript();

                if (jsTree != null) {
                    Map<String, PDActionJavaScript> jsEntries = jsTree.getNames();

                    for (Map.Entry<String, PDActionJavaScript> entry : jsEntries.entrySet()) {
                        String name = entry.getKey();
                        PDActionJavaScript jsAction = entry.getValue();
                        String jsCodeStr = jsAction.getAction();

                        if (jsCodeStr != null && !jsCodeStr.trim().isEmpty()) {
                            script.append("// File: ")
                                    .append(
                                            Filenames.toSimpleFileName(
                                                    inputFile.getOriginalFilename()))
                                    .append(", Script: ")
                                    .append(name)
                                    .append("\n")
                                    .append(jsCodeStr)
                                    .append("\n");
                            foundScript = true;
                        }
                    }
                }
            }

            if (!foundScript) {
                script =
                        new StringBuilder("PDF '")
                                .append(Filenames.toSimpleFileName(inputFile.getOriginalFilename()))
                                .append("' does not contain Javascript");
            }

            return WebResponseUtils.bytesToWebResponse(
                    script.toString().getBytes(StandardCharsets.UTF_8),
                    Filenames.toSimpleFileName(inputFile.getOriginalFilename()) + ".js",
                    MediaType.TEXT_PLAIN);
        }
    }
}
