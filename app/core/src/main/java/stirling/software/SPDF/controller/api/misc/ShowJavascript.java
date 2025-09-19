package stirling.software.SPDF.controller.api.misc;

import java.nio.charset.StandardCharsets;
import java.util.Map;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.common.PDNameTreeNode;
import org.apache.pdfbox.pdmodel.interactive.action.PDActionJavaScript;
import org.springframework.http.MediaType;
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

import stirling.software.common.model.api.PDFFile;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.WebResponseUtils;

@RestController
@RequestMapping("/api/v1/misc")
@Tag(name = "Misc", description = "Miscellaneous APIs")
@RequiredArgsConstructor
public class ShowJavascript {

    private final CustomPDFDocumentFactory pdfDocumentFactory;

    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE, value = "/show-javascript")
    @Operation(
            summary = "Grabs all JS from a PDF and returns a single JS file with all code",
            description = "desc. Input:PDF Output:JS Type:SISO")
    public ResponseEntity<byte[]> extractHeader(@ModelAttribute PDFFile file) throws Exception {
        MultipartFile inputFile = file.getFileInput();
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
