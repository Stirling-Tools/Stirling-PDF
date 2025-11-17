package stirling.software.SPDF.controller.api;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.HashMap;
import java.util.Map;

import org.apache.pdfbox.multipdf.LayerUtility;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.graphics.form.PDFormXObject;
import org.apache.pdfbox.util.Matrix;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.model.api.general.ScalePagesRequest;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.ExceptionUtils;
import stirling.software.common.util.GeneralUtils;
import stirling.software.common.util.WebResponseUtils;

@RestController
@RequestMapping("/api/v1/general")
@Tag(name = "General", description = "General APIs")
@Slf4j
@RequiredArgsConstructor
public class ScalePagesController {

    private final CustomPDFDocumentFactory pdfDocumentFactory;

    private static PDRectangle getTargetSize(String targetPDRectangle, PDDocument sourceDocument) {
        if ("KEEP".equals(targetPDRectangle)) {
            if (sourceDocument.getNumberOfPages() == 0) {
                throw ExceptionUtils.createInvalidPageSizeException("KEEP");
            }

            PDPage sourcePage = sourceDocument.getPage(0);
            PDRectangle sourceSize = sourcePage.getMediaBox();

            if (sourceSize == null) {
                throw ExceptionUtils.createInvalidPageSizeException("KEEP");
            }

            return sourceSize;
        }

        Map<String, PDRectangle> sizeMap = getSizeMap();

        if (sizeMap.containsKey(targetPDRectangle)) {
            return sizeMap.get(targetPDRectangle);
        }

        throw ExceptionUtils.createInvalidPageSizeException(targetPDRectangle);
    }

    private static Map<String, PDRectangle> getSizeMap() {
        Map<String, PDRectangle> sizeMap = new HashMap<>();

        // Portrait sizes (A0-A6)
        sizeMap.put("A0", PDRectangle.A0);
        sizeMap.put("A1", PDRectangle.A1);
        sizeMap.put("A2", PDRectangle.A2);
        sizeMap.put("A3", PDRectangle.A3);
        sizeMap.put("A4", PDRectangle.A4);
        sizeMap.put("A5", PDRectangle.A5);
        sizeMap.put("A6", PDRectangle.A6);

        // Landscape sizes (A0-A6)
        sizeMap.put(
                "A0_LANDSCAPE",
                new PDRectangle(PDRectangle.A0.getHeight(), PDRectangle.A0.getWidth()));
        sizeMap.put(
                "A1_LANDSCAPE",
                new PDRectangle(PDRectangle.A1.getHeight(), PDRectangle.A1.getWidth()));
        sizeMap.put(
                "A2_LANDSCAPE",
                new PDRectangle(PDRectangle.A2.getHeight(), PDRectangle.A2.getWidth()));
        sizeMap.put(
                "A3_LANDSCAPE",
                new PDRectangle(PDRectangle.A3.getHeight(), PDRectangle.A3.getWidth()));
        sizeMap.put(
                "A4_LANDSCAPE",
                new PDRectangle(PDRectangle.A4.getHeight(), PDRectangle.A4.getWidth()));
        sizeMap.put(
                "A5_LANDSCAPE",
                new PDRectangle(PDRectangle.A5.getHeight(), PDRectangle.A5.getWidth()));
        sizeMap.put(
                "A6_LANDSCAPE",
                new PDRectangle(PDRectangle.A6.getHeight(), PDRectangle.A6.getWidth()));

        // Portrait US sizes
        sizeMap.put("LETTER", PDRectangle.LETTER);
        sizeMap.put("LEGAL", PDRectangle.LEGAL);

        // Landscape US sizes
        sizeMap.put(
                "LETTER_LANDSCAPE",
                new PDRectangle(PDRectangle.LETTER.getHeight(), PDRectangle.LETTER.getWidth()));
        sizeMap.put(
                "LEGAL_LANDSCAPE",
                new PDRectangle(PDRectangle.LEGAL.getHeight(), PDRectangle.LEGAL.getWidth()));

        return sizeMap;
    }

    @PostMapping(value = "/scale-pages", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @Operation(
            summary = "Change the size of a PDF page/document",
            description =
                    "This operation takes an input PDF file and the size to scale the pages to in"
                            + " the output PDF file. Input:PDF Output:PDF Type:SISO")
    public ResponseEntity<byte[]> scalePages(@ModelAttribute ScalePagesRequest request)
            throws IOException {
        MultipartFile file = request.getFileInput();
        String targetPDRectangle = request.getPageSize();
        float scaleFactor = request.getScaleFactor();

        try (PDDocument sourceDocument = pdfDocumentFactory.load(file);
                PDDocument outputDocument =
                        pdfDocumentFactory.createNewDocumentBasedOnOldDocument(sourceDocument);
                ByteArrayOutputStream baos = new ByteArrayOutputStream()) {

            PDRectangle targetSize = getTargetSize(targetPDRectangle, sourceDocument);

            // Create LayerUtility once outside the loop for better performance
            LayerUtility layerUtility = new LayerUtility(outputDocument);

            int totalPages = sourceDocument.getNumberOfPages();
            for (int i = 0; i < totalPages; i++) {
                PDPage sourcePage = sourceDocument.getPage(i);
                PDRectangle sourceSize = sourcePage.getMediaBox();

                float scaleWidth = targetSize.getWidth() / sourceSize.getWidth();
                float scaleHeight = targetSize.getHeight() / sourceSize.getHeight();
                float scale = Math.min(scaleWidth, scaleHeight) * scaleFactor;

                PDPage newPage = new PDPage(targetSize);
                outputDocument.addPage(newPage);

                try (PDPageContentStream contentStream =
                        new PDPageContentStream(
                                outputDocument,
                                newPage,
                                PDPageContentStream.AppendMode.APPEND,
                                true,
                                true)) {

                    float x = (targetSize.getWidth() - sourceSize.getWidth() * scale) / 2;
                    float y = (targetSize.getHeight() - sourceSize.getHeight() * scale) / 2;

                    contentStream.saveGraphicsState();
                    contentStream.transform(Matrix.getTranslateInstance(x, y));
                    contentStream.transform(Matrix.getScaleInstance(scale, scale));

                    PDFormXObject form = layerUtility.importPageAsForm(sourceDocument, i);
                    contentStream.drawForm(form);

                    contentStream.restoreGraphicsState();
                }
            }

            outputDocument.save(baos);

            return WebResponseUtils.bytesToWebResponse(
                    baos.toByteArray(),
                    GeneralUtils.generateFilename(file.getOriginalFilename(), "_scaled.pdf"));
        }
    }
}
