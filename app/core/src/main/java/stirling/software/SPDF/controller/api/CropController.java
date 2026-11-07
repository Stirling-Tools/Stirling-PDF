package stirling.software.SPDF.controller.api;

import java.awt.image.BufferedImage;
import java.io.IOException;
import java.util.BitSet;

import org.springframework.core.io.Resource;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.multipart.MultipartFile;

import io.swagger.v3.oas.annotations.Operation;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.model.api.general.CropPdfForm;
import stirling.software.common.annotations.AutoJobPostMapping;
import stirling.software.common.annotations.api.GeneralApi;
import stirling.software.common.enumeration.ResourceWeight;
import stirling.software.common.model.tool.ToolFormat;
import stirling.software.common.model.tool.ToolIO;
import stirling.software.common.util.GeneralUtils;
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;
import stirling.software.common.util.WebResponseUtils;
import stirling.software.jpdfium.PdfDocument;
import stirling.software.jpdfium.PdfPage;
import stirling.software.jpdfium.model.Rect;
import stirling.software.jpdfium.model.SaveOptions;
import stirling.software.jpdfium.transform.PdfPageGeometry;

@GeneralApi
@RequiredArgsConstructor
@Slf4j
public class CropController {

    private static final int DEFAULT_RENDER_DPI = 150;
    private static final int WHITE_THRESHOLD = 250;
    private static final String PDF_EXTENSION = ".pdf";

    private final TempFileManager tempFileManager;

    private static int[] detectContentBounds(BufferedImage image) {
        int width = image.getWidth();
        int height = image.getHeight();

        if (width < 1 || height < 1) {
            return new int[] {0, 0, width - 1, height - 1};
        }

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

        // Image coordinates are top-down; PDF coordinates are bottom-up.
        return new int[] {left, height - bottom - 1, right, height - top - 1};
    }

    private static boolean isWhite(int rgb, int threshold) {
        int r = (rgb >> 16) & 0xFF;
        int g = (rgb >> 8) & 0xFF;
        int b = rgb & 0xFF;
        return r >= threshold && g >= threshold && b >= threshold;
    }

    /** A zero or negative crop box would blank every page while reporting success. */
    private static void requirePositiveSize(CropPdfForm request) {
        Float width = request.getWidth();
        Float height = request.getHeight();
        if (width == null || height == null) {
            return;
        }
        if (width <= 0 || height <= 0) {
            throw new IllegalArgumentException(
                    "Invalid crop size: width and height must be greater than 0 (got width="
                            + width
                            + ", height="
                            + height
                            + ").");
        }
    }

    private static BitSet pageSelection(CropPdfForm request, int pageCount) {
        BitSet selected = new BitSet(pageCount);
        String pageNumbers = request.getPageNumbers();
        if (pageNumbers == null
                || pageNumbers.isBlank()
                || "all".equalsIgnoreCase(pageNumbers.trim())) {
            selected.set(0, pageCount);
            return selected;
        }

        GeneralUtils.requireValidPageSelection(pageNumbers, pageCount);
        for (int index : GeneralUtils.parsePageList(pageNumbers, pageCount, false)) {
            if (index >= 0 && index < pageCount) {
                selected.set(index);
            }
        }
        if (selected.isEmpty()) {
            throw new IllegalArgumentException(
                    "pageNumbers '" + pageNumbers + "' does not select any page");
        }
        return selected;
    }

    @AutoJobPostMapping(
            value = "/crop",
            consumes = MediaType.MULTIPART_FORM_DATA_VALUE,
            resourceWeight = ResourceWeight.SMALL_WEIGHT)
    @ToolIO(produces = ToolFormat.PDF)
    @Operation(
            summary = "Crops a PDF document",
            description =
                    "This operation takes an input PDF file and crops it according to the given"
                            + " coordinates.")
    public ResponseEntity<Resource> cropPdf(@ModelAttribute CropPdfForm request)
            throws IOException {
        if (request.isAutoCrop()) {
            return cropWithAutomaticDetection(request);
        }
        requirePositiveSize(request);

        if (request.getX() == null
                || request.getY() == null
                || request.getWidth() == null
                || request.getHeight() == null) {
            throw new IllegalArgumentException(
                    "Crop coordinates (x, y, width, height) are required when auto-crop is not enabled");
        }

        return cropWithJpdfium(request);
    }

