package stirling.software.SPDF.controller.api.security;

import java.awt.Color;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.List;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.graphics.image.LosslessFactory;
import org.apache.pdfbox.pdmodel.graphics.image.PDImageXObject;
import org.apache.pdfbox.rendering.ImageType;
import org.apache.pdfbox.rendering.PDFRenderer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.tags.Tag;
import stirling.software.SPDF.model.PDFText;
import stirling.software.SPDF.pdf.TextFinder;
import stirling.software.SPDF.utils.WebResponseUtils;
@RestController
@Tag(name = "Security", description = "Security APIs")
public class RedactController {

    private static final Logger logger = LoggerFactory.getLogger(RedactController.class);


    @PostMapping(value = "/auto-redact", consumes = "multipart/form-data")
    @Operation(summary = "Redacts listOfText in a PDF document", 
               description = "This operation takes an input PDF file and redacts the provided listOfText. Input:PDF, Output:PDF, Type:SISO")
    public ResponseEntity<byte[]> redactPdf(
            @Parameter(description = "The input PDF file", required = true) @RequestParam("fileInput") MultipartFile file,
            @Parameter(description = "List of listOfText to redact from the PDF", required = true, schema = @Schema(type = "string")) @RequestParam("listOfText") String listOfTextString,
            @RequestParam(value = "useRegex", required = false) boolean useRegex,
            @RequestParam(value = "wholeWordSearch", required = false) boolean wholeWordSearchBool,
            @RequestParam(value = "customPadding", required = false) float customPadding,
            @RequestParam(value = "convertPDFToImage", required = false) boolean convertPDFToImage) throws Exception {
        
    	System.out.println(listOfTextString);
    	String[] listOfText = listOfTextString.split("\n");
        byte[] bytes = file.getBytes();
        PDDocument document = PDDocument.load(new ByteArrayInputStream(bytes));
        for (String text : listOfText) {
        	text = text.trim();
        	System.out.println(text);
        	TextFinder textFinder = new TextFinder(text, useRegex, wholeWordSearchBool);
            List<PDFText> foundTexts = textFinder.getTextLocations(document);
            redactFoundText(document, foundTexts, customPadding);
        }
        
        
        
        if (convertPDFToImage) {
            PDDocument imageDocument = new PDDocument();
            PDFRenderer pdfRenderer = new PDFRenderer(document);
            for (int page = 0; page < document.getNumberOfPages(); ++page) {
                BufferedImage bim = pdfRenderer.renderImageWithDPI(page, 300, ImageType.RGB);
                PDPage newPage = new PDPage(new PDRectangle(bim.getWidth(), bim.getHeight()));
                imageDocument.addPage(newPage);
                PDImageXObject pdImage = LosslessFactory.createFromImage(imageDocument, bim);
                PDPageContentStream contentStream = new PDPageContentStream(imageDocument, newPage);
                contentStream.drawImage(pdImage, 0, 0);
                contentStream.close();
            }
            document.close();
            document = imageDocument;
        }

        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        document.save(baos);
        document.close();
        
        byte[] pdfContent = baos.toByteArray();
        return WebResponseUtils.bytesToWebResponse(pdfContent,
                file.getOriginalFilename().replaceFirst("[.][^.]+$", "") + "_redacted.pdf");
    }

    
    private void redactFoundText(PDDocument document, List<PDFText> blocks, float customPadding) throws IOException {
        var allPages = document.getDocumentCatalog().getPages();

        for (PDFText block : blocks) {
            var page = allPages.get(block.getPageIndex());
            PDPageContentStream contentStream = new PDPageContentStream(document, page, PDPageContentStream.AppendMode.APPEND, true, true);
            contentStream.setNonStrokingColor(Color.BLACK);
            float padding = (block.getY2() - block.getY1()) * 0.3f + customPadding;
            PDRectangle pageBox = page.getBBox();
            contentStream.addRect(block.getX1(), pageBox.getHeight() - block.getY1() - padding, block.getX2() - block.getX1(), block.getY2() - block.getY1() + 2 * padding);
            contentStream.fill();
            contentStream.close();
        }
    }

}
