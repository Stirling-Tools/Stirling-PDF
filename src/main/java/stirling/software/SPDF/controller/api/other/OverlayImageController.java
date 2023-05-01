package stirling.software.SPDF.controller.api.other;

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

import stirling.software.SPDF.utils.PdfUtils;

@RestController
public class OverlayImageController {

    private static final Logger logger = LoggerFactory.getLogger(OverlayImageController.class);

    @PostMapping(consumes = "multipart/form-data", value = "/add-image")
    public ResponseEntity<byte[]> overlayImage(@RequestPart(required = true, value = "fileInput") MultipartFile pdfFile, @RequestParam("fileInput2") MultipartFile imageFile,
            @RequestParam("x") float x, @RequestParam("y") float y, @RequestParam("everyPage") boolean everyPage) {
        try {
            byte[] pdfBytes = pdfFile.getBytes();
            byte[] imageBytes = imageFile.getBytes();
            byte[] result = PdfUtils.overlayImage(pdfBytes, imageBytes, x, y, everyPage);

            return PdfUtils.bytesToWebResponse(result, pdfFile.getOriginalFilename().replaceFirst("[.][^.]+$", "") + "_overlayed.pdf");
        } catch (IOException e) {
            logger.error("Failed to add image to PDF", e);
            return new ResponseEntity<>(HttpStatus.BAD_REQUEST);
        }
    }
}
