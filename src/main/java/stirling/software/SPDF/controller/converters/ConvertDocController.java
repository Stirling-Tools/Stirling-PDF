package stirling.software.SPDF.controller.converters;

import java.io.ByteArrayOutputStream;
import java.io.IOException;

import org.docx4j.Docx4J;
import org.docx4j.openpackaging.exceptions.Docx4JException;
import org.docx4j.openpackaging.packages.WordprocessingMLPackage;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.multipart.MultipartFile;

import stirling.software.SPDF.utils.PdfUtils;

@Controller
public class ConvertDocController {

    
    @GetMapping("/docx-to-pdf")
    public String cinvertToPDF(Model model) {
        model.addAttribute("currentPage", "xlsx-to-pdf");
        return "convert/xlsx-to-pdf";
    }

    @PostMapping("/docx-to-pdf")
    public ResponseEntity<byte[]> convertDocxToPdf(@RequestParam("fileInput") MultipartFile docxFile) throws IOException, Docx4JException {
        // Load WordprocessingMLPackage
        WordprocessingMLPackage wordMLPackage = WordprocessingMLPackage.load(docxFile.getInputStream());

        // Create PDF output stream
        ByteArrayOutputStream outputStream = new ByteArrayOutputStream();

        // Convert DOCX to PDF
        Docx4J.toPDF(wordMLPackage, outputStream);

        return PdfUtils.boasToWebResponse(outputStream, docxFile.getOriginalFilename().replaceFirst("[.][^.]+$", "") + "_convertedToPDF.pdf");
    }

}
