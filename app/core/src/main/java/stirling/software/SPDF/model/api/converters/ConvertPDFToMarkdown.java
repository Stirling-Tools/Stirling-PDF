package stirling.software.SPDF.model.api.converters;

import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.multipart.MultipartFile;

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

@ConvertApi
@RequiredArgsConstructor
public class ConvertPDFToMarkdown {

    private final OfficeConversionService officeConversionService;

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
}
