package stirling.software.SPDF.model.api.converters;

import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.multipart.MultipartFile;

import io.swagger.v3.oas.annotations.Operation;

import lombok.RequiredArgsConstructor;

import stirling.software.SPDF.config.swagger.MarkdownConversionResponse;
import stirling.software.common.annotations.AutoJobPostMapping;
import stirling.software.common.annotations.api.ConvertApi;
import stirling.software.common.model.api.PDFFile;
import stirling.software.common.util.PDFToFile;
import stirling.software.common.util.TempFileManager;

@ConvertApi
@RequiredArgsConstructor
public class ConvertPDFToMarkdown {

    private final TempFileManager tempFileManager;

    @AutoJobPostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE, value = "/pdf/markdown")
    @MarkdownConversionResponse
    @Operation(
            summary = "Convert PDF to Markdown",
            description =
                    "This endpoint converts a PDF file to Markdown format. Input:PDF Output:Markdown Type:SISO")
    public ResponseEntity<byte[]> processPdfToMarkdown(@ModelAttribute PDFFile file)
            throws Exception {
        MultipartFile inputFile = file.getFileInput();
        PDFToFile pdfToFile = new PDFToFile(tempFileManager);
        return pdfToFile.processPdfToMarkdown(inputFile);
    }
}
