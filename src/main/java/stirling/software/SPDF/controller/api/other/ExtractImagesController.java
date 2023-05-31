package stirling.software.SPDF.controller.api.other;

import java.awt.Graphics2D;
import java.awt.Image;
import java.awt.image.BufferedImage;
import java.awt.image.RenderedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.zip.Deflater;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

import javax.imageio.ImageIO;

import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.graphics.image.PDImageXObject;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Schema;
import stirling.software.SPDF.utils.WebResponseUtils;
@RestController
public class ExtractImagesController {

    private static final Logger logger = LoggerFactory.getLogger(ExtractImagesController.class);

    @PostMapping(consumes = "multipart/form-data", value = "/extract-images")
    @Operation(summary = "Extract images from a PDF file",
            description = "This endpoint extracts images from a given PDF file and returns them in a zip file. Users can specify the output image format.")
    public ResponseEntity<byte[]> extractImages(
            @RequestPart(required = true, value = "fileInput")
            @Parameter(description = "The input PDF file containing images")
                    MultipartFile file,
            @RequestParam("format")
            @Parameter(description = "The output image format e.g., 'png', 'jpeg', or 'gif'", schema = @Schema(allowableValues = {"png", "jpeg", "gif"}))
                    String format) throws IOException {

        System.out.println(System.currentTimeMillis() + "file=" + file.getName() + ", format=" + format);
        PDDocument document = PDDocument.load(file.getBytes());

        // Create ByteArrayOutputStream to write zip file to byte array
        ByteArrayOutputStream baos = new ByteArrayOutputStream();

        // Create ZipOutputStream to create zip file
        ZipOutputStream zos = new ZipOutputStream(baos);

        // Set compression level
        zos.setLevel(Deflater.BEST_COMPRESSION);

        int imageIndex = 1;
        String filename = file.getOriginalFilename().replaceFirst("[.][^.]+$", "");
        int pageNum = 1;
        // Iterate over each page
        for (PDPage page : document.getPages()) {
            ++pageNum;
            // Extract images from page
            for (COSName name : page.getResources().getXObjectNames()) {
                if (page.getResources().isImageXObject(name)) {
                    PDImageXObject image = (PDImageXObject) page.getResources().getXObject(name);

                    // Convert image to desired format
                    RenderedImage renderedImage = image.getImage();
                    BufferedImage bufferedImage = null;
                    if (format.equalsIgnoreCase("png")) {
                        bufferedImage = new BufferedImage(renderedImage.getWidth(), renderedImage.getHeight(), BufferedImage.TYPE_INT_ARGB);
                    } else if (format.equalsIgnoreCase("jpeg") || format.equalsIgnoreCase("jpg")) {
                        bufferedImage = new BufferedImage(renderedImage.getWidth(), renderedImage.getHeight(), BufferedImage.TYPE_INT_RGB);
                    } else if (format.equalsIgnoreCase("gif")) {
                        bufferedImage = new BufferedImage(renderedImage.getWidth(), renderedImage.getHeight(), BufferedImage.TYPE_BYTE_INDEXED);
                    }

                    // Write image to zip file
                    String imageName = filename + "_" + imageIndex + " (Page " + pageNum + ")." + format;
                    ZipEntry zipEntry = new ZipEntry(imageName);
                    zos.putNextEntry(zipEntry);

                    Graphics2D g = bufferedImage.createGraphics();
                    g.drawImage((Image) renderedImage, 0, 0, null);
                    g.dispose();
                    // Write image bytes to zip file
                    ByteArrayOutputStream imageBaos = new ByteArrayOutputStream();
                    ImageIO.write(bufferedImage, format, imageBaos);
                    zos.write(imageBaos.toByteArray());

                    zos.closeEntry();
                    imageIndex++;
                }
            }
        }

        // Close ZipOutputStream and PDDocument
        zos.close();
        document.close();

        // Create ByteArrayResource from byte array
        byte[] zipContents = baos.toByteArray();

        return WebResponseUtils.boasToWebResponse(baos, filename + "_extracted-images.zip", MediaType.APPLICATION_OCTET_STREAM);
    }

}
