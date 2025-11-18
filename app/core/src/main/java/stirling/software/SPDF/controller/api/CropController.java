package stirling.software.SPDF.controller.api;

import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import org.apache.pdfbox.multipdf.LayerUtility;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.PDPageContentStream.AppendMode;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.graphics.form.PDFormXObject;
import org.apache.pdfbox.rendering.PDFRenderer;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.model.api.general.CropPdfForm;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.GeneralUtils;
import stirling.software.common.util.ProcessExecutor;
import stirling.software.common.util.WebResponseUtils;

@RestController
@RequestMapping("/api/v1/general")
@Tag(name = "General", description = "General APIs")
@RequiredArgsConstructor
@Slf4j
public class CropController {

    private static final int DEFAULT_RENDER_DPI = 150;
    private static final int WHITE_THRESHOLD = 250;
    private static final String TEMP_INPUT_PREFIX = "crop_input";
    private static final String TEMP_OUTPUT_PREFIX = "crop_output";
    private static final String PDF_EXTENSION = ".pdf";

    private final CustomPDFDocumentFactory pdfDocumentFactory;

    private static int[] detectContentBounds(BufferedImage image) {
        int width = image.getWidth();
        int height = image.getHeight();

        // Early exit if image is too small
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

        // Return bounds in format: [left, bottom, right, top]
        // Note: Image coordinates are top-down, PDF coordinates are bottom-up
        return new int[] {left, height - bottom - 1, right, height - top - 1};
    }

    private static boolean isWhite(int rgb, int threshold) {
        int r = (rgb >> 16) & 0xFF;
        int g = (rgb >> 8) & 0xFF;
        int b = rgb & 0xFF;
        return r >= threshold && g >= threshold && b >= threshold;
    }

