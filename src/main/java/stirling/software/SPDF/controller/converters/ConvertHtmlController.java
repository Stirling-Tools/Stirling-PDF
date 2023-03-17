package stirling.software.SPDF.controller.converters;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;

import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.multipart.MultipartFile;

import com.itextpdf.text.Document;
import com.itextpdf.text.DocumentException;
import com.itextpdf.text.pdf.PdfWriter;
import com.itextpdf.tool.xml.XMLWorkerHelper;

import stirling.software.SPDF.utils.PdfUtils;

@Controller
public class ConvertHtmlController {

    
    @GetMapping("//html-to-pdf")
    public String cinvertToPDF(Model model) {
        model.addAttribute("currentPage", "xlsx-to-pdf");
        return "convert/xlsx-to-pdf";
    }

    @PostMapping("/html-to-pdf")
    public ResponseEntity<byte[]> convertHtmlToPdf(@RequestParam("fileInput") MultipartFile htmlFile) throws IOException, DocumentException {
        // Create PDF document
        Document document = new Document();
        ByteArrayOutputStream outputStream = new ByteArrayOutputStream();
        PdfWriter writer = PdfWriter.getInstance(document, outputStream);
        document.open();

        // Read HTML file
        InputStream htmlInputStream = new ByteArrayInputStream(htmlFile.getBytes());

        // Convert HTML content to PDF
        XMLWorkerHelper.getInstance().parseXHtml(writer, document, htmlInputStream);

        // Close document and output stream
        document.close();
        outputStream.close();

        return PdfUtils.boasToWebResponse(outputStream, "");
    }

}
