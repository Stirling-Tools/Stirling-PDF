package stirling.software.SPDF.controller.api.converters;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.multipart.MultipartFile;

import io.swagger.v3.oas.annotations.Operation;

import stirling.software.SPDF.config.swagger.HtmlConversionResponse;
import stirling.software.common.annotations.AutoJobPostMapping;
import stirling.software.common.annotations.api.ConvertApi;
import stirling.software.common.model.api.PDFFile;
import stirling.software.common.util.PDFToFile;

@ConvertApi
public class ConvertPDFToHtml {

    @AutoJobPostMapping(consumes = "multipart/form-data", value = "/pdf/html")
    @Operation(
            summary = "Convert PDF to HTML",
            description =
                    "This endpoint converts a PDF file to HTML format. Input:PDF Output:HTML Type:SISO")
    @HtmlConversionResponse
    public ResponseEntity<byte[]> processPdfToHTML(@ModelAttribute PDFFile file) throws Exception {
        MultipartFile inputFile = file.getFileInput();
        PDFToFile pdfToFile = new PDFToFile();
        return pdfToFile.processPdfToHtml(inputFile);
    }
}
