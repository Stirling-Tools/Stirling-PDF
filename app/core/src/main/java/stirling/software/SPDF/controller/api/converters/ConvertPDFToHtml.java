package stirling.software.SPDF.controller.api.converters;

import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.multipart.MultipartFile;

import io.swagger.v3.oas.annotations.Operation;

import lombok.RequiredArgsConstructor;

import stirling.software.common.annotations.AutoJobPostMapping;
import stirling.software.common.annotations.api.ConvertApi;
import stirling.software.common.configuration.RuntimePathConfig;
import stirling.software.common.model.api.PDFFile;
import stirling.software.common.util.PDFToFile;
import stirling.software.common.util.TempFileManager;

@ConvertApi
@RequiredArgsConstructor
public class ConvertPDFToHtml {

    private final TempFileManager tempFileManager;
    private final RuntimePathConfig runtimePathConfig;

    @AutoJobPostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE, value = "/pdf/html")
    @Operation(
            summary = "Convert PDF to HTML",
            description =
                    "This endpoint converts a PDF file to HTML format. Input:PDF Output:HTML Type:SISO")
    public ResponseEntity<byte[]> processPdfToHTML(@ModelAttribute PDFFile file) throws Exception {
        MultipartFile inputFile = file.getFileInput();
        PDFToFile pdfToFile = new PDFToFile(tempFileManager, runtimePathConfig);
        return pdfToFile.processPdfToHtml(inputFile);
    }
}
