package stirling.software.SPDF.model.api.converters;

import java.io.IOException;
import java.nio.charset.StandardCharsets;

import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.multipart.MultipartFile;

import io.github.pixee.security.Filenames;
import io.swagger.v3.oas.annotations.Operation;

import lombok.RequiredArgsConstructor;

import stirling.software.SPDF.config.swagger.MarkdownConversionResponse;
import stirling.software.common.annotations.AutoJobPostMapping;
import stirling.software.common.annotations.api.ConvertApi;
import stirling.software.common.enumeration.ResourceWeight;
import stirling.software.common.model.api.PDFFile;
import stirling.software.common.model.tool.ToolFormat;
import stirling.software.common.model.tool.ToolIO;
import stirling.software.common.pdf.PdfMarkdownConverter;
import stirling.software.common.util.ExceptionUtils;
import stirling.software.common.util.JpdfiumGuard;
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;
import stirling.software.common.util.WebResponseUtils;
import stirling.software.jpdfium.PdfDocument;
import stirling.software.jpdfium.exception.JPDFiumException;

@ConvertApi
@RequiredArgsConstructor
public class ConvertPDFToMarkdown {

    private final TempFileManager tempFileManager;

    @AutoJobPostMapping(
            consumes = MediaType.MULTIPART_FORM_DATA_VALUE,
            value = "/pdf/markdown",
            resourceWeight = ResourceWeight.MEDIUM_WEIGHT)
    @MarkdownConversionResponse
    @ToolIO(produces = ToolFormat.MARKDOWN)
    @Operation(
            summary = "Convert PDF to Markdown",
            description = "This endpoint converts a PDF file to Markdown format.")
    public ResponseEntity<byte[]> processPdfToMarkdown(@ModelAttribute PDFFile file)
            throws Exception {
        MultipartFile inputFile = file.getFileInput();

        String originalName = Filenames.toSimpleFileName(inputFile.getOriginalFilename());
        String baseName =
                originalName.contains(".")
                        ? originalName.substring(0, originalName.lastIndexOf('.'))
                        : originalName;

        String markdown;
        try (TempFile tempInput = new TempFile(tempFileManager, ".pdf")) {
            inputFile.transferTo(tempInput.getFile());
            try (JpdfiumGuard.Scope guard = JpdfiumGuard.acquire();
                    PdfDocument doc = PdfDocument.open(tempInput.getPath())) {
                markdown = new PdfMarkdownConverter().convert(doc);
            } catch (IOException | JPDFiumException e) {
                // jpdfium's exceptions are unchecked and embed the temp file path, so the job
                // runner would echo it; translate to keep server paths out of the response.
                throw ExceptionUtils.handleJpdfiumException(e, "during Markdown conversion");
            }
        }

        return WebResponseUtils.bytesToWebResponse(
                markdown.getBytes(StandardCharsets.UTF_8),
                baseName + ".md",
                MediaType.valueOf("text/markdown"));
    }
}
