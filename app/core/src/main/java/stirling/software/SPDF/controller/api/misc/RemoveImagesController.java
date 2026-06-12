package stirling.software.SPDF.controller.api.misc;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;

import org.apache.pdfbox.cos.COSDictionary;
import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDResources;
import org.apache.pdfbox.pdmodel.graphics.PDXObject;
import org.apache.pdfbox.pdmodel.graphics.form.PDFormXObject;
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

import stirling.software.common.annotations.AutoJobPostMapping;
import stirling.software.common.annotations.api.GeneralApi;
import stirling.software.common.enumeration.ResourceWeight;
import stirling.software.common.model.MultipartFile;
import stirling.software.common.model.api.PDFFile;
import stirling.software.common.model.multipart.FileUploadMultipartFile;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.ExceptionUtils;
import stirling.software.common.util.GeneralUtils;
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;
import stirling.software.common.util.WebResponseUtils;

@GeneralApi
@Slf4j
@ApplicationScoped
@Path("/api/v1/general")
@RequiredArgsConstructor
public class RemoveImagesController {

    private final CustomPDFDocumentFactory pdfDocumentFactory;
    private final TempFileManager tempFileManager;

    @POST
    @Path("/remove-image-pdf")
    @Consumes(MediaType.MULTIPART_FORM_DATA)
    @AutoJobPostMapping(
            consumes = MediaType.MULTIPART_FORM_DATA,
            value = "/remove-image-pdf",
            resourceWeight = ResourceWeight.MEDIUM_WEIGHT)
    @Operation(
            summary = "Remove images from PDF",
            description =
                    "This endpoint removes all embedded images from a PDF file and returns the"
                            + " modified document. Input:PDF Output:PDF Type:SISO")
    public Response removeImages(
            @RestForm("fileInput") FileUpload fileUpload, @RestForm("fileId") String fileId)
            throws IOException {

        PDFFile request = new PDFFile();
        request.setFileInput(FileUploadMultipartFile.of(fileUpload));
        request.setFileId(fileId);

        MultipartFile inputFile = request.getFileInput();

        try (PDDocument pdfDoc = pdfDocumentFactory.load(request)) {

            int totalPages = pdfDoc.getNumberOfPages();
            int imagesRemoved = 0;

            for (int pageIndex = 0; pageIndex < totalPages; pageIndex++) {
                PDPage currentPage = pdfDoc.getPage(pageIndex);
                imagesRemoved += removeImagesFromPage(currentPage);
            }

            log.info("Removed {} images from PDF with {} pages", imagesRemoved, totalPages);

            TempFile tempOut = tempFileManager.createManagedTempFile(".pdf");
            try {
                pdfDoc.save(tempOut.getFile());
            } catch (IOException e) {
                tempOut.close();
                throw e;
            }

            return WebResponseUtils.pdfFileToWebResponse(
                    tempOut,
                    GeneralUtils.generateFilename(
                            inputFile.getOriginalFilename(), "_images_removed.pdf"));

        } catch (IOException e) {
            throw ExceptionUtils.handlePdfException(e, "during image removal");
        }
    }

    private int removeImagesFromPage(PDPage page) throws IOException {
        int imagesRemoved = 0;

        PDResources resources = page.getResources();
        if (resources == null) {
            return imagesRemoved;
        }

        imagesRemoved += removeImagesFromResources(resources);
        return imagesRemoved;
    }

    private int removeImagesFromFormXObject(PDFormXObject formXObject) throws IOException {
        PDResources resources = formXObject.getResources();
        if (resources == null) {
            return 0;
        }

        return removeImagesFromResources(resources);
    }

    private int removeImagesFromResources(PDResources resources) throws IOException {
        if (resources == null) {
            return 0;
        }

        COSDictionary xObjects = resources.getCOSObject().getCOSDictionary(COSName.XOBJECT);
        if (xObjects == null) {
            return 0;
        }

        int imagesRemoved = 0;
        // Create snapshot to safely iterate while removing
        List<COSName> names = new ArrayList<>(xObjects.keySet());

        for (COSName name : names) {
            try {
                PDXObject xObject = resources.getXObject(name);
                if (xObject == null) {
                    continue;
                }

                // Remove direct images
                if (xObject instanceof PDImageXObject) {
                    xObjects.removeItem(name);
                    imagesRemoved++;
                    log.debug("Removed image: {}", name.getName());
                }
                // Recursively process nested form XObjects
                else if (xObject instanceof PDFormXObject form) {
                    imagesRemoved += removeImagesFromResources(form.getResources());
                }
            } catch (IOException e) {
                log.warn("Error processing XObject {}: {}", name.getName(), e.getMessage());
            }
        }

        return imagesRemoved;
    }
}