    private ResponseEntity<Resource> cropWithAutomaticDetection(CropPdfForm request)
            throws IOException {
        byte[] pdfBytes = request.getFileInput().getBytes();
        TempFile tempOutputFile = tempFileManager.createManagedTempFile(PDF_EXTENSION);

        try {
            try (PdfDocument document = PdfDocument.open(pdfBytes)) {
                BitSet pagesToCrop = pageSelection(request, document.pageCount());
                for (int i = pagesToCrop.nextSetBit(0); i >= 0; i = pagesToCrop.nextSetBit(i + 1)) {
                    try (PdfPage page = document.page(i)) {
                        BufferedImage image = page.renderImage(DEFAULT_RENDER_DPI);
                        int[] bounds = detectContentBounds(image);
                        Rect crop =
                                cropRectFromBounds(
                                        bounds,
                                        image,
                                        page,
                                        PdfPageGeometry.getRotation(document, i));
                        // Non-strict: a word or object crossing the crop edge survives whole.
                        PdfPageGeometry.cropAndRemoveContent(document, i, crop);
                    }
                }
                document.saveTo(tempOutputFile.getFile().toPath(), SaveOptions.validated());
            }
            return WebResponseUtils.pdfFileToWebResponse(tempOutputFile, outputFilename(request));
        } catch (IOException e) {
            tempOutputFile.close();
            throw e;
        } catch (IllegalArgumentException e) {
            tempOutputFile.close();
            throw e;
        } catch (RuntimeException | LinkageError e) {
            tempOutputFile.close();
            throw new IOException("JPDFium crop failed", e);
        }
    }

    private ResponseEntity<Resource> cropWithJpdfium(CropPdfForm request) throws IOException {
        byte[] pdfBytes = request.getFileInput().getBytes();
        TempFile tempOutputFile = tempFileManager.createManagedTempFile(PDF_EXTENSION);
        Rect crop =
                new Rect(request.getX(), request.getY(), request.getWidth(), request.getHeight());

        try {
            try (PdfDocument document = PdfDocument.open(pdfBytes)) {
                BitSet pagesToCrop = pageSelection(request, document.pageCount());
                for (int i = pagesToCrop.nextSetBit(0); i >= 0; i = pagesToCrop.nextSetBit(i + 1)) {
                    if (request.isRemoveDataOutsideCrop()) {
                        // Non-strict: content crossing the crop edge is preserved and clipped.
                        PdfPageGeometry.cropAndRemoveContent(document, i, crop);
                    } else {
                        try (PdfPage page = document.page(i)) {
                            page.setMediaBox(crop);
                            page.setCropBox(crop);
                            page.setTrimBox(crop);
                            page.setBleedBox(crop);
                            page.setArtBox(crop);
                        }
                    }
                }
                document.saveTo(tempOutputFile.getFile().toPath(), SaveOptions.validated());
            }
            return WebResponseUtils.pdfFileToWebResponse(tempOutputFile, outputFilename(request));
        } catch (IOException e) {
            tempOutputFile.close();
            throw e;
        } catch (IllegalArgumentException e) {
            tempOutputFile.close();
            throw e;
        } catch (RuntimeException | LinkageError e) {
            tempOutputFile.close();
            throw new IOException("JPDFium crop failed", e);
        }
    }

    private static String outputFilename(CropPdfForm request) {
        MultipartFile fileInput = request.getFileInput();
        String sourceName =
                fileInput != null ? fileInput.getOriginalFilename() : request.getFileId();
        return GeneralUtils.generateFilename(sourceName, "_cropped.pdf");
    }

    /**
     * Maps a bottom-up display-space pixel box to PDF user space. The crop box origin and page
     * rotation are applied so auto-crop lands on the same content for every /Rotate value.
     */
    private static Rect cropRectFromBounds(
            int[] bounds, BufferedImage image, PdfPage page, int rotation) {
        var display = page.size();
        Rect cropBox = page.getCropBox().orElse(page.getMediaBox());
        float scaleX = display.width() / image.getWidth();
        float scaleY = display.height() / image.getHeight();
        float dx = bounds[0] * scaleX;
        float dy = bounds[1] * scaleY;
        float width = (bounds[2] - bounds[0]) * scaleX;
        float height = (bounds[3] - bounds[1]) * scaleY;
        float boxWidth = cropBox.width();
        float boxHeight = cropBox.height();

        return switch (rotation) {
            case 90 -> new Rect(cropBox.x() + dy, cropBox.y() + dx, height, width);
            case 180 ->
                    new Rect(
                            cropBox.x() + boxWidth - dx - width,
                            cropBox.y() + boxHeight - dy - height,
                            width,
                            height);
            case 270 ->
                    new Rect(
                            cropBox.x() + boxWidth - dy - height,
                            cropBox.y() + boxHeight - dx - width,
                            height,
                            width);
            default -> new Rect(cropBox.x() + dx, cropBox.y() + dy, width, height);
        };
    }
}
