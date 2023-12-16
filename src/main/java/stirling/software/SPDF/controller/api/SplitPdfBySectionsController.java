package stirling.software.SPDF.controller.api;
import java.awt.geom.Rectangle2D;
import java.awt.image.BufferedImage;
import org.apache.pdfbox.pdmodel.graphics.form.PDFormXObject;
import org.apache.pdfbox.pdmodel.graphics.image.LosslessFactory;
import org.apache.pdfbox.pdmodel.graphics.image.PDImageXObject;

import java.awt.image.DataBufferByte;
import java.awt.image.DataBufferInt;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;
import org.apache.pdfbox.multipdf.LayerUtility;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.rendering.PDFRenderer;
import org.apache.pdfbox.util.Matrix;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import com.google.zxing.BinaryBitmap;
import com.google.zxing.LuminanceSource;
import com.google.zxing.MultiFormatReader;
import com.google.zxing.NotFoundException;
import com.google.zxing.PlanarYUVLuminanceSource;
import com.google.zxing.Result;
import com.google.zxing.common.HybridBinarizer;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import stirling.software.SPDF.model.api.SplitPdfBySectionsRequest;
import stirling.software.SPDF.model.api.general.SplitPdfBySizeOrCountRequest;
import stirling.software.SPDF.model.api.misc.AutoSplitPdfRequest;
import stirling.software.SPDF.utils.GeneralUtils;
import stirling.software.SPDF.utils.WebResponseUtils;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
@RestController
@RequestMapping("/api/v1/general")
@Tag(name = "Misc", description = "Miscellaneous APIs")
public class SplitPdfBySectionsController {


	@PostMapping(value = "/split-pdf-by-sections", consumes = "multipart/form-data")
    @Operation(summary = "Split PDF pages into smaller sections", description = "Split each page of a PDF into smaller sections based on the user's choice (halves, thirds, quarters, etc.), both vertically and horizontally. Input: PDF, Split Parameters. Output: ZIP containing split documents.")
    public ResponseEntity<byte[]> splitPdf(@ModelAttribute SplitPdfBySectionsRequest request) throws Exception {
        List<ByteArrayOutputStream> splitDocumentsBoas = new ArrayList<>();

        MultipartFile file = request.getFileInput();
        PDDocument sourceDocument = PDDocument.load(file.getInputStream());

        // Process the PDF based on split parameters
        int horiz = request.getHorizontalDivisions();
        int verti = request.getVerticalDivisions();

        List<PDDocument> splitDocuments = splitPdfPages(sourceDocument, horiz, verti);
        for (PDDocument doc : splitDocuments) {
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            doc.save(baos);
            doc.close();
            splitDocumentsBoas.add(baos);
        }

        sourceDocument.close();

        Path zipFile = Files.createTempFile("split_documents", ".zip");
        String filename = file.getOriginalFilename().replaceFirst("[.][^.]+$", "");
        byte[] data;


        
        try (ZipOutputStream zipOut = new ZipOutputStream(Files.newOutputStream(zipFile))) {
            int pageNum = 1;
            for (int i = 0; i < splitDocumentsBoas.size(); i++) {
                ByteArrayOutputStream baos = splitDocumentsBoas.get(i);
                int sectionNum = (i % (horiz * verti)) + 1;
                String fileName = filename + "_" + pageNum + "_" + sectionNum + ".pdf";
                byte[] pdf = baos.toByteArray();
                ZipEntry pdfEntry = new ZipEntry(fileName);
                zipOut.putNextEntry(pdfEntry);
                zipOut.write(pdf);
                zipOut.closeEntry();

                if (sectionNum == horiz * verti) pageNum++;
            }
        } catch (Exception e) {
            e.printStackTrace();
        } finally {
            data = Files.readAllBytes(zipFile);
            Files.delete(zipFile);
        }

        return WebResponseUtils.bytesToWebResponse(data, filename + "_split.zip", MediaType.APPLICATION_OCTET_STREAM);
    }
    
    public List<PDDocument> splitPdfPages(PDDocument document, int horizontalDivisions, int verticalDivisions) throws IOException {
        List<PDDocument> splitDocuments = new ArrayList<>();

        for (PDPage originalPage : document.getPages()) {
            PDRectangle originalMediaBox = originalPage.getMediaBox();
            float width = originalMediaBox.getWidth();
            float height = originalMediaBox.getHeight();
            float subPageWidth = width / horizontalDivisions;
            float subPageHeight = height / verticalDivisions;

            LayerUtility layerUtility = new LayerUtility(document);

            for (int i = 0; i < horizontalDivisions; i++) {
                for (int j = 0; j < verticalDivisions; j++) {
                    PDDocument subDoc = new PDDocument();
                    PDPage subPage = new PDPage(new PDRectangle(subPageWidth, subPageHeight));
                    subDoc.addPage(subPage);

                    PDFormXObject form = layerUtility.importPageAsForm(document, document.getPages().indexOf(originalPage));

                    try (PDPageContentStream contentStream = new PDPageContentStream(subDoc, subPage)) {
                        // Set clipping area and position
                        float translateX = -subPageWidth * i;
                        float translateY = height - subPageHeight * (j + 1) - subPageHeight;

                        contentStream.saveGraphicsState();
                        contentStream.addRect(0, 0, subPageWidth, subPageHeight);
                        contentStream.clip();
                        contentStream.transform(new Matrix(1, 0, 0, 1, translateX, translateY));

                        // Draw the form
                        contentStream.drawForm(form);
                        contentStream.restoreGraphicsState();
                    }

                    splitDocuments.add(subDoc);
                }
            }
        }

        return splitDocuments;
    }


    

}
