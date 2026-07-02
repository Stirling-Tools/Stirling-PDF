package stirling.software.SPDF.controller.api.misc;

import java.io.IOException;

import org.springframework.core.io.Resource;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ModelAttribute;

import io.swagger.v3.oas.annotations.Operation;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.model.api.misc.FileResponseData;
import stirling.software.SPDF.model.api.misc.ProcessPdfWithOcrRequest;
import stirling.software.SPDF.service.misc.OcrService;
import stirling.software.common.annotations.AutoJobPostMapping;
import stirling.software.common.annotations.api.MiscApi;
import stirling.software.common.enumeration.ResourceWeight;
import stirling.software.common.util.WebResponseUtils;

@MiscApi
@Slf4j
@RequiredArgsConstructor
public class OCRController {

    private final OcrService ocrService;

    @AutoJobPostMapping(
            consumes = MediaType.MULTIPART_FORM_DATA_VALUE,
            value = "/ocr-pdf",
            resourceWeight = ResourceWeight.LARGE_WEIGHT)
    @Operation(
            summary = "Process a PDF file with OCR",
            description =
                    "This endpoint processes a PDF file using OCR (Optical Character Recognition). Users can"
                            + " specify languages, sidecar, deskew, clean, cleanFinal, ocrType, ocrRenderType,"
                            + " and removeImagesAfter options. Uses OCRmyPDF if available, falls back to"
                            + " Tesseract. Input:PDF Output:PDF Type:SI-Conditional")
    public ResponseEntity<Resource> processPdfWithOCR(
            @ModelAttribute ProcessPdfWithOcrRequest request)
            throws IOException, InterruptedException {

        FileResponseData result = ocrService.processPdfWithOCR(request);

        return WebResponseUtils.fileToWebResponse(
                result.tempFile(), result.fileName(), result.mediaType());
    }
}
