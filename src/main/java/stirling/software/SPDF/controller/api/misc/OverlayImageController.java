package stirling.software.SPDF.controller.api.misc;

import java.io.IOException;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import io.github.pixee.security.Filenames;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.model.api.misc.OverlayImageRequest;
import stirling.software.SPDF.service.CustomPDFDocumentFactory;
import stirling.software.SPDF.utils.PdfUtils;
import stirling.software.SPDF.utils.WebResponseUtils;

@RestController
@RequestMapping("/api/v1/misc")
@Slf4j
@Tag(name = "Misc", description = "Miscellaneous APIs")
@RequiredArgsConstructor
public class OverlayImageController {

    private final CustomPDFDocumentFactory pdfDocumentFactory;

    @PostMapping(consumes = "multipart/form-data", value = "/add-image")
    @Operation(
            summary = "Overlay image onto a PDF file",
            description =
                    "This endpoint overlays an image onto a PDF file at the specified coordinates."
                            + " The image can be overlaid on every page of the PDF if specified. "
                            + " Input:PDF/IMAGE Output:PDF Type:SISO")
    public ResponseEntity<byte[]> overlayImage(@ModelAttribute OverlayImageRequest request) {
        MultipartFile pdfFile = request.getFileInput();
        MultipartFile imageFile = request.getImageFile();
        float x = request.getX();
        float y = request.getY();
        boolean everyPage = Boolean.TRUE.equals(request.getEveryPage());
        try {
            byte[] pdfBytes = pdfFile.getBytes();
            byte[] imageBytes = imageFile.getBytes();
            byte[] result =
                    PdfUtils.overlayImage(
                            pdfDocumentFactory, pdfBytes, imageBytes, x, y, everyPage);

            return WebResponseUtils.bytesToWebResponse(
                    result,
                    Filenames.toSimpleFileName(pdfFile.getOriginalFilename())
                                    .replaceFirst("[.][^.]+$", "")
                            + "_overlayed.pdf");
        } catch (IOException e) {
            log.error("Failed to add image to PDF", e);
            return new ResponseEntity<>(HttpStatus.BAD_REQUEST);
        }
    }
}
