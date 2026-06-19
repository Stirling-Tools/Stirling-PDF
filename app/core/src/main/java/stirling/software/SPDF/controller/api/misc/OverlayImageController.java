package stirling.software.SPDF.controller.api.misc;

import java.io.IOException;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.graphics.image.PDImageXObject;
import org.jboss.resteasy.reactive.RestForm;
import org.jboss.resteasy.reactive.multipart.FileUpload;

import io.swagger.v3.oas.annotations.Operation;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.model.api.misc.OverlayImageRequest;
import stirling.software.SPDF.utils.SvgOverlayUtil;
import stirling.software.common.annotations.AutoJobPostMapping;
import stirling.software.common.annotations.api.MiscApi;
import stirling.software.common.enumeration.ResourceWeight;
import stirling.software.common.model.MultipartFile;
import stirling.software.common.model.multipart.FileUploadMultipartFile;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.GeneralUtils;
import stirling.software.common.util.SvgSanitizer;
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;
import stirling.software.common.util.WebResponseUtils;

@MiscApi
@Path("/api/v1/misc")
@ApplicationScoped
@Slf4j
@RequiredArgsConstructor
public class OverlayImageController {

    private final CustomPDFDocumentFactory pdfDocumentFactory;
    private final TempFileManager tempFileManager;
    private final SvgSanitizer svgSanitizer;

    @POST
    @Path("/add-image")
    @Consumes(MediaType.MULTIPART_FORM_DATA)
    @AutoJobPostMapping(
            consumes = MediaType.MULTIPART_FORM_DATA,
            value = "/add-image",
            resourceWeight = ResourceWeight.MEDIUM_WEIGHT)
    @Operation(
            summary = "Overlay image onto a PDF file",
            description =
                    "This endpoint overlays an image onto a PDF file at the specified coordinates. "
                            + "Supports both raster formats (PNG, JPEG, etc.) and vector format (SVG). "
                            + "SVG files are rendered as vector graphics for crisp output at any resolution. "
                            + "The image can be overlaid on every page of the PDF if specified. "
                            + "Input:PDF/IMAGE/SVG Output:PDF Type:SISO")
    public Response overlayImage(
            @RestForm("fileInput") FileUpload fileUpload,
            @RestForm("imageFile") FileUpload imageFileUpload,
            @RestForm("x") float xForm,
            @RestForm("y") float yForm,
            @RestForm("everyPage") Boolean everyPageForm) {
        OverlayImageRequest request = new OverlayImageRequest();
        request.setFileInput(FileUploadMultipartFile.of(fileUpload));
        request.setImageFile(FileUploadMultipartFile.of(imageFileUpload));
        request.setX(xForm);
        request.setY(yForm);
        request.setEveryPage(everyPageForm);

        MultipartFile pdfFile = request.getFileInput();
        MultipartFile imageFile = request.getImageFile();
        float x = request.getX();
        float y = request.getY();
        boolean everyPage = Boolean.TRUE.equals(request.getEveryPage());

        try {
            byte[] pdfBytes = pdfFile.getBytes();
            byte[] imageBytes = imageFile.getBytes();

            boolean isSvg = SvgOverlayUtil.isSvgImage(imageBytes);
            if (isSvg) {
                imageBytes = svgSanitizer.sanitize(imageBytes);
            }

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

                TempFile tempOut = tempFileManager.createManagedTempFile(".pdf");
                try {
                    document.save(tempOut.getFile());
                } catch (IOException e) {
                    tempOut.close();
                    throw e;
                }
                log.info("PDF with overlaid image successfully created");

                return WebResponseUtils.pdfFileToWebResponse(
                        tempOut,
                        GeneralUtils.generateFilename(
                                pdfFile.getOriginalFilename(), "_overlayed.pdf"));
            }

        } catch (IOException e) {
            log.error("Failed to add image to PDF", e);
            return Response.status(Response.Status.BAD_REQUEST).build();
        }
    }
}
