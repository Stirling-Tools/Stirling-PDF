package stirling.software.SPDF.controller.api.converters;

import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;

import lombok.RequiredArgsConstructor;

import stirling.software.common.model.api.PDFFile;
import stirling.software.common.util.PDFToFile;
import stirling.software.common.util.TempFileManager;

@RestController
@Tag(name = "Convert", description = "Convert APIs")
@RequestMapping("/api/v1/convert")
@RequiredArgsConstructor
public class ConvertPDFToHtml {

    private final TempFileManager tempFileManager;

    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE, value = "/pdf/html")
    @Operation(
            summary = "Convert PDF to HTML",
            description =
                    "This endpoint converts a PDF file to HTML format. Input:PDF Output:HTML Type:SISO")
    public ResponseEntity<byte[]> processPdfToHTML(@ModelAttribute PDFFile file) throws Exception {
        MultipartFile inputFile = file.getFileInput();
        PDFToFile pdfToFile = new PDFToFile(tempFileManager);
        return pdfToFile.processPdfToHtml(inputFile);
    }
}
