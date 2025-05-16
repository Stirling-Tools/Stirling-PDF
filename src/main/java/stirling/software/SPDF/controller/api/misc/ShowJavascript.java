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

import stirling.software.SPDF.model.api.PDFFile;
import stirling.software.SPDF.service.CustomPDFDocumentFactory;
import stirling.software.SPDF.utils.WebResponseUtils;

@RestController
@RequestMapping("/api/v1/misc")
@Tag(name = "Misc", description = "Miscellaneous APIs")
@RequiredArgsConstructor
public class ShowJavascript {

    private final CustomPDFDocumentFactory pdfDocumentFactory;

    @PostMapping(consumes = "multipart/form-data", value = "/show-javascript")
    @Operation(
            summary = "Grabs all JS from a PDF and returns a single JS file with all code",
            description = "desc. Input:PDF Output:JS Type:SISO")
    public ResponseEntity<byte[]> extractHeader(@ModelAttribute PDFFile file) throws Exception {
        MultipartFile inputFile = file.getFileInput();
        String script = "";

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

                        script +=
                                "// File: "
                                        + Filenames.toSimpleFileName(
                                                inputFile.getOriginalFilename())
                                        + ", Script: "
                                        + name
                                        + "\n"
                                        + jsCodeStr
                                        + "\n";
                    }
                }
            }

            if (script.isEmpty()) {
                script =
                        "PDF '"
                                + Filenames.toSimpleFileName(inputFile.getOriginalFilename())
                                + "' does not contain Javascript";
            }

            return WebResponseUtils.bytesToWebResponse(
                    script.getBytes(StandardCharsets.UTF_8),
                    Filenames.toSimpleFileName(inputFile.getOriginalFilename()) + ".js",
                    MediaType.TEXT_PLAIN);
        }
    }
}
