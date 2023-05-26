package stirling.software.SPDF.controller.api.converters;

import java.io.IOException;

import org.apache.pdfbox.rendering.ImageType;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
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
import stirling.software.SPDF.utils.PdfUtils;
@RestController
public class ConvertImgPDFController {

    private static final Logger logger = LoggerFactory.getLogger(ConvertImgPDFController.class);

    @PostMapping(consumes = "multipart/form-data", value = "/pdf-to-img")
    @Operation(summary = "Convert PDF to image(s)",
            description = "This endpoint converts a PDF file to image(s) with the specified image format, color type, and DPI. Users can choose to get a single image or multiple images.")
    public ResponseEntity<Resource> convertToImage(
            @RequestPart(required = true, value = "fileInput")
            @Parameter(description = "The input PDF file to be converted")
                    MultipartFile file,
            @RequestParam("imageFormat")
            @Parameter(description = "The output image format", schema = @Schema(allowableValues = {"png", "jpeg", "jpg", "gif"}))
                    String imageFormat,
            @RequestParam("singleOrMultiple")
            @Parameter(description = "Choose between a single image containing all pages or separate images for each page", schema = @Schema(allowableValues = {"single", "multiple"}))
                    String singleOrMultiple,
            @RequestParam("colorType")
            @Parameter(description = "The color type of the output image(s)", schema = @Schema(allowableValues = {"rgb", "greyscale", "blackwhite"}))
                    String colorType,
            @RequestParam("dpi")
            @Parameter(description = "The DPI (dots per inch) for the output image(s)")
                    String dpi) throws IOException {

        byte[] pdfBytes = file.getBytes();
        ImageType colorTypeResult = ImageType.RGB;
        if ("greyscale".equals(colorType)) {
            colorTypeResult = ImageType.GRAY;
        } else if ("blackwhite".equals(colorType)) {
            colorTypeResult = ImageType.BINARY;
        }
        // returns bytes for image
        boolean singleImage = singleOrMultiple.equals("single");
        byte[] result = null;
        String filename = file.getOriginalFilename().replaceFirst("[.][^.]+$", "");
        try {
            result = PdfUtils.convertFromPdf(pdfBytes, imageFormat.toUpperCase(), colorTypeResult, singleImage, Integer.valueOf(dpi), filename);
        } catch (IOException e) {
            // TODO Auto-generated catch block
            e.printStackTrace();
        } catch (Exception e) {
            // TODO Auto-generated catch block
            e.printStackTrace();
        }
        if (singleImage) {
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.parseMediaType(getMediaType(imageFormat)));
            ResponseEntity<Resource> response = new ResponseEntity<>(new ByteArrayResource(result), headers, HttpStatus.OK);
            return response;
        } else {
            ByteArrayResource resource = new ByteArrayResource(result);
            // return the Resource in the response
            return ResponseEntity.ok()
                    .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=" + filename + "_convertedToImages.zip")
                    .contentType(MediaType.APPLICATION_OCTET_STREAM).contentLength(resource.contentLength()).body(resource);
        }
    }

    @PostMapping(consumes = "multipart/form-data", value = "/img-to-pdf")
    @Operation(summary = "Convert images to a PDF file",
            description = "This endpoint converts one or more images to a PDF file. Users can specify whether to stretch the images to fit the PDF page, and whether to automatically rotate the images.")
    public ResponseEntity<byte[]> convertToPdf(
            @RequestPart(required = true, value = "fileInput")
            @Parameter(description = "The input images to be converted to a PDF file")
                    MultipartFile[] file,
            @RequestParam(defaultValue = "false", name = "stretchToFit")
            @Parameter(description = "Whether to stretch the images to fit the PDF page or maintain the aspect ratio", example = "false")
                    boolean stretchToFit,
            @RequestParam("colorType")
            @Parameter(description = "The color type of the output image(s)", schema = @Schema(allowableValues = {"rgb", "greyscale", "blackwhite"}))
                    String colorType,
            @RequestParam(defaultValue = "false", name = "autoRotate")
            @Parameter(description = "Whether to automatically rotate the images to better fit the PDF page", example = "true")
                    boolean autoRotate) throws IOException {
        // Convert the file to PDF and get the resulting bytes
        byte[] bytes = PdfUtils.imageToPdf(file, stretchToFit, autoRotate, colorType);
        return PdfUtils.bytesToWebResponse(bytes, file[0].getOriginalFilename().replaceFirst("[.][^.]+$", "") + "_coverted.pdf");
    }

    private String getMediaType(String imageFormat) {
        if (imageFormat.equalsIgnoreCase("PNG"))
            return "image/png";
        else if (imageFormat.equalsIgnoreCase("JPEG") || imageFormat.equalsIgnoreCase("JPG"))
            return "image/jpeg";
        else if (imageFormat.equalsIgnoreCase("GIF"))
            return "image/gif";
        else
            return "application/octet-stream";
    }


}
