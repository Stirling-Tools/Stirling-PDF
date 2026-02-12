package stirling.software.SPDF.controller.api.misc;

import java.io.ByteArrayOutputStream;
import java.io.IOException;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.graphics.image.PDImageXObject;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.multipart.MultipartFile;

import io.swagger.v3.oas.annotations.Operation;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.model.api.misc.OverlayImageRequest;
import stirling.software.SPDF.utils.SvgOverlayUtil;
import stirling.software.common.annotations.AutoJobPostMapping;
import stirling.software.common.annotations.api.MiscApi;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.GeneralUtils;
import stirling.software.common.util.WebResponseUtils;

@MiscApi
@Slf4j
@RequiredArgsConstructor
public class OverlayImageController {

    private final CustomPDFDocumentFactory pdfDocumentFactory;

    @AutoJobPostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE, value = "/add-image")
    @Operation(
            summary = "Overlay image onto a PDF file",
            description =
                    "This endpoint overlays an image onto a PDF file at the specified coordinates. "
                            + "Supports both raster formats (PNG, JPEG, etc.) and vector format (SVG). "
                            + "SVG files are rendered as vector graphics for crisp output at any resolution. "
                            + "The image can be overlaid on every page of the PDF if specified. "
                            + "Input:PDF/IMAGE/SVG Output:PDF Type:SISO")
    public ResponseEntity<byte[]> overlayImage(@ModelAttribute OverlayImageRequest request) {
        MultipartFile pdfFile = request.getFileInput();
        MultipartFile imageFile = request.getImageFile();
        float x = request.getX();
        float y = request.getY();
        boolean everyPage = Boolean.TRUE.equals(request.getEveryPage());

        try {
            byte[] pdfBytes = pdfFile.getBytes();
            byte[] imageBytes = imageFile.getBytes();

            boolean isSvg = SvgOverlayUtil.isSvgImage(imageBytes);

            try (PDDocument document = pdfDocumentFactory.load(pdfBytes)) {
                int pages = document.getNumberOfPages();
                for (int i = 0; i < pages; i++) {
                    PDPage page = document.getPage(i);

                    if (isSvg) {
                        SvgOverlayUtil.overlaySvgOnPage(document, page, imageBytes, x, y);
                    } else {
                        try (PDPageContentStream contentStream =
                                new PDPageContentStream(
                                        document,
                                        page,
                                        PDPageContentStream.AppendMode.APPEND,
                                        true,
                                        true)) {
                            PDImageXObject image =
                                    PDImageXObject.createFromByteArray(document, imageBytes, "");
                            contentStream.drawImage(image, x, y);
                            log.info("Image successfully overlaid onto PDF page {}", i);
                        }
                    }

                    if (!everyPage && i == 0) {
                        break;
                    }
                }

                ByteArrayOutputStream baos = new ByteArrayOutputStream();
                document.save(baos);

                byte[] result = baos.toByteArray();
                log.info("PDF with overlaid image successfully created");

                return WebResponseUtils.bytesToWebResponse(
                        result,
                        GeneralUtils.generateFilename(
                                pdfFile.getOriginalFilename(), "_overlayed.pdf"));
            }

        } catch (IOException e) {
            log.error("Failed to add image to PDF", e);
            return new ResponseEntity<>(HttpStatus.BAD_REQUEST);
        }
    }
}
