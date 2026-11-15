package stirling.software.SPDF.controller.api.misc;

import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.file.Files;
import java.util.ArrayList;
import java.util.List;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

import javax.imageio.ImageIO;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.rendering.PDFRenderer;
import org.springframework.core.io.Resource;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.multipart.MultipartFile;

import io.swagger.v3.oas.annotations.Operation;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.config.swagger.MultiFileResponse;
import stirling.software.SPDF.model.api.misc.ExtractImageScansRequest;
import stirling.software.common.annotations.AutoJobPostMapping;
import stirling.software.common.annotations.api.MiscApi;
import stirling.software.common.enumeration.ResourceWeight;
import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.model.tool.ToolArity;
import stirling.software.common.model.tool.ToolFormat;
import stirling.software.common.model.tool.ToolIO;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.ApplicationContextProvider;
import stirling.software.common.util.ExceptionUtils;
import stirling.software.common.util.GeneralUtils;
import stirling.software.common.util.LimitedPDFRenderer;
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;
import stirling.software.common.util.WebResponseUtils;
import stirling.software.officeconvert.photosplit.PhotoSplitter;

@MiscApi
@Slf4j
@RequiredArgsConstructor
public class ExtractImageScansController {

    // Print-quality raster for the extracted scan; capped by system maxDPI
    private static final int SCAN_RENDER_DPI = 300;

    private static final String REPLACEFIRST = "[.][^.]+$";

    private final CustomPDFDocumentFactory pdfDocumentFactory;
    private final TempFileManager tempFileManager;

    @AutoJobPostMapping(
            consumes = MediaType.MULTIPART_FORM_DATA_VALUE,
            value = "/extract-image-scans",
            resourceWeight = ResourceWeight.LARGE_WEIGHT)
    @MultiFileResponse
    // Inputs are read with ImageIO, which cannot read the vector/PSD formats in IMAGE.
    @ToolIO(
            accepts = {ToolFormat.PDF, ToolFormat.IMAGE},
            inputExtensions = {
                "pdf", "bmp", "dib", "gif", "jpeg", "jpg", "jpe", "jp2", "png", "webp", "avif",
                "pbm", "pgm", "ppm", "pxm", "pnm", "pfm", "sr", "ras", "tiff", "tif", "hdr", "pic"
            },
            produces = ToolFormat.IMAGE,
            arity = ToolArity.SIMO)
    @Operation(
            summary = "Extract photos scanned together on one page into separate images",
            description =
                    "Finds, crops and straightens each photo on every page or image."
                            + " Returns one PNG, or a zip when several are found.")
    public ResponseEntity<Resource> extractImageScans(
            @ModelAttribute ExtractImageScansRequest request) throws IOException {
        MultipartFile inputFile = request.getFileInput();

        String fileName = inputFile.getOriginalFilename();
        String extension = fileName.substring(fileName.lastIndexOf('.') + 1);

        PhotoSplitter.Options options =
                PhotoSplitter.Options.defaults()
                        .angleThreshold(request.getAngleThreshold())
                        .tolerance(request.getTolerance())
                        .minArea(request.getMinArea())
                        .minContourArea(request.getMinContourArea())
                        .borderSize(request.getBorderSize());
        List<byte[]> processedImageBytes = new ArrayList<>();
        TempFile finalOutput = null;
        boolean finalOutputOwnershipTransferred = false;
        try {
            if ("pdf".equalsIgnoreCase(extension)) {
                try (PDDocument document = pdfDocumentFactory.load(inputFile)) {
                    PDFRenderer pdfRenderer = new LimitedPDFRenderer(document);
                    pdfRenderer.setSubsamplingAllowed(true);
                    // maxDPI is a safety ceiling for user-supplied values, not a target
                    int renderDpi = SCAN_RENDER_DPI;
                    ApplicationProperties properties =
                            ApplicationContextProvider.getBean(ApplicationProperties.class);
                    if (properties != null && properties.getSystem() != null) {
                        renderDpi = Math.min(renderDpi, properties.getSystem().getMaxDPI());
                    }
                    final int dpi = renderDpi;
                    for (int i = 0; i < document.getNumberOfPages(); i++) {
                        final int pageIndex = i;
                        BufferedImage page =
                                ExceptionUtils.handleOomRendering(
                                        pageIndex + 1,
                                        dpi,
                                        () -> pdfRenderer.renderImageWithDPI(pageIndex, dpi));
                        addPhotos(page, options, processedImageBytes);
                    }
                }
            } else {
                BufferedImage image;
                try (InputStream in = inputFile.getInputStream()) {
                    image = ImageIO.read(in);
                }
                if (image == null) {
                    throw ExceptionUtils.createIllegalArgumentException(
                            "error.unsupportedImageFormat",
                            "Unsupported image format: {0}",
                            extension);
                }
                addPhotos(image, options, processedImageBytes);
            }

            // Create zip file if multiple images
            if (processedImageBytes.size() > 1) {
                String outputZipFilename =
                        GeneralUtils.generateFilename(fileName, "_processed.zip");
                finalOutput = tempFileManager.createManagedTempFile(".zip");

                try (ZipOutputStream zipOut =
                        new ZipOutputStream(Files.newOutputStream(finalOutput.getPath()))) {
                    // Add processed images to the zip
                    for (int i = 0; i < processedImageBytes.size(); i++) {
                        ZipEntry entry =
                                new ZipEntry(
                                        GeneralUtils.generateFilename(
                                                fileName, "_processed_" + (i + 1) + ".png"));
                        zipOut.putNextEntry(entry);
                        zipOut.write(processedImageBytes.get(i));
                        zipOut.closeEntry();
                    }
                }

                ResponseEntity<Resource> response =
                        WebResponseUtils.zipFileToWebResponse(finalOutput, outputZipFilename);
                finalOutputOwnershipTransferred = true;
                return response;
            }
            if (processedImageBytes.isEmpty()) {
                throw ExceptionUtils.createIllegalArgumentException(
                        "error.noContent", "No {0} detected", "images");
            } else {

                // Return the processed image as a response
                byte[] imageBytes = processedImageBytes.getFirst();
                finalOutput = tempFileManager.createManagedTempFile(".png");
                try (OutputStream out = Files.newOutputStream(finalOutput.getPath())) {
                    out.write(imageBytes);
                }

                ResponseEntity<Resource> response =
                        WebResponseUtils.fileToWebResponse(
                                finalOutput,
                                GeneralUtils.generateFilename(fileName, ".png"),
                                MediaType.IMAGE_PNG);
                finalOutputOwnershipTransferred = true;
                return response;
            }
        } finally {
            if (finalOutput != null && !finalOutputOwnershipTransferred) {
                finalOutput.close();
            }
        }
    }

    private static void addPhotos(
            BufferedImage scan, PhotoSplitter.Options options, List<byte[]> out)
            throws IOException {
        for (PhotoSplitter.Photo photo : PhotoSplitter.split(scan, options)) {
            ByteArrayOutputStream png = new ByteArrayOutputStream();
            ImageIO.write(photo.image(), "png", png);
            out.add(png.toByteArray());
        }
    }
}
