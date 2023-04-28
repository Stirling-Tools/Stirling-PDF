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
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import io.swagger.v3.oas.annotations.Hidden;
import stirling.software.SPDF.utils.PdfUtils;

@RestController
public class ConvertImgPDFController {

    private static final Logger logger = LoggerFactory.getLogger(ConvertImgPDFController.class);

    @PostMapping(consumes = "multipart/form-data", value = "/pdf-to-img")
    public ResponseEntity<Resource> convertToImage(@RequestPart(required = true, value = "fileInput") MultipartFile file, @RequestParam("imageFormat") String imageFormat,
            @RequestParam("singleOrMultiple") String singleOrMultiple, @RequestParam("colorType") String colorType, @RequestParam("dpi") String dpi) throws IOException {

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
        try {
            result = PdfUtils.convertFromPdf(pdfBytes, imageFormat.toUpperCase(), colorTypeResult, singleImage, Integer.valueOf(dpi));
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
                    .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=" + file.getOriginalFilename().replaceFirst("[.][^.]+$", "") + "_convertedToImages.zip")
                    .contentType(MediaType.APPLICATION_OCTET_STREAM).contentLength(resource.contentLength()).body(resource);
        }
    }

    @PostMapping(consumes = "multipart/form-data", value = "/img-to-pdf")
    public ResponseEntity<byte[]> convertToPdf(@RequestPart(required = true, value = "fileInput") MultipartFile[] file,
            @RequestParam(defaultValue = "false", name = "stretchToFit") boolean stretchToFit, @RequestParam(defaultValue = "true", name = "autoRotate") boolean autoRotate)
            throws IOException {
        // Convert the file to PDF and get the resulting bytes
        System.out.println(stretchToFit);
        byte[] bytes = PdfUtils.imageToPdf(file, stretchToFit, autoRotate);
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
