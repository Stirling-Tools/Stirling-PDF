package stirling.software.SPDF.controller.api.converters;

import java.io.IOException;
import java.net.URLConnection;

import org.apache.pdfbox.rendering.ImageType;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import io.github.pixee.security.Filenames;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;

import stirling.software.SPDF.model.api.converters.ConvertToImageRequest;
import stirling.software.SPDF.model.api.converters.ConvertToPdfRequest;
import stirling.software.SPDF.utils.PdfUtils;
import stirling.software.SPDF.utils.WebResponseUtils;

@RestController
@RequestMapping("/api/v1/convert")
@Tag(name = "Convert", description = "Convert APIs")
public class ConvertImgPDFController {

    private static final Logger logger = LoggerFactory.getLogger(ConvertImgPDFController.class);

    @PostMapping(consumes = "multipart/form-data", value = "/pdf/img")
    @Operation(
            summary = "Convert PDF to image(s)",
            description =
                    "This endpoint converts a PDF file to image(s) with the specified image format, color type, and DPI. Users can choose to get a single image or multiple images.  Input:PDF Output:Image Type:SI-Conditional")
    public ResponseEntity<byte[]> convertToImage(@ModelAttribute ConvertToImageRequest request)
            throws NumberFormatException, Exception {
        MultipartFile file = request.getFileInput();
        String imageFormat = request.getImageFormat();
        String singleOrMultiple = request.getSingleOrMultiple();
        String colorType = request.getColorType();
        String dpi = request.getDpi();

        byte[] pdfBytes = file.getBytes();
        ImageType colorTypeResult = ImageType.RGB;
        if ("greyscale".equals(colorType)) {
            colorTypeResult = ImageType.GRAY;
        } else if ("blackwhite".equals(colorType)) {
            colorTypeResult = ImageType.BINARY;
        }
        // returns bytes for image
        boolean singleImage = "single".equals(singleOrMultiple);
        byte[] result = null;
        String filename =
                Filenames.toSimpleFileName(file.getOriginalFilename())
                        .replaceFirst("[.][^.]+$", "");

        result =
                PdfUtils.convertFromPdf(
                        pdfBytes,
                        imageFormat.toUpperCase(),
                        colorTypeResult,
                        singleImage,
                        Integer.valueOf(dpi),
                        filename);

        if (result == null || result.length == 0) {
            logger.error("resultant bytes for {} is null, error converting ", filename);
        }
        if (singleImage) {
            String docName = filename + "." + imageFormat;
            MediaType mediaType = MediaType.parseMediaType(getMediaType(imageFormat));
            return WebResponseUtils.bytesToWebResponse(result, docName, mediaType);
        } else {
            String zipFilename = filename + "_convertedToImages.zip";
            return WebResponseUtils.bytesToWebResponse(
                    result, zipFilename, MediaType.APPLICATION_OCTET_STREAM);
        }
    }

    @PostMapping(consumes = "multipart/form-data", value = "/img/pdf")
    @Operation(
            summary = "Convert images to a PDF file",
            description =
                    "This endpoint converts one or more images to a PDF file. Users can specify whether to stretch the images to fit the PDF page, and whether to automatically rotate the images. Input:Image Output:PDF Type:MISO")
    public ResponseEntity<byte[]> convertToPdf(@ModelAttribute ConvertToPdfRequest request)
            throws IOException {
        MultipartFile[] file = request.getFileInput();
        String fitOption = request.getFitOption();
        String colorType = request.getColorType();
        boolean autoRotate = request.isAutoRotate();

        // Convert the file to PDF and get the resulting bytes
        byte[] bytes = PdfUtils.imageToPdf(file, fitOption, autoRotate, colorType);
        return WebResponseUtils.bytesToWebResponse(
                bytes,
                file[0].getOriginalFilename().replaceFirst("[.][^.]+$", "") + "_converted.pdf");
    }

    private String getMediaType(String imageFormat) {
        String mimeType = URLConnection.guessContentTypeFromName("." + imageFormat);
        return "null".equals(mimeType) ? "application/octet-stream" : mimeType;
    }
}
