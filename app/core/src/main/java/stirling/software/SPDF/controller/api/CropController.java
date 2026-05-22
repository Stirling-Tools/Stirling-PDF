package stirling.software.SPDF.controller.api;

import java.awt.image.BufferedImage;
import java.io.File;
import java.io.IOException;
import java.util.List;

import org.springframework.core.io.Resource;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.multipart.MultipartFile;

import io.swagger.v3.oas.annotations.Operation;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.config.EndpointConfiguration;
import stirling.software.SPDF.model.api.general.CropPdfForm;
import stirling.software.common.annotations.AutoJobPostMapping;
import stirling.software.common.annotations.api.GeneralApi;
import stirling.software.common.enumeration.ResourceWeight;
import stirling.software.common.util.ExceptionUtils;
import stirling.software.common.util.GeneralUtils;
import stirling.software.common.util.ProcessExecutor;
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;
import stirling.software.common.util.WebResponseUtils;
import stirling.software.jpdfium.PdfDocument;
import stirling.software.jpdfium.PdfImageConverter;
import stirling.software.jpdfium.PdfPage;
import stirling.software.jpdfium.doc.PdfMarginAdjuster;
import stirling.software.jpdfium.model.PageSize;
import stirling.software.jpdfium.model.Rect;
import stirling.software.jpdfium.transform.PdfPageBoxes;

@GeneralApi
@RequiredArgsConstructor
@Slf4j
public class CropController {

    private static final int DEFAULT_RENDER_DPI = 150;
    private static final int WHITE_THRESHOLD = 250;
    private static final String PDF_EXTENSION = ".pdf";

    private final TempFileManager tempFileManager;
    private final EndpointConfiguration endpointConfiguration;

    private static int[] detectContentBounds(BufferedImage image) {
        int width = image.getWidth();
        int height = image.getHeight();

        if (width < 1 || height < 1) {
            return new int[] {0, 0, width - 1, height - 1};
        }

        // Sample every nth pixel for large images to reduce processing time
        int step = (width > 2000 || height > 2000) ? 2 : 1;

        int top = 0;
        boolean found = false;
        for (int y = 0; y < height && !found; y += step) {
            for (int x = 0; x < width; x += step) {
                if (!isWhite(image.getRGB(x, y), WHITE_THRESHOLD)) {
                    top = y;
                    found = true;
                    break;
                }
            }
        }

        int bottom = height - 1;
        found = false;
        for (int y = height - 1; y >= 0 && !found; y -= step) {
            for (int x = 0; x < width; x += step) {
                if (!isWhite(image.getRGB(x, y), WHITE_THRESHOLD)) {
                    bottom = y;
                    found = true;
                    break;
                }
            }
        }

        int left = 0;
        found = false;
        for (int x = 0; x < width && !found; x += step) {
            for (int y = top; y <= bottom; y += step) {
                if (!isWhite(image.getRGB(x, y), WHITE_THRESHOLD)) {
                    left = x;
                    found = true;
                    break;
                }
            }
        }

        int right = width - 1;
        found = false;
        for (int x = width - 1; x >= 0 && !found; x -= step) {
            for (int y = top; y <= bottom; y += step) {
                if (!isWhite(image.getRGB(x, y), WHITE_THRESHOLD)) {
                    right = x;
                    found = true;
                    break;
                }
            }
        }

        // Image coordinates top-down, PDF coordinates bottom-up
        return new int[] {left, height - bottom - 1, right, height - top - 1};
    }

    private static boolean isWhite(int rgb, int threshold) {
        int r = (rgb >> 16) & 0xFF;
        int g = (rgb >> 8) & 0xFF;
        int b = rgb & 0xFF;
        return r >= threshold && g >= threshold && b >= threshold;
    }

    private boolean isGhostscriptEnabled() {
        return endpointConfiguration.isGroupEnabled("Ghostscript");
    }

    @AutoJobPostMapping(
            value = "/crop",
            consumes = MediaType.MULTIPART_FORM_DATA_VALUE,
            resourceWeight = ResourceWeight.SMALL_WEIGHT)
    @Operation(
            summary = "Crops a PDF document",
            description =
                    "This operation takes an input PDF file and crops it according to the given"
                            + " coordinates. Input:PDF Output:PDF Type:SISO")
    public ResponseEntity<Resource> cropPdf(@ModelAttribute CropPdfForm request)
            throws IOException {
        if (request.isAutoCrop()) {
            return cropWithAutomaticDetection(request);
        }

        if (request.getX() == null
                || request.getY() == null
                || request.getWidth() == null
                || request.getHeight() == null) {
            throw new IllegalArgumentException(
                    "Crop coordinates (x, y, width, height) are required when auto-crop is not enabled");
        }

        if (request.isRemoveDataOutsideCrop() && isGhostscriptEnabled()) {
            return cropWithGhostscript(request);
        }
        return cropWithJpdfium(request);
    }

