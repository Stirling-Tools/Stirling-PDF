package stirling.software.SPDF.controller.api.misc;

import java.io.File;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.List;
import java.util.Map;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.common.PDNameTreeNode;
import org.apache.pdfbox.pdmodel.interactive.action.PDActionJavaScript;
import org.springframework.core.io.Resource;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.multipart.MultipartFile;

import io.github.pixee.security.Filenames;
import io.swagger.v3.oas.annotations.Operation;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.config.swagger.JavaScriptResponse;
import stirling.software.common.annotations.AutoJobPostMapping;
import stirling.software.common.annotations.api.MiscApi;
import stirling.software.common.enumeration.ResourceWeight;
import stirling.software.common.model.api.PDFFile;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;
import stirling.software.common.util.WebResponseUtils;
import stirling.software.jpdfium.PdfDocument;
import stirling.software.jpdfium.doc.JsAction;
import stirling.software.jpdfium.doc.PdfJavaScriptInspector;

@MiscApi
@Slf4j
@RequiredArgsConstructor
public class ShowJavascript {

    private final CustomPDFDocumentFactory pdfDocumentFactory;
    private final TempFileManager tempFileManager;

    @AutoJobPostMapping(
            consumes = MediaType.MULTIPART_FORM_DATA_VALUE,
            value = "/show-javascript",
            resourceWeight = ResourceWeight.SMALL_WEIGHT)
    @JavaScriptResponse
    @Operation(
            summary = "Grabs all JS from a PDF and returns a single JS file with all code",
            description = "desc. Input:PDF Output:JS Type:SISO")
    public ResponseEntity<Resource> extractHeader(@ModelAttribute PDFFile file) throws Exception {
        MultipartFile inputFile = file.getFileInput();
        String simpleFilename = Filenames.toSimpleFileName(inputFile.getOriginalFilename());
        StringBuilder script = new StringBuilder();
        boolean foundScript = false;

        // JPDFium fast path: read document-level JS without PDFBox roundtrip.
        File tempPdf = tempFileManager.convertMultipartFileToFile(inputFile);
        boolean jpdfiumOk = false;
        try {
            try (PdfDocument doc = PdfDocument.open(tempPdf.toPath())) {
                List<JsAction> docScripts = PdfJavaScriptInspector.documentScripts(doc.rawHandle());
                for (JsAction action : docScripts) {
                    String code = action.script();
                    if (code != null && !code.trim().isEmpty()) {
                        appendScript(script, simpleFilename, action.name(), code);
                        foundScript = true;
                    }
                }
                jpdfiumOk = true;
            } catch (Exception e) {
                log.debug("JPDFium JS read failed, falling back to PDFBox: {}", e.getMessage());
            }

            if (!jpdfiumOk) {
                foundScript = extractViaPdfBox(inputFile, simpleFilename, script);
            }
        } finally {
            tempFileManager.deleteTempFile(tempPdf);
        }

        if (!foundScript) {
            script =
                    new StringBuilder("PDF '")
                            .append(simpleFilename)
                            .append("' does not contain Javascript");
        }

        TempFile tempOut = tempFileManager.createManagedTempFile(".js");
        try {
            Files.write(
                    tempOut.getFile().toPath(), script.toString().getBytes(StandardCharsets.UTF_8));
        } catch (Exception e) {
            tempOut.close();
            throw e;
        }
        return WebResponseUtils.fileToWebResponse(
                tempOut, simpleFilename + ".js", MediaType.TEXT_PLAIN);
    }

    private static void appendScript(
            StringBuilder script, String filename, String name, String code) {
        script.append("// File: ")
                .append(filename)
                .append(", Script: ")
                .append(name)
                .append("\n")
                .append(code)
                .append("\n");
    }

    private boolean extractViaPdfBox(
            MultipartFile inputFile, String simpleFilename, StringBuilder script)
            throws IOException {
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
                            appendScript(script, simpleFilename, name, jsCodeStr);
                            foundScript = true;
                        }
                    }
                }
            }
        }
        return foundScript;
    }
}
