package stirling.software.SPDF.model.api.converters;

import java.nio.charset.StandardCharsets;

import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.multipart.MultipartFile;

import io.github.pixee.security.Filenames;
import io.swagger.v3.oas.annotations.Operation;

import lombok.RequiredArgsConstructor;

import stirling.software.SPDF.config.swagger.MarkdownConversionResponse;
import stirling.software.SPDF.service.OfficeConversionService;
import stirling.software.common.annotations.AutoJobPostMapping;
import stirling.software.common.annotations.api.ConvertApi;
import stirling.software.common.enumeration.ResourceWeight;
import stirling.software.common.model.api.PDFFile;
import stirling.software.common.model.tool.ToolFormat;
import stirling.software.common.model.tool.ToolIO;
import stirling.software.common.pdf.MarkdownBlocks;
import stirling.software.common.pdf.PdfMarkdownExtractor;
import stirling.software.common.pdf.worker.MarkdownJob;
import stirling.software.common.pdf.worker.PdfWorkerPool;
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;
import stirling.software.common.util.WebResponseUtils;

@ConvertApi
@RequiredArgsConstructor
public class ConvertPDFToMarkdown {

    private final TempFileManager tempFileManager;
    private final PdfMarkdownExtractor markdownExtractor;
    private final OfficeConversionService officeConversionService;
    private final PdfWorkerPool pdfWorkerPool;

    @AutoJobPostMapping(
            consumes = MediaType.MULTIPART_FORM_DATA_VALUE,
            value = "/pdf/markdown",
            resourceWeight = ResourceWeight.MEDIUM_WEIGHT)
    @MarkdownConversionResponse
    @ToolIO(produces = ToolFormat.MARKDOWN)
    @Operation(
            summary = "Convert PDF to Markdown",
            description = "This endpoint converts a PDF file to Markdown format.")
    public ResponseEntity<byte[]> processPdfToMarkdown(
            @ModelAttribute PDFFile file,
            @RequestParam(value = "useStirlingOfficeConvert", required = false)
                    Boolean useStirlingOfficeConvert)
            throws Exception {
        MultipartFile inputFile = file.getFileInput();

        if (officeConversionService.replacesLibreOffice(useStirlingOfficeConvert)) {
            var response =
                    officeConversionService.convert(
                            inputFile,
                            "md",
                            MediaType.valueOf("text/markdown"),
                            officeConversionService.settings());
            try (var in = response.getBody().getInputStream()) {
                return ResponseEntity.ok().headers(response.getHeaders()).body(in.readAllBytes());
            }
        }

        String originalName = Filenames.toSimpleFileName(inputFile.getOriginalFilename());
        String baseName =
                originalName.contains(".")
                        ? originalName.substring(0, originalName.lastIndexOf('.'))
                        : originalName;

        String markdown;
        try (TempFile tempInput = new TempFile(tempFileManager, ".pdf")) {
            inputFile.transferTo(tempInput.getFile());
            markdown =
                    MarkdownBlocks.join(
                            pdfWorkerPool
                                    .execute(
                                            new MarkdownJob(tempInput.getPath(), markdownExtractor))
                                    .blocks());
        }

        return WebResponseUtils.bytesToWebResponse(
                markdown.getBytes(StandardCharsets.UTF_8),
                baseName + ".md",
                MediaType.valueOf("text/markdown"));
    }
}