    private ResponseEntity<Resource> cropWithAutomaticDetection(CropPdfForm request)
            throws IOException {
        MultipartFile fileInput = request.getFileInput();
        File inputFile = tempFileManager.convertMultipartFileToFile(fileInput);
        try {
            try (PdfDocument doc = PdfDocument.open(inputFile.toPath())) {
                int pageCount = doc.pageCount();
                for (int i = 0; i < pageCount; i++) {
                    BufferedImage image = PdfImageConverter.pageToImage(doc, i, DEFAULT_RENDER_DPI);

                    PageSize size;
                    try (PdfPage page = doc.page(i)) {
                        size = page.size();
                    }

                    int[] bounds = detectContentBounds(image);
                    float scaleX = size.width() / image.getWidth();
                    float scaleY = size.height() / image.getHeight();

                    CropBounds cropBounds = CropBounds.fromPixels(bounds, scaleX, scaleY);
                    applyCropMargins(doc, i, size, cropBounds);
                }

                TempFile outputTempFile = new TempFile(tempFileManager, PDF_EXTENSION);
                try {
                    doc.save(outputTempFile.getPath());
                } catch (Exception e) {
                    outputTempFile.close();
                    throw e;
                }
                return WebResponseUtils.pdfFileToWebResponse(
                        outputTempFile,
                        GeneralUtils.generateFilename(
                                fileInput.getOriginalFilename(), "_cropped.pdf"));
            }
        } finally {
            tempFileManager.deleteTempFile(inputFile);
        }
    }

    private ResponseEntity<Resource> cropWithJpdfium(CropPdfForm request) throws IOException {
        MultipartFile fileInput = request.getFileInput();
        File inputFile = tempFileManager.convertMultipartFileToFile(fileInput);
        try {
            try (PdfDocument doc = PdfDocument.open(inputFile.toPath())) {
                int pageCount = doc.pageCount();
                CropBounds bounds =
                        new CropBounds(
                                request.getX(),
                                request.getY(),
                                request.getWidth(),
                                request.getHeight());
                for (int i = 0; i < pageCount; i++) {
                    PageSize size;
                    try (PdfPage page = doc.page(i)) {
                        size = page.size();
                    }
                    applyCropMargins(doc, i, size, bounds);
                }

                TempFile outputTempFile = new TempFile(tempFileManager, PDF_EXTENSION);
                try {
                    doc.save(outputTempFile.getPath());
                } catch (Exception e) {
                    outputTempFile.close();
                    throw e;
                }
                return WebResponseUtils.pdfFileToWebResponse(
                        outputTempFile,
                        GeneralUtils.generateFilename(
                                fileInput.getOriginalFilename(), "_cropped.pdf"));
            }
        } finally {
            tempFileManager.deleteTempFile(inputFile);
        }
    }

    // PdfMarginAdjuster.addMargins(doc, page, left, bottom, right, top): translates
    // content by (left, bottom), grows page by left+right and bottom+top.
    // To crop to (x, y, w, h) shift content to (-x, -y) and end at (w, h).
    private static void applyCropMargins(
            PdfDocument doc, int pageIndex, PageSize size, CropBounds bounds) {
        float left = -bounds.x();
        float bottom = -bounds.y();
        float right = bounds.width() - size.width() + bounds.x();
        float top = bounds.height() - size.height() + bounds.y();
        PdfMarginAdjuster.addMargins(doc, pageIndex, left, bottom, right, top);
    }

    private ResponseEntity<Resource> cropWithGhostscript(CropPdfForm request) throws IOException {
        MultipartFile fileInput = request.getFileInput();
        File inputFile = tempFileManager.convertMultipartFileToFile(fileInput);
        TempFile tempInputFile = null;
        TempFile tempOutputFile = null;
        try {
            tempInputFile = new TempFile(tempFileManager, PDF_EXTENSION);
            tempOutputFile = new TempFile(tempFileManager, PDF_EXTENSION);

            try (PdfDocument doc = PdfDocument.open(inputFile.toPath())) {
                Rect cropRect =
                        Rect.of(
                                request.getX(),
                                request.getY(),
                                request.getWidth(),
                                request.getHeight());
                int pageCount = doc.pageCount();
                for (int i = 0; i < pageCount; i++) {
                    try (PdfPage page = doc.page(i)) {
                        PdfPageBoxes.setCropBox(page.rawHandle(), cropRect);
                    }
                }
                doc.save(tempInputFile.getPath());
            }

            ProcessExecutor processExecutor =
                    ProcessExecutor.getInstance(ProcessExecutor.Processes.GHOSTSCRIPT);
            List<String> command =
                    List.of(
                            "gs",
                            "-sDEVICE=pdfwrite",
                            "-dUseCropBox",
                            "-o",
                            tempOutputFile.getAbsolutePath(),
                            tempInputFile.getAbsolutePath());
            processExecutor.runCommandWithOutputHandling(command);

            TempFile out = tempOutputFile;
            tempOutputFile = null;
            return WebResponseUtils.pdfFileToWebResponse(
                    out,
                    GeneralUtils.generateFilename(fileInput.getOriginalFilename(), "_cropped.pdf"));
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw ExceptionUtils.createProcessingInterruptedException("Ghostscript", e);
        } finally {
            if (tempInputFile != null) {
                tempInputFile.close();
            }
            if (tempOutputFile != null) {
                tempOutputFile.close();
            }
            tempFileManager.deleteTempFile(inputFile);
        }
    }

    private record CropBounds(float x, float y, float width, float height) {

        static CropBounds fromPixels(int[] pixelBounds, float scaleX, float scaleY) {
            if (pixelBounds.length != 4) {
                throw new IllegalArgumentException(
                        "pixelBounds array must contain exactly 4 elements: [x1, y1, x2, y2]");
            }
            float x = pixelBounds[0] * scaleX;
            float y = pixelBounds[1] * scaleY;
            float width = (pixelBounds[2] - pixelBounds[0]) * scaleX;
            float height = (pixelBounds[3] - pixelBounds[1]) * scaleY;
            return new CropBounds(x, y, width, height);
        }
    }
}