    @PostMapping(value = "/crop", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @Operation(
            summary = "Crops a PDF document",
            description =
                    "This operation takes an input PDF file and crops it according to the given"
                            + " coordinates. Input:PDF Output:PDF Type:SISO")
    public ResponseEntity<byte[]> cropPdf(@ModelAttribute CropPdfForm request) throws IOException {
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

        if (request.isRemoveDataOutsideCrop()) {
            return cropWithGhostscript(request);
        } else {
            return cropWithPDFBox(request);
        }
    }

    private ResponseEntity<byte[]> cropWithAutomaticDetection(@ModelAttribute CropPdfForm request)
            throws IOException {
        try (PDDocument sourceDocument = pdfDocumentFactory.load(request)) {

            try (PDDocument newDocument =
                    pdfDocumentFactory.createNewDocumentBasedOnOldDocument(sourceDocument)) {
                PDFRenderer renderer = new PDFRenderer(sourceDocument);
                LayerUtility layerUtility = new LayerUtility(newDocument);

                for (int i = 0; i < sourceDocument.getNumberOfPages(); i++) {
                    PDPage sourcePage = sourceDocument.getPage(i);
                    PDRectangle mediaBox = sourcePage.getMediaBox();

                    BufferedImage image = renderer.renderImageWithDPI(i, DEFAULT_RENDER_DPI);
                    int[] bounds = detectContentBounds(image);

                    float scaleX = mediaBox.getWidth() / image.getWidth();
                    float scaleY = mediaBox.getHeight() / image.getHeight();

                    CropBounds cropBounds = CropBounds.fromPixels(bounds, scaleX, scaleY);

                    PDPage newPage = new PDPage(mediaBox);
                    newDocument.addPage(newPage);
                    try (PDPageContentStream contentStream =
                            new PDPageContentStream(
                                    newDocument, newPage, AppendMode.OVERWRITE, true, true)) {
                        PDFormXObject formXObject =
                                layerUtility.importPageAsForm(sourceDocument, i);
                        contentStream.saveGraphicsState();
                        contentStream.addRect(
                                cropBounds.x, cropBounds.y, cropBounds.width, cropBounds.height);
                        contentStream.clip();
                        contentStream.drawForm(formXObject);
                        contentStream.restoreGraphicsState();
                    }

                    newPage.setMediaBox(
                            new PDRectangle(
                                    cropBounds.x,
                                    cropBounds.y,
                                    cropBounds.width,
                                    cropBounds.height));
                }

                ByteArrayOutputStream baos = new ByteArrayOutputStream();
                newDocument.save(baos);
                byte[] pdfContent = baos.toByteArray();

                return WebResponseUtils.bytesToWebResponse(
                        pdfContent,
                        GeneralUtils.generateFilename(
                                request.getFileInput().getOriginalFilename(), "_cropped.pdf"));
            }
        }
    }

    private ResponseEntity<byte[]> cropWithPDFBox(@ModelAttribute CropPdfForm request)
            throws IOException {
        try (PDDocument sourceDocument = pdfDocumentFactory.load(request)) {

            try (PDDocument newDocument =
                    pdfDocumentFactory.createNewDocumentBasedOnOldDocument(sourceDocument)) {
                int totalPages = sourceDocument.getNumberOfPages();
                LayerUtility layerUtility = new LayerUtility(newDocument);

                for (int i = 0; i < totalPages; i++) {
                    PDPage sourcePage = sourceDocument.getPage(i);

                    // Create a new page with the size of the source page
                    PDPage newPage = new PDPage(sourcePage.getMediaBox());
                    newDocument.addPage(newPage);
                    try (PDPageContentStream contentStream =
                            new PDPageContentStream(
                                    newDocument, newPage, AppendMode.OVERWRITE, true, true)) {
                        // Import the source page as a form XObject
                        PDFormXObject formXObject =
                                layerUtility.importPageAsForm(sourceDocument, i);

                        contentStream.saveGraphicsState();

                        // Define the crop area
                        contentStream.addRect(
                                request.getX(),
                                request.getY(),
                                request.getWidth(),
                                request.getHeight());
                        contentStream.clip();

                        // Draw the entire formXObject
                        contentStream.drawForm(formXObject);

                        contentStream.restoreGraphicsState();
                    }

                    // Now, set the new page's media box to the cropped size
                    newPage.setMediaBox(
                            new PDRectangle(
                                    request.getX(),
                                    request.getY(),
                                    request.getWidth(),
                                    request.getHeight()));
                }

                ByteArrayOutputStream baos = new ByteArrayOutputStream();
                newDocument.save(baos);

                byte[] pdfContent = baos.toByteArray();
                return WebResponseUtils.bytesToWebResponse(
                        pdfContent,
                        GeneralUtils.generateFilename(
                                request.getFileInput().getOriginalFilename(), "_cropped.pdf"));
            }
        }
    }

    private ResponseEntity<byte[]> cropWithGhostscript(@ModelAttribute CropPdfForm request)
            throws IOException {
        Path tempInputFile = null;
        Path tempOutputFile = null;

        try (PDDocument sourceDocument = pdfDocumentFactory.load(request)) {
            for (int i = 0; i < sourceDocument.getNumberOfPages(); i++) {
                PDPage page = sourceDocument.getPage(i);
                PDRectangle cropBox =
                        new PDRectangle(
                                request.getX(),
                                request.getY(),
                                request.getWidth(),
                                request.getHeight());
                page.setCropBox(cropBox);
            }

            tempInputFile = Files.createTempFile(TEMP_INPUT_PREFIX, PDF_EXTENSION);
            tempOutputFile = Files.createTempFile(TEMP_OUTPUT_PREFIX, PDF_EXTENSION);

            // Save the source document with crop boxes
            sourceDocument.save(tempInputFile.toFile());

            // Execute Ghostscript to process the crop boxes
            ProcessExecutor processExecutor =
                    ProcessExecutor.getInstance(ProcessExecutor.Processes.GHOSTSCRIPT);
            List<String> command =
                    List.of(
                            "gs",
                            "-sDEVICE=pdfwrite",
                            "-dUseCropBox",
                            "-o",
                            tempOutputFile.toString(),
                            tempInputFile.toString());

            processExecutor.runCommandWithOutputHandling(command);

            byte[] pdfContent = Files.readAllBytes(tempOutputFile);

            return WebResponseUtils.bytesToWebResponse(
                    pdfContent,
                    GeneralUtils.generateFilename(
                            request.getFileInput().getOriginalFilename(), "_cropped.pdf"));

        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IOException("Ghostscript processing was interrupted", e);
        } finally {
            if (tempInputFile != null) {
                Files.deleteIfExists(tempInputFile);
            }
            if (tempOutputFile != null) {
                Files.deleteIfExists(tempOutputFile);
            }
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
