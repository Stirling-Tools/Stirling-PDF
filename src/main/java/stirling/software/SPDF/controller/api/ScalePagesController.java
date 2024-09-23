package stirling.software.SPDF.controller.api;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.HashMap;
import java.util.Map;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.multipdf.LayerUtility;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.graphics.form.PDFormXObject;
import org.apache.pdfbox.util.Matrix;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import io.github.pixee.security.Filenames;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;

import stirling.software.SPDF.model.api.general.ScalePagesRequest;
import stirling.software.SPDF.service.CustomPDDocumentFactory;
import stirling.software.SPDF.utils.WebResponseUtils;

@RestController
@RequestMapping("/api/v1/general")
@Tag(name = "General", description = "General APIs")
public class ScalePagesController {

    private static final Logger logger = LoggerFactory.getLogger(ScalePagesController.class);

    private final CustomPDDocumentFactory pdfDocumentFactory;

    @Autowired
    public ScalePagesController(CustomPDDocumentFactory pdfDocumentFactory) {
        this.pdfDocumentFactory = pdfDocumentFactory;
    }

    @PostMapping(value = "/scale-pages", consumes = "multipart/form-data")
    @Operation(
            summary = "Change the size of a PDF page/document",
            description =
                    "This operation takes an input PDF file and the size to scale the pages to in the output PDF file. Input:PDF Output:PDF Type:SISO")
    public ResponseEntity<byte[]> scalePages(@ModelAttribute ScalePagesRequest request)
            throws IOException {
        MultipartFile file = request.getFileInput();
        String targetPDRectangle = request.getPageSize();
        float scaleFactor = request.getScaleFactor();

        PDDocument sourceDocument = Loader.loadPDF(file.getBytes());
        PDDocument outputDocument =
                pdfDocumentFactory.createNewDocumentBasedOnOldDocument(sourceDocument);

        PDRectangle targetSize = getTargetSize(targetPDRectangle, sourceDocument);

        int totalPages = sourceDocument.getNumberOfPages();
        for (int i = 0; i < totalPages; i++) {
            PDPage sourcePage = sourceDocument.getPage(i);
            PDRectangle sourceSize = sourcePage.getMediaBox();

            float scaleWidth = targetSize.getWidth() / sourceSize.getWidth();
            float scaleHeight = targetSize.getHeight() / sourceSize.getHeight();
            float scale = Math.min(scaleWidth, scaleHeight) * scaleFactor;

            PDPage newPage = new PDPage(targetSize);
            outputDocument.addPage(newPage);

            PDPageContentStream contentStream =
                    new PDPageContentStream(
                            outputDocument,
                            newPage,
                            PDPageContentStream.AppendMode.APPEND,
                            true,
                            true);

            float x = (targetSize.getWidth() - sourceSize.getWidth() * scale) / 2;
            float y = (targetSize.getHeight() - sourceSize.getHeight() * scale) / 2;

            contentStream.saveGraphicsState();
            contentStream.transform(Matrix.getTranslateInstance(x, y));
            contentStream.transform(Matrix.getScaleInstance(scale, scale));

            LayerUtility layerUtility = new LayerUtility(outputDocument);
            PDFormXObject form = layerUtility.importPageAsForm(sourceDocument, i);
            contentStream.drawForm(form);

            contentStream.restoreGraphicsState();
            contentStream.close();
        }

        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        outputDocument.save(baos);
        outputDocument.close();
        sourceDocument.close();

        return WebResponseUtils.bytesToWebResponse(
                baos.toByteArray(),
                Filenames.toSimpleFileName(file.getOriginalFilename()).replaceFirst("[.][^.]+$", "")
                        + "_scaled.pdf");
    }

    private PDRectangle getTargetSize(String targetPDRectangle, PDDocument sourceDocument) {
        if (targetPDRectangle.equals("KEEP")) {
            if (sourceDocument.getNumberOfPages() == 0) {
                return null;
            }

            // use the first page to determine the target page size
            PDPage sourcePage = sourceDocument.getPage(0);
            PDRectangle sourceSize = sourcePage.getMediaBox();

            return sourceSize;
        }

        Map<String, PDRectangle> sizeMap = getSizeMap();

        if (sizeMap.containsKey(targetPDRectangle)) {
            return sizeMap.get(targetPDRectangle);
        }

        throw new IllegalArgumentException(
                "Invalid PDRectangle. It must be one of the following: A0, A1, A2, A3, A4, A5, A6, LETTER, LEGAL, KEEP");
    }

    private Map<String, PDRectangle> getSizeMap() {
        Map<String, PDRectangle> sizeMap = new HashMap<>();
        // Add A0 - A6
        sizeMap.put("A0", PDRectangle.A0);
        sizeMap.put("A1", PDRectangle.A1);
        sizeMap.put("A2", PDRectangle.A2);
        sizeMap.put("A3", PDRectangle.A3);
        sizeMap.put("A4", PDRectangle.A4);
        sizeMap.put("A5", PDRectangle.A5);
        sizeMap.put("A6", PDRectangle.A6);

        // Add other sizes
        sizeMap.put("LETTER", PDRectangle.LETTER);
        sizeMap.put("LEGAL", PDRectangle.LEGAL);

        return sizeMap;
    }
}
