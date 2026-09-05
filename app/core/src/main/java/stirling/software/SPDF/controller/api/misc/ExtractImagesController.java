package stirling.software.SPDF.controller.api.misc;

import java.awt.Graphics2D;
import java.awt.Image;
import java.awt.image.BufferedImage;
import java.awt.image.RenderedImage;
import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.util.HashSet;
import java.util.Set;
import java.util.zip.Deflater;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

import javax.imageio.ImageIO;

import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.graphics.image.PDImageXObject;
import org.springframework.core.io.Resource;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.multipart.MultipartFile;

import io.swagger.v3.oas.annotations.Operation;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.config.swagger.MultiFileResponse;
import stirling.software.SPDF.model.api.PDFExtractImagesRequest;
import stirling.software.common.annotations.AutoJobPostMapping;
import stirling.software.common.annotations.api.MiscApi;
import stirling.software.common.enumeration.ResourceWeight;
import stirling.software.common.model.tool.ToolArity;
import stirling.software.common.model.tool.ToolFormat;
import stirling.software.common.model.tool.ToolIO;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.ChecksumUtils;
import stirling.software.common.util.ExceptionUtils;
import stirling.software.common.util.GeneralUtils;
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;
import stirling.software.common.util.WebResponseUtils;

@MiscApi
@Slf4j
@RequiredArgsConstructor
public class ExtractImagesController {

    private final CustomPDFDocumentFactory pdfDocumentFactory;
    private final TempFileManager tempFileManager;

    @AutoJobPostMapping(
            consumes = MediaType.MULTIPART_FORM_DATA_VALUE,
            value = "/extract-images",
            resourceWeight = ResourceWeight.MEDIUM_WEIGHT)
    @MultiFileResponse
    @ToolIO(produces = ToolFormat.IMAGE, arity = ToolArity.SIMO)
    @Operation(
            summary = "Extract images from a PDF file",
            description =
                    "This endpoint extracts images from a given PDF file and returns them in a zip"
                            + " file. Users can specify the output image format.")
    public ResponseEntity<Resource> extractImages(@ModelAttribute PDFExtractImagesRequest request)
            throws IOException {
        MultipartFile file = request.getFileInput();
        String imageFormat = request.getFormat();

        String baseFilename = GeneralUtils.removeExtension(file.getOriginalFilename());
        Set<String> processedImageKeys = new HashSet<>();

        TempFile zipFile = new TempFile(tempFileManager, ".zip");
        try (ZipOutputStream zipStream =
                        new ZipOutputStream(Files.newOutputStream(zipFile.getPath()));
                PDDocument pdfDoc = pdfDocumentFactory.load(file)) {

            zipStream.setLevel(Deflater.BEST_COMPRESSION);

            int totalPages = pdfDoc.getNumberOfPages();
            for (int pageIndex = 0; pageIndex < totalPages; pageIndex++) {
                PDPage currentPage = pdfDoc.getPage(pageIndex);
                extractAndAddImagesToZip(
                        currentPage,
                        imageFormat,
                        baseFilename,
                        pageIndex + 1,
                        processedImageKeys,
                        zipStream);
            }
        } catch (Exception e) {
            zipFile.close();
            throw e;
        }

        return WebResponseUtils.zipFileToWebResponse(
                zipFile, baseFilename + "_extracted-images.zip");
    }

    private void extractAndAddImagesToZip(
            PDPage page,
            String imageFormat,
            String baseFilename,
            int pageNumber,
            Set<String> seenImageKeys,
            ZipOutputStream zipOutput)
            throws IOException {
        if (page.getResources() == null || page.getResources().getXObjectNames() == null) {
            return;
        }

        int imageCount = 1;
        for (COSName resourceName : page.getResources().getXObjectNames()) {
            if (!page.getResources().isImageXObject(resourceName)) {
                continue;
            }

            try {
                PDImageXObject imageObject =
                        (PDImageXObject) page.getResources().getXObject(resourceName);

                String imageKey = imageContentKey(imageObject);
                if (imageKey != null && !seenImageKeys.add(imageKey)) {
                    continue;
                }

                RenderedImage sourceImage = imageObject.getImage();
                RenderedImage outputImage = toWritableImage(sourceImage, imageFormat);

                String imagePath =
                        baseFilename
                                + "_page_"
                                + pageNumber
                                + "_"
                                + imageCount++
                                + "."
                                + imageFormat;

                zipOutput.putNextEntry(new ZipEntry(imagePath));
                if (!ImageIO.write(outputImage, imageFormat, zipOutput)) {
                    throw ExceptionUtils.createIllegalArgumentException(
                            "error.unsupportedImageFormat",
                            "No image writer is available for format {0}.",
                            imageFormat);
                }
                zipOutput.closeEntry();

            } catch (IOException e) {
                ExceptionUtils.logException("image extraction failed", e);
                throw ExceptionUtils.handlePdfException(e, "during image extraction");
            }
        }
    }

    /**
     * Content fingerprint identifying one embedded image, used to extract a repeated image only
     * once. Hashes the encoded stream rather than the decoded pixels, so it costs a read of the
     * already-compressed bytes.
     *
     * @return null when the image cannot be hashed, meaning it must be extracted rather than
     *     treated as a duplicate
     */
    private static String imageContentKey(PDImageXObject image) {
        try (InputStream raw = image.getCOSObject().createRawInputStream()) {
            return ChecksumUtils.checksum(raw, "SHA-256")
                    + '_'
                    + image.getWidth()
                    + 'x'
                    + image.getHeight()
                    + '_'
                    + image.getBitsPerComponent();
        } catch (IOException e) {
            log.warn("Could not fingerprint embedded image, extracting it without dedup", e);
            return null;
        }
    }

    /**
     * Returns an image ImageIO can write in {@code format}, reusing {@code source} when it is
     * already compatible. Redrawing costs a second full-size buffer, so it is avoided when the
     * decoded image already has the type the format needs.
     */
    private RenderedImage toWritableImage(RenderedImage source, String format) {
        int requiredType =
                "png".equalsIgnoreCase(format)
                        ? BufferedImage.TYPE_INT_ARGB
                        : BufferedImage.TYPE_INT_RGB;

        if (source instanceof BufferedImage buffered && buffered.getType() == requiredType) {
            return buffered;
        }

        BufferedImage result =
                new BufferedImage(source.getWidth(), source.getHeight(), requiredType);
        Graphics2D graphics = result.createGraphics();
        graphics.drawImage((Image) source, 0, 0, null);
        graphics.dispose();

        return result;
    }
}
