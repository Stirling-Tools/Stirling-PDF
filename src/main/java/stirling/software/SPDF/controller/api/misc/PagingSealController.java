package stirling.software.SPDF.controller.api.misc;

import java.awt.image.BufferedImage;
import java.io.IOException;

import javax.imageio.ImageIO;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.graphics.image.LosslessFactory;
import org.apache.pdfbox.pdmodel.graphics.image.PDImageXObject;
import org.apache.pdfbox.pdmodel.graphics.state.PDExtendedGraphicsState;
import org.apache.pdfbox.util.Matrix;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import io.github.pixee.security.Filenames;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;

import stirling.software.SPDF.model.api.misc.PagingSealRequest;
import stirling.software.SPDF.utils.WebResponseUtils;

/**
 * @author huagnxiong
 */
@RestController
@RequestMapping("/api/v1/misc")
@Tag(name = "Misc", description = "Miscellaneous APIs")
public class PagingSealController {

    @PostMapping(consumes = "multipart/form-data", value = "/paging-seal")
    @Operation(
            summary = "Add paging seal  to a PDF file",
            description =
                    "This endpoint adds a paging seal to a given PDF file. Users can specify the seal type (image),  opacity, and height spacer. Input:PDF Output:PDF Type:SISO")
    public ResponseEntity<byte[]> addPagingSeal(@ModelAttribute PagingSealRequest request)
            throws IOException {
        MultipartFile pdfFile = request.getFileInput();
        MultipartFile stampImage = request.getSealImage();
        float sealSize = request.getSealSize();
        float drawY = request.getDrawY();
        float firstPageSealRate = request.getFirstPageSealRate();
        float opacity = request.getSealOpacity();

        PDDocument document = Loader.loadPDF(pdfFile.getBytes());
        BufferedImage sourceImage = ImageIO.read(stampImage.getInputStream());

        int numberOfPages = document.getNumberOfPages();
        int remainPage = numberOfPages - 1;

        // scaled image
        BufferedImage image = scaledImage(sealSize, sourceImage);

        int firstPageStampWidth = 0;
        int otherPageStampWidth = 0;
        // The proportion of the first page
        if (firstPageSealRate > 0.0f) {
            firstPageStampWidth = ((Float) (image.getWidth() * firstPageSealRate)).intValue();
            otherPageStampWidth = (image.getWidth() - firstPageStampWidth) / remainPage;
        } else {
            // average every page
            firstPageStampWidth = otherPageStampWidth = image.getWidth() / numberOfPages;
        }

        // Balance the width of the first page
        int remainWidth = image.getWidth() - firstPageStampWidth;
        if (remainWidth != otherPageStampWidth * remainPage) {
            firstPageStampWidth += remainWidth - otherPageStampWidth * remainPage;
        }

        // set opacity
        PDExtendedGraphicsState graphicsState = new PDExtendedGraphicsState();
        graphicsState.setNonStrokingAlphaConstant(opacity);

        // foreach the pdf and sealed
        BufferedImage croppedImg;
        PDImageXObject sealImage;
        for (int i = 0; i < numberOfPages; i++) {
            PDPage page = document.getPage(i);
            PDRectangle pageSize = page.getMediaBox();
            int stampWidth = i == 0 ? firstPageStampWidth : otherPageStampWidth;
            int stampX = i == 0 ? 0 : firstPageStampWidth + (i - 1) * stampWidth;
            croppedImg = image.getSubimage(stampX, 0, stampWidth, image.getHeight());

            // Create the PDImageXObject for the seal image
            sealImage = LosslessFactory.createFromImage(document, croppedImg);
            // create PDPageContentStream
            try (PDPageContentStream contentStream =
                    new PDPageContentStream(
                            document, page, PDPageContentStream.AppendMode.APPEND, true, true)) {
                float startX = pageSize.getUpperRightX() - sealImage.getWidth();
                // transform and drawImage
                contentStream.setGraphicsStateParameters(graphicsState);
                contentStream.transform(Matrix.getTranslateInstance(startX, drawY));
                contentStream.drawImage(sealImage, 0, 0);
            }
        }

        return WebResponseUtils.pdfDocToWebResponse(
                document,
                Filenames.toSimpleFileName(pdfFile.getOriginalFilename())
                                .replaceFirst("[.][^.]+$", "")
                        + "_sealed.pdf");
    }

    private BufferedImage scaledImage(float sealSize, BufferedImage sourceImage) {
        if (sealSize > 0.0f) {
            // Desired physical height (in PDF points)
            Float desiredPhysicalHeight = sealSize;
            // Compute width based on original aspect ratio
            float aspectRatio = (float) sourceImage.getWidth() / (float) sourceImage.getHeight();
            // Desired physical width based on the aspect ratio
            Float desiredPhysicalWidth = desiredPhysicalHeight * aspectRatio;
            BufferedImage image =
                    new BufferedImage(
                            desiredPhysicalWidth.intValue(),
                            desiredPhysicalHeight.intValue(),
                            BufferedImage.TYPE_INT_ARGB);
            image.getGraphics()
                    .drawImage(sourceImage, 0, 0, image.getWidth(), image.getHeight(), null);
            return image;
        }
        return sourceImage;
    }
}
