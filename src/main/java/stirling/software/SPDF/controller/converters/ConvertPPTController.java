package stirling.software.SPDF.controller.converters;

import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.geom.Rectangle2D;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;

import org.apache.poi.xslf.usermodel.XMLSlideShow;
import org.apache.poi.xslf.usermodel.XSLFSlide;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.multipart.MultipartFile;

import com.itextpdf.text.Document;
import com.itextpdf.text.DocumentException;
import com.itextpdf.text.Image;
import com.itextpdf.text.PageSize;
import com.itextpdf.text.pdf.PdfWriter;

import stirling.software.SPDF.utils.PdfUtils;

@Controller
public class ConvertPPTController {

    
    @GetMapping("/pptx-to-pdf")
    public String cinvertToPDF(Model model) {
        model.addAttribute("currentPage", "xlsx-to-pdf");
        return "convert/xlsx-to-pdf";
    }

    @PostMapping("/pptx-to-pdf")
    public ResponseEntity<byte[]> convertPptxToPdf(@RequestParam("fileInput") MultipartFile pptxFile) throws IOException, DocumentException {
        // Read PowerPoint presentation
        XMLSlideShow ppt = new XMLSlideShow(pptxFile.getInputStream());

        // Create PDF document
        Document pdfDocument = new Document(PageSize.A4.rotate());
        ByteArrayOutputStream outputStream = new ByteArrayOutputStream();
        PdfWriter.getInstance(pdfDocument, outputStream);
        pdfDocument.open();

        // Convert PowerPoint slides to images, then add them to the PDF
        for (XSLFSlide slide : ppt.getSlides()) {
            BufferedImage slideImage = new BufferedImage((int) Math.ceil(ppt.getPageSize().getWidth()), (int) Math.ceil(ppt.getPageSize().getHeight()), BufferedImage.TYPE_INT_RGB);
            Graphics2D graphics = slideImage.createGraphics();

            // Set graphics rendering hints for better quality
            graphics.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
            graphics.setRenderingHint(RenderingHints.KEY_RENDERING, RenderingHints.VALUE_RENDER_QUALITY);
            graphics.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BICUBIC);

            // Draw the slide on the graphics
            graphics.setPaint(Color.white);
            graphics.fill(new Rectangle2D.Float(0, 0, slideImage.getWidth(), slideImage.getHeight()));
            slide.draw(graphics);

            // Add the slide image to the PDF document
            Image image = Image.getInstance(slideImage, null);
            image.scaleToFit(PageSize.A4.getWidth() - 72, PageSize.A4.getHeight() - 72);
            pdfDocument.add(image);
        }

        // Close PowerPoint and PDF documents
        ppt.close();
        pdfDocument.close();
        outputStream.close();

        return PdfUtils.boasToWebResponse(outputStream, pptxFile.getOriginalFilename().replaceFirst("[.][^.]+$", "") + "_convertedToPDF.pdf");
    }

}
