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

import stirling.software.SPDF.service.PdfToJsonService.PDFParser;
import stirling.software.common.model.api.PDFFile;

@RestController
@RequestMapping("/api/v1/convert")
@Tag(name = "Convert", description = "Conversion APIs")
@RequiredArgsConstructor
public class ConvertPdfToJson {

    private final PDFParser pdfToJsonService;

    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE, value = "/pdf/json")
    @Operation(
            summary = "Convert PDF to JSON",
            description = "This endpoint converts a PDF file to JSON format. Input:PDF Output:JSON")
    public ResponseEntity<byte[]> processPdfToJSON(@ModelAttribute PDFFile file) throws Exception {

        MultipartFile inputFile = file.getFileInput();

        return pdfToJsonService.processPdfToJson(inputFile);
    }
}
