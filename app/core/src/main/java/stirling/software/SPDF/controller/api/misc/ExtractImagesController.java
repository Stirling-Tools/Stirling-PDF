package stirling.software.SPDF.controller.api.misc;

import java.awt.*;
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
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody;

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
    public ResponseEntity<StreamingResponseBody> extractImages(
            @ModelAttribute PDFExtractImagesRequest request) throws IOException {
        MultipartFile file = request.getFileInput();
        String format = request.getFormat();

        String filename = GeneralUtils.removeExtension(file.getOriginalFilename());
        Set<String> processedImages = new HashSet<>();

        TempFile zipTempFile = new TempFile(tempFileManager, ".zip");
        try (ZipOutputStream zos =
                        new ZipOutputStream(Files.newOutputStream(zipTempFile.getPath()));
                PDDocument document = pdfDocumentFactory.load(file)) {

            // Set compression level
            zos.setLevel(Deflater.BEST_COMPRESSION);

            // Single-threaded extraction
            for (int pgNum = 0; pgNum < document.getPages().getCount(); pgNum++) {
                PDPage page = document.getPage(pgNum);
                extractImagesFromPage(page, format, filename, pgNum + 1, processedImages, zos);
            }
            // document and zos closed by try-with-resources
        } catch (Exception e) {
            zipTempFile.close();
            throw e;
        }

        return WebResponseUtils.zipFileToWebResponse(
                zipTempFile, filename + "_extracted-images.zip");
    }

    private void extractImagesFromPage(
            PDPage page,
            String format,
            String filename,
            int pageNum,
            Set<String> processedImages,
            ZipOutputStream zos)
            throws IOException {
        if (page.getResources() == null || page.getResources().getXObjectNames() == null) {
            return;
        }
        int count = 1;
        for (COSName name : page.getResources().getXObjectNames()) {
            try {
                if (page.getResources().isImageXObject(name)) {
                    PDImageXObject image = (PDImageXObject) page.getResources().getXObject(name);
                    String imageHash = String.valueOf(image.hashCode());
                    if (processedImages.contains(imageHash)) {
                        continue; // Skip already processed images
                    }
                    processedImages.add(imageHash);

                    RenderedImage renderedImage = image.getImage();
                    BufferedImage bufferedImage = null;
                    if ("png".equalsIgnoreCase(format)) {
                        bufferedImage =
                                new BufferedImage(
                                        renderedImage.getWidth(),
                                        renderedImage.getHeight(),
                                        BufferedImage.TYPE_INT_ARGB);
                    } else if ("jpeg".equalsIgnoreCase(format) || "jpg".equalsIgnoreCase(format)) {
                        bufferedImage =
                                new BufferedImage(
                                        renderedImage.getWidth(),
                                        renderedImage.getHeight(),
                                        BufferedImage.TYPE_INT_RGB);
                    } else {
                        bufferedImage =
                                new BufferedImage(
                                        renderedImage.getWidth(),
                                        renderedImage.getHeight(),
                                        BufferedImage.TYPE_INT_RGB);
                    }
                    Graphics2D g = bufferedImage.createGraphics();
                    g.drawImage((Image) renderedImage, 0, 0, null);
                    g.dispose();

                    String imageName = filename + "_page_" + pageNum + "_" + count++ + "." + format;
                    ByteArrayOutputStream imageBaos = new ByteArrayOutputStream();
                    ImageIO.write(bufferedImage, format, imageBaos);
                    byte[] imageData = imageBaos.toByteArray();

                    zos.putNextEntry(new ZipEntry(imageName));
                    zos.write(imageData);
                    zos.closeEntry();
                }
            } catch (IOException e) {
                ExceptionUtils.logException("image extraction", e);
                throw ExceptionUtils.handlePdfException(e, "during image extraction");
            }
        }
    }
}
