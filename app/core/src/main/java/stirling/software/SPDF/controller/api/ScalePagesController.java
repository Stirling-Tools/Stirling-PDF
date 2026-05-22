package stirling.software.SPDF.controller.api;

import java.io.File;
import java.io.IOException;
import java.util.HashMap;
import java.util.Map;

import org.springframework.core.io.Resource;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.multipart.MultipartFile;

import io.swagger.v3.oas.annotations.Operation;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.model.api.general.ScalePagesRequest;
import stirling.software.common.annotations.AutoJobPostMapping;
import stirling.software.common.annotations.api.GeneralApi;
import stirling.software.common.enumeration.ResourceWeight;
import stirling.software.common.util.ExceptionUtils;
import stirling.software.common.util.GeneralUtils;
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;
import stirling.software.common.util.WebResponseUtils;
import stirling.software.jpdfium.PdfDocument;
import stirling.software.jpdfium.PdfPage;
import stirling.software.jpdfium.doc.PdfPageScaler;
import stirling.software.jpdfium.doc.PdfPosterizer.PaperSize;
import stirling.software.jpdfium.model.PageSize;
import stirling.software.jpdfium.model.Rect;
import stirling.software.jpdfium.transform.PdfPageBoxes;

@GeneralApi
@Slf4j
@RequiredArgsConstructor
public class ScalePagesController {

    // PDFBox PDRectangle dimensions (width, height) in points, inlined so the
    // controller has no remaining PDFBox dependency.
    private static final float A0_W = 2383.937f;
    private static final float A0_H = 3370.3937f;
    private static final float A1_W = 1683.7795f;
    private static final float A1_H = 2383.937f;
    private static final float A2_W = 1190.5511f;
    private static final float A2_H = 1683.7795f;
    private static final float A3_W = 841.8898f;
    private static final float A3_H = 1190.5511f;
    private static final float A4_W = 595.27563f;
    private static final float A4_H = 841.8898f;
    private static final float A5_W = 419.52756f;
    private static final float A5_H = 595.27563f;
    private static final float A6_W = 297.63782f;
    private static final float A6_H = 419.52756f;
    private static final float LETTER_W = 612f;
    private static final float LETTER_H = 792f;
    private static final float LEGAL_W = 612f;
    private static final float LEGAL_H = 1008f;

    private final TempFileManager tempFileManager;

    private static PageSize getTargetSize(String name, PdfDocument sourceDocument) {
        if ("KEEP".equals(name)) {
            if (sourceDocument.pageCount() == 0) {
                throw ExceptionUtils.createInvalidPageSizeException("KEEP");
            }
            try (PdfPage first = sourceDocument.page(0)) {
                return first.size();
            }
        }
        Map<String, PageSize> sizeMap = getSizeMap();
        PageSize size = sizeMap.get(name);
        if (size == null) {
            throw ExceptionUtils.createInvalidPageSizeException(name);
        }
        return size;
    }

    private static Map<String, PageSize> getSizeMap() {
        Map<String, PageSize> sizeMap = new HashMap<>();

        sizeMap.put("A0", new PageSize(A0_W, A0_H));
        sizeMap.put("A1", new PageSize(A1_W, A1_H));
        sizeMap.put("A2", new PageSize(A2_W, A2_H));
        sizeMap.put("A3", new PageSize(A3_W, A3_H));
        sizeMap.put("A4", new PageSize(A4_W, A4_H));
        sizeMap.put("A5", new PageSize(A5_W, A5_H));
        sizeMap.put("A6", new PageSize(A6_W, A6_H));

        sizeMap.put("A0_LANDSCAPE", new PageSize(A0_H, A0_W));
        sizeMap.put("A1_LANDSCAPE", new PageSize(A1_H, A1_W));
        sizeMap.put("A2_LANDSCAPE", new PageSize(A2_H, A2_W));
        sizeMap.put("A3_LANDSCAPE", new PageSize(A3_H, A3_W));
        sizeMap.put("A4_LANDSCAPE", new PageSize(A4_H, A4_W));
        sizeMap.put("A5_LANDSCAPE", new PageSize(A5_H, A5_W));
        sizeMap.put("A6_LANDSCAPE", new PageSize(A6_H, A6_W));

        sizeMap.put("LETTER", new PageSize(LETTER_W, LETTER_H));
        sizeMap.put("LEGAL", new PageSize(LEGAL_W, LEGAL_H));

        sizeMap.put("LETTER_LANDSCAPE", new PageSize(LETTER_H, LETTER_W));
        sizeMap.put("LEGAL_LANDSCAPE", new PageSize(LEGAL_H, LEGAL_W));

        return sizeMap;
    }

    @AutoJobPostMapping(
            value = "/scale-pages",
            consumes = MediaType.MULTIPART_FORM_DATA_VALUE,
            resourceWeight = ResourceWeight.SMALL_WEIGHT)
    @Operation(
            summary = "Change the size of a PDF page/document",
            description =
                    "This operation takes an input PDF file and the size to scale the pages to in"
                            + " the output PDF file. Input:PDF Output:PDF Type:SISO")
    public ResponseEntity<Resource> scalePages(@ModelAttribute ScalePagesRequest request)
            throws IOException {
        MultipartFile file = request.getFileInput();
        String targetPDRectangle = request.getPageSize();
        float scaleFactor = request.getScaleFactor();

        File inputFile = tempFileManager.convertMultipartFileToFile(file);
        try {
            try (PdfDocument doc = PdfDocument.open(inputFile.toPath())) {
                PageSize targetSize = getTargetSize(targetPDRectangle, doc);
                float targetW = targetSize.width();
                float targetH = targetSize.height();

                // Build a "virtual" paper so PdfPageScaler.scale produces base*scaleFactor
                // scaling, then restore the real MediaBox/CropBox to the requested target
                // size with the content centered.
                float virtualW = targetW * scaleFactor;
                float virtualH = targetH * scaleFactor;
                PaperSize virtualPaper = new PaperSize(virtualW, virtualH, "virtual");

                int pageCount = doc.pageCount();
                for (int i = 0; i < pageCount; i++) {
                    PdfPageScaler.scale(doc, i, virtualPaper, PdfPageScaler.FitMode.FIT_PAGE);

                    float offsetX = (virtualW - targetW) / 2f;
                    float offsetY = (virtualH - targetH) / 2f;
                    Rect mediaBox = Rect.of(offsetX, offsetY, targetW, targetH);
                    try (PdfPage page = doc.page(i)) {
                        PdfPageBoxes.setMediaBox(page.rawHandle(), mediaBox);
                        PdfPageBoxes.setCropBox(page.rawHandle(), mediaBox);
                    }
                }

                TempFile outputTempFile = new TempFile(tempFileManager, ".pdf");
                try {
                    doc.save(outputTempFile.getPath());
                } catch (Exception e) {
                    outputTempFile.close();
                    throw e;
                }
                return WebResponseUtils.pdfFileToWebResponse(
                        outputTempFile,
                        GeneralUtils.generateFilename(file.getOriginalFilename(), "_scaled.pdf"));
            }
        } finally {
            tempFileManager.deleteTempFile(inputFile);
        }
    }
}
