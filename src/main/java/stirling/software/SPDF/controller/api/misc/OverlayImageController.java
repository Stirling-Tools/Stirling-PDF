package stirling.software.SPDF.controller.api.misc;

import java.io.IOException;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.tags.Tag;
import stirling.software.SPDF.utils.PdfUtils;
import stirling.software.SPDF.utils.WebResponseUtils;

@RestController
@Tag(name = "Other", description = "Other APIs")
public class OverlayImageController {

    private static final Logger logger = LoggerFactory.getLogger(OverlayImageController.class);

    @PostMapping(consumes = "multipart/form-data", value = "/add-image")
    @Operation(
        summary = "Overlay image onto a PDF file",
        description = "This endpoint overlays an image onto a PDF file at the specified coordinates. The image can be overlaid on every page of the PDF if specified.  Input:PDF/IMAGE Output:PDF Type:MF-SISO"
    )
    public ResponseEntity<byte[]> overlayImage(
        @RequestPart(required = true, value = "fileInput")
        @Parameter(description = "The input PDF file to overlay the image onto.", required = true)
            MultipartFile pdfFile,
        @RequestParam("fileInput2")
        @Parameter(description = "The image file to be overlaid onto the PDF.", required = true)
            MultipartFile imageFile,
        @RequestParam("x")
        @Parameter(description = "The x-coordinate at which to place the top-left corner of the image.", example = "0")
            float x,
        @RequestParam("y")
        @Parameter(description = "The y-coordinate at which to place the top-left corner of the image.", example = "0")
            float y,
        @RequestParam("everyPage")
        @Parameter(description = "Whether to overlay the image onto every page of the PDF.", example = "false")
            boolean everyPage) {
        try {
            byte[] pdfBytes = pdfFile.getBytes();
            byte[] imageBytes = imageFile.getBytes();
            byte[] result = PdfUtils.overlayImage(pdfBytes, imageBytes, x, y, everyPage);

            return WebResponseUtils.bytesToWebResponse(result, pdfFile.getOriginalFilename().replaceFirst("[.][^.]+$", "") + "_overlayed.pdf");
        } catch (IOException e) {
            logger.error("Failed to add image to PDF", e);
            return new ResponseEntity<>(HttpStatus.BAD_REQUEST);
        }
    }
}
