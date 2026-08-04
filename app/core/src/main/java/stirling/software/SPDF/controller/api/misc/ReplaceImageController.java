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
import org.springframework.core.io.Resource;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.multipart.MultipartFile;

import io.swagger.v3.oas.annotations.Operation;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.model.api.misc.ReplaceImageRequest;
import stirling.software.common.annotations.AutoJobPostMapping;
import stirling.software.common.annotations.api.MiscApi;
import stirling.software.common.enumeration.ResourceWeight;
import stirling.software.common.model.tool.ToolFormat;
import stirling.software.common.model.tool.ToolIO;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.ExceptionUtils;
import stirling.software.common.util.GeneralUtils;
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;
import stirling.software.common.util.WebResponseUtils;

@MiscApi
@Slf4j
@RequiredArgsConstructor
public class ReplaceImageController {

    private final CustomPDFDocumentFactory pdfDocumentFactory;
    private final TempFileManager tempFileManager;

    @AutoJobPostMapping(
            consumes = MediaType.MULTIPART_FORM_DATA_VALUE,
            value = "/replace-image",
            resourceWeight = ResourceWeight.MEDIUM_WEIGHT)
    @ToolIO(produces = ToolFormat.PDF)
    @Operation(
            summary = "Replace images in PDF",
            description =
                    "This endpoint replaces images in a PDF file with a new image. Users can specify"
                            + " which image index to replace (0-based) or replace all images.")
    public ResponseEntity<Resource> replaceImage(@ModelAttribute ReplaceImageRequest request)
            throws IOException {

        MultipartFile inputFile = request.getFileInput();
        MultipartFile replacementImage = request.getReplacementImage();
        Integer imageIndex = request.getImageIndex(); // null means replace all
        Integer pageNumber = request.getPageNumber(); // 1-based, null means all pages

        try (PDDocument pdfDoc = pdfDocumentFactory.load(request)) {

            int totalPages = pdfDoc.getNumberOfPages();
            int imagesReplaced = 0;
            int globalImageCounter = 0;

            byte[] replacementBytes = replacementImage.getBytes();

            for (int pageIndex = 0; pageIndex < totalPages; pageIndex++) {
                // If pageNumber is specified, only process that page (convert to 0-based)
                if (pageNumber != null && (pageIndex + 1) != pageNumber) {
                    // Count images on skipped pages to maintain global counter
                    PDPage skippedPage = pdfDoc.getPage(pageIndex);
                    globalImageCounter += countImagesInPage(skippedPage);
                    continue;
                }

                PDPage currentPage = pdfDoc.getPage(pageIndex);
                
                if (imageIndex == null) {
                    // Replace all images on this page
                    imagesReplaced += replaceAllImagesOnPage(currentPage, pdfDoc, replacementBytes);
                } else {
                    // Replace specific image index on this page
                    int localImageIndex = imageIndex - globalImageCounter;
                    if (localImageIndex >= 0) {
                        imagesReplaced += replaceSpecificImageOnPage(
                                currentPage, pdfDoc, replacementBytes, localImageIndex);
                    }
                }
                
                globalImageCounter += countImagesInPage(currentPage);
                
                // If replacing a specific image and we found it, we can stop
                if (imageIndex != null && imagesReplaced > 0) {
                    break;
                }
            }

            log.info("Replaced {} images in PDF with {} pages", imagesReplaced, totalPages);

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
                            inputFile.getOriginalFilename(), "_images_replaced.pdf"));

        } catch (IOException e) {
            throw ExceptionUtils.handlePdfException(e, "during image replacement");
        }
    }

    private int countImagesInPage(PDPage page) throws IOException {
        PDResources resources = page.getResources();
        if (resources == null) {
            return 0;
        }
        return countImagesInResources(resources);
    }

    private int countImagesInResources(PDResources resources) throws IOException {
        if (resources == null) {
            return 0;
        }

        COSDictionary xObjects = resources.getCOSObject().getCOSDictionary(COSName.XOBJECT);
        if (xObjects == null) {
            return 0;
        }

        int count = 0;
        for (COSName name : xObjects.keySet()) {
            try {
                PDXObject xObject = resources.getXObject(name);
                if (xObject instanceof PDImageXObject) {
                    count++;
                } else if (xObject instanceof PDFormXObject form) {
                    count += countImagesInResources(form.getResources());
                }
            } catch (IOException e) {
                log.warn("Error counting XObject {}: {}", name.getName(), e.getMessage());
            }
        }
        return count;
    }

    private int replaceAllImagesOnPage(PDPage page, PDDocument doc, byte[] replacementBytes)
            throws IOException {
        int imagesReplaced = 0;

        PDResources resources = page.getResources();
        if (resources == null) {
            return imagesReplaced;
        }

        COSDictionary xObjects = resources.getCOSObject().getCOSDictionary(COSName.XOBJECT);
        if (xObjects == null) {
            return imagesReplaced;
        }

        List<COSName> names = new ArrayList<>(xObjects.keySet());
        for (COSName name : names) {
            try {
                PDXObject xObject = resources.getXObject(name);
                if (xObject instanceof PDImageXObject) {
                    PDImageXObject newImage = PDImageXObject.createFromByteArray(doc, replacementBytes, "replacement");
                    xObjects.setItem(name, newImage.getCOSObject());
                    imagesReplaced++;
                    log.debug("Replaced image: {}", name.getName());
                } else if (xObject instanceof PDFormXObject form) {
                    imagesReplaced += replaceAllImagesInFormXObject(form, doc, replacementBytes);
                }
            } catch (IOException e) {
                log.warn("Error replacing XObject {}: {}", name.getName(), e.getMessage());
            }
        }

        return imagesReplaced;
    }

    private int replaceAllImagesInFormXObject(PDFormXObject formXObject, PDDocument doc, byte[] replacementBytes)
            throws IOException {
        PDResources resources = formXObject.getResources();
        if (resources == null) {
            return 0;
        }
        return replaceAllImagesOnResources(resources, doc, replacementBytes);
    }

    private int replaceAllImagesOnResources(PDResources resources, PDDocument doc, byte[] replacementBytes)
            throws IOException {
        if (resources == null) {
            return 0;
        }

        COSDictionary xObjects = resources.getCOSObject().getCOSDictionary(COSName.XOBJECT);
        if (xObjects == null) {
            return 0;
        }

        int imagesReplaced = 0;
        List<COSName> names = new ArrayList<>(xObjects.keySet());
        for (COSName name : names) {
            try {
                PDXObject xObject = resources.getXObject(name);
                if (xObject instanceof PDImageXObject) {
                    PDImageXObject newImage = PDImageXObject.createFromByteArray(doc, replacementBytes, "replacement");
                    xObjects.setItem(name, newImage.getCOSObject());
                    imagesReplaced++;
                } else if (xObject instanceof PDFormXObject form) {
                    imagesReplaced += replaceAllImagesInFormXObject(form, doc, replacementBytes);
                }
            } catch (IOException e) {
                log.warn("Error replacing XObject {}: {}", name.getName(), e.getMessage());
            }
        }
        return imagesReplaced;
    }

    private int replaceSpecificImageOnPage(PDPage page, PDDocument doc, byte[] replacementBytes, int targetIndex)
            throws IOException {
        int currentImageIndex = 0;
        int imagesReplaced = 0;

        PDResources resources = page.getResources();
        if (resources == null) {
            return imagesReplaced;
        }

        COSDictionary xObjects = resources.getCOSObject().getCOSDictionary(COSName.XOBJECT);
        if (xObjects == null) {
            return imagesReplaced;
        }

        List<COSName> names = new ArrayList<>(xObjects.keySet());
        for (COSName name : names) {
            try {
                PDXObject xObject = resources.getXObject(name);
                if (xObject instanceof PDImageXObject) {
                    if (currentImageIndex == targetIndex) {
                        PDImageXObject newImage = PDImageXObject.createFromByteArray(doc, replacementBytes, "replacement");
                        xObjects.setItem(name, newImage.getCOSObject());
                        imagesReplaced++;
                        log.debug("Replaced image at index {}: {}", targetIndex, name.getName());
                        return imagesReplaced; // Found and replaced, exit
                    }
                    currentImageIndex++;
                } else if (xObject instanceof PDFormXObject form) {
                    int result = replaceSpecificImageInFormXObject(form, doc, replacementBytes, targetIndex - currentImageIndex);
                    if (result > 0) {
                        return imagesReplaced + result;
                    }
                    currentImageIndex += countImagesInResources(form.getResources());
                }
            } catch (IOException e) {
                log.warn("Error replacing XObject {}: {}", name.getName(), e.getMessage());
            }
        }

        return imagesReplaced;
    }

    private int replaceSpecificImageInFormXObject(PDFormXObject formXObject, PDDocument doc, byte[] replacementBytes, int targetIndex)
            throws IOException {
        PDResources resources = formXObject.getResources();
        if (resources == null || targetIndex < 0) {
            return 0;
        }
        return replaceSpecificImageOnResources(resources, doc, replacementBytes, targetIndex);
    }

    private int replaceSpecificImageOnResources(PDResources resources, PDDocument doc, byte[] replacementBytes, int targetIndex)
            throws IOException {
        if (resources == null || targetIndex < 0) {
            return 0;
        }

        COSDictionary xObjects = resources.getCOSObject().getCOSDictionary(COSName.XOBJECT);
        if (xObjects == null) {
            return 0;
        }

        int currentImageIndex = 0;
        List<COSName> names = new ArrayList<>(xObjects.keySet());
        for (COSName name : names) {
            try {
                PDXObject xObject = resources.getXObject(name);
                if (xObject instanceof PDImageXObject) {
                    if (currentImageIndex == targetIndex) {
                        PDImageXObject newImage = PDImageXObject.createFromByteArray(doc, replacementBytes, "replacement");
                        xObjects.setItem(name, newImage.getCOSObject());
                        return 1;
                    }
                    currentImageIndex++;
                } else if (xObject instanceof PDFormXObject form) {
                    int result = replaceSpecificImageInFormXObject(form, doc, replacementBytes, targetIndex - currentImageIndex);
                    if (result > 0) {
                        return result;
                    }
                    currentImageIndex += countImagesInResources(form.getResources());
                }
            } catch (IOException e) {
                log.warn("Error replacing XObject {}: {}", name.getName(), e.getMessage());
            }
        }
        return 0;
    }
}
