package stirling.software.SPDF.controller.api.misc;

import java.awt.Graphics2D;
import java.awt.Image;
import java.awt.image.BufferedImage;
import java.awt.image.RenderedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
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
import stirling.software.common.service.CustomPDFDocumentFactory;
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

    @AutoJobPostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE, value = "/extract-images")
    @MultiFileResponse
    @Operation(
            summary = "Extract images from a PDF file",
            description =
                    "This endpoint extracts images from a given PDF file and returns them in a zip"
                            + " file. Users can specify the output image format. Input:PDF"
                            + " Output:IMAGE/ZIP Type:SIMO")
    public ResponseEntity<Resource> extractImages(@ModelAttribute PDFExtractImagesRequest request)
            throws IOException {
        MultipartFile file = request.getFileInput();
        String imageFormat = request.getFormat();

        String baseFilename = GeneralUtils.removeExtension(file.getOriginalFilename());
        Set<Integer> processedImageHashes = new HashSet<>();

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
                        processedImageHashes,
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
            Set<Integer> seenImageHashes,
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
                int imageHashCode = imageObject.hashCode();

                if (seenImageHashes.contains(imageHashCode)) {
                    continue;
                }
                seenImageHashes.add(imageHashCode);

                RenderedImage sourceImage = imageObject.getImage();
                BufferedImage convertedImage = convertImageToFormat(sourceImage, imageFormat);

                String imagePath =
                        baseFilename
                                + "_page_"
                                + pageNumber
                                + "_"
                                + imageCount++
                                + "."
                                + imageFormat;
                ByteArrayOutputStream imageBuffer = new ByteArrayOutputStream();
                ImageIO.write(convertedImage, imageFormat, imageBuffer);

                zipOutput.putNextEntry(new ZipEntry(imagePath));
                zipOutput.write(imageBuffer.toByteArray());
                zipOutput.closeEntry();

            } catch (IOException e) {
                ExceptionUtils.logException("image extraction failed", e);
                throw ExceptionUtils.handlePdfException(e, "during image extraction");
            }
        }
    }

    private BufferedImage convertImageToFormat(RenderedImage source, String format) {
        int width = source.getWidth();
        int height = source.getHeight();

        int imageType = BufferedImage.TYPE_INT_RGB;
        if ("png".equalsIgnoreCase(format)) {
            imageType = BufferedImage.TYPE_INT_ARGB;
        }

        BufferedImage result = new BufferedImage(width, height, imageType);
        Graphics2D graphics = result.createGraphics();
        graphics.drawImage((Image) source, 0, 0, null);
        graphics.dispose();

        return result;
    }
}
