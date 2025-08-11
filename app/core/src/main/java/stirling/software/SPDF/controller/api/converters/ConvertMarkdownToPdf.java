package stirling.software.SPDF.controller.api.converters;

import java.util.List;
import java.util.Map;

import org.commonmark.Extension;
import org.commonmark.ext.gfm.tables.TableBlock;
import org.commonmark.ext.gfm.tables.TablesExtension;
import org.commonmark.node.Node;
import org.commonmark.parser.Parser;
import org.commonmark.renderer.html.AttributeProvider;
import org.commonmark.renderer.html.HtmlRenderer;
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

import stirling.software.common.configuration.RuntimePathConfig;
import stirling.software.common.model.api.GeneralFile;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.CustomHtmlSanitizer;
import stirling.software.common.util.ExceptionUtils;
import stirling.software.common.util.FileToPdf;
import stirling.software.common.util.TempFileManager;
import stirling.software.common.util.WebResponseUtils;

@RestController
@Tag(name = "Convert", description = "Convert APIs")
@RequestMapping("/api/v1/convert")
@RequiredArgsConstructor
public class ConvertMarkdownToPdf {

    private final CustomPDFDocumentFactory pdfDocumentFactory;
    private final RuntimePathConfig runtimePathConfig;

    private final TempFileManager tempFileManager;

    private final CustomHtmlSanitizer customHtmlSanitizer;

    @PostMapping(consumes = "multipart/form-data", value = "/markdown/pdf")
    @Operation(
            summary = "Convert a Markdown file to PDF",
            description =
                    "This endpoint takes a Markdown file input, converts it to HTML, and then to"
                            + " PDF format. Input:MARKDOWN Output:PDF Type:SISO")
    public ResponseEntity<byte[]> markdownToPdf(@ModelAttribute GeneralFile generalFile)
            throws Exception {
        MultipartFile fileInput = generalFile.getFileInput();

        if (fileInput == null) {
            throw ExceptionUtils.createIllegalArgumentException(
                    "error.fileFormatRequired", "File must be in {0} format", "Markdown");
        }

        String originalFilename = Filenames.toSimpleFileName(fileInput.getOriginalFilename());
        if (originalFilename == null || !originalFilename.endsWith(".md")) {
            throw ExceptionUtils.createIllegalArgumentException(
                    "error.fileFormatRequired", "File must be in {0} format", ".md");
        }

        // Convert Markdown to HTML using CommonMark
        List<Extension> extensions = List.of(TablesExtension.create());
        Parser parser = Parser.builder().extensions(extensions).build();

        Node document = parser.parse(new String(fileInput.getBytes()));
        HtmlRenderer renderer =
                HtmlRenderer.builder()
                        .attributeProviderFactory(context -> new TableAttributeProvider())
                        .extensions(extensions)
                        .build();

        String htmlContent = renderer.render(document);

        byte[] pdfBytes =
                FileToPdf.convertHtmlToPdf(
                        runtimePathConfig.getWeasyPrintPath(),
                        null,
                        htmlContent.getBytes(),
                        "converted.html",
                        tempFileManager,
                        customHtmlSanitizer);
        pdfBytes = pdfDocumentFactory.createNewBytesBasedOnOldDocument(pdfBytes);
        String outputFilename =
                originalFilename.replaceFirst("[.][^.]+$", "")
                        + ".pdf"; // Remove file extension and append .pdf
        return WebResponseUtils.bytesToWebResponse(pdfBytes, outputFilename);
    }
}

class TableAttributeProvider implements AttributeProvider {
    @Override
    public void setAttributes(Node node, String tagName, Map<String, String> attributes) {
        if (node instanceof TableBlock) {
            attributes.put("class", "table table-striped");
        }
    }
}
