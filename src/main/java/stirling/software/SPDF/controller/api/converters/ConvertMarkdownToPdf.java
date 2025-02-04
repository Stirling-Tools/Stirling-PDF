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
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import io.github.pixee.security.Filenames;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;

import stirling.software.SPDF.model.ApplicationProperties;
import stirling.software.SPDF.model.api.GeneralFile;
import stirling.software.SPDF.service.CustomPDDocumentFactory;
import stirling.software.SPDF.utils.FileToPdf;
import stirling.software.SPDF.utils.WebResponseUtils;

@RestController
@Tag(name = "Convert", description = "Convert APIs")
@RequestMapping("/api/v1/convert")
public class ConvertMarkdownToPdf {

    private final boolean bookAndHtmlFormatsInstalled;

    private final CustomPDDocumentFactory pdfDocumentFactory;

    private final ApplicationProperties applicationProperties;

    @Autowired
    public ConvertMarkdownToPdf(
            CustomPDDocumentFactory pdfDocumentFactory,
            @Qualifier("bookAndHtmlFormatsInstalled") boolean bookAndHtmlFormatsInstalled,
            ApplicationProperties applicationProperties) {
        this.pdfDocumentFactory = pdfDocumentFactory;
        this.bookAndHtmlFormatsInstalled = bookAndHtmlFormatsInstalled;
        this.applicationProperties = applicationProperties;
    }

    @PostMapping(consumes = "multipart/form-data", value = "/markdown/pdf")
    @Operation(
            summary = "Convert a Markdown file to PDF",
            description =
                    "This endpoint takes a Markdown file input, converts it to HTML, and then to PDF format. Input:MARKDOWN Output:PDF Type:SISO")
    public ResponseEntity<byte[]> markdownToPdf(@ModelAttribute GeneralFile request)
            throws Exception {
        MultipartFile fileInput = request.getFileInput();

        if (fileInput == null) {
            throw new IllegalArgumentException("Please provide a Markdown file for conversion.");
        }

        String originalFilename = Filenames.toSimpleFileName(fileInput.getOriginalFilename());
        if (originalFilename == null || !originalFilename.endsWith(".md")) {
            throw new IllegalArgumentException("File must be in .md format.");
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

        boolean disableSanitize =
                Boolean.TRUE.equals(applicationProperties.getSystem().getDisableSanitize());

        byte[] pdfBytes =
                FileToPdf.convertHtmlToPdf(
                        null,
                        htmlContent.getBytes(),
                        "converted.html",
                        bookAndHtmlFormatsInstalled,
                        disableSanitize);
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
