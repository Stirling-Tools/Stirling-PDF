package stirling.software.SPDF.controller;

import java.io.IOException;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.multipart.MultipartFile;

import stirling.software.SPDF.utils.PdfUtils;

@Controller
public class OverlayImageController {

    private static final Logger logger = LoggerFactory.getLogger(OverlayImageController.class);

    @GetMapping("/add-image")
    public String overlayImage(Model model) {
        model.addAttribute("currentPage", "add-image");
        return "add-image";
    }

    @PostMapping("/add-image")
    public ResponseEntity<byte[]> overlayImage(@RequestParam("fileInput") MultipartFile pdfFile, @RequestParam("fileInput2") MultipartFile imageFile, @RequestParam("x") float x,
            @RequestParam("y") float y) {
        try {
            byte[] pdfBytes = pdfFile.getBytes();
            byte[] imageBytes = imageFile.getBytes();
            byte[] result = PdfUtils.overlayImage(pdfBytes, imageBytes, x, y);

            return PdfUtils.bytesToWebResponse(result, pdfFile.getOriginalFilename().replaceFirst("[.][^.]+$", "") + "_overlayed.pdf");
        } catch (IOException e) {
            logger.error("Failed to add image to PDF", e);
            return new ResponseEntity<>(HttpStatus.BAD_REQUEST);
        }
    }
}
