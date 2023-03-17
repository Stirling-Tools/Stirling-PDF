package stirling.software.SPDF.controller.converters;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;

import org.apache.commons.io.FilenameUtils;
import org.apache.poi.hwpf.HWPFDocument;
import org.apache.poi.poifs.filesystem.POIFSFileSystem;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.multipart.MultipartFile;

import com.itextpdf.text.Document;
import com.itextpdf.text.DocumentException;
import com.itextpdf.text.Paragraph;
import com.itextpdf.text.pdf.PdfWriter;

import stirling.software.SPDF.utils.PdfUtils;

@Controller
public class ConvertTextController {

    
    @GetMapping("/txt-rtf-to-pdf")
    public String cinvertToPDF(Model model) {
        model.addAttribute("currentPage", "xlsx-to-pdf");
        return "convert/xlsx-to-pdf";
    }

    @PostMapping("/txt-rtf-to-pdf")
    public ResponseEntity<byte[]> convertTxtRtfToPdf(@RequestParam("fileInput") MultipartFile txtRtfFile) throws IOException, DocumentException {
        // Create PDF document
        Document document = new Document();
        ByteArrayOutputStream outputStream = new ByteArrayOutputStream();
        PdfWriter.getInstance(document, outputStream);
        document.open();

        // Read TXT/RTF file content
        String fileContent;
        String fileExtension = FilenameUtils.getExtension(txtRtfFile.getOriginalFilename());
        if (fileExtension.equalsIgnoreCase("rtf")) {
            HWPFDocument hwpfDocument = new HWPFDocument(new POIFSFileSystem(txtRtfFile.getInputStream()));
            fileContent = hwpfDocument.getText().toString();
        } else {
            fileContent = new String(txtRtfFile.getBytes(), StandardCharsets.UTF_8);
        }

        // Add content to PDF
        document.add(new Paragraph(fileContent));

        // Close document and output stream
        document.close();
        outputStream.close();

        return PdfUtils.boasToWebResponse(outputStream, txtRtfFile.getOriginalFilename().replaceFirst("[.][^.]+$", "") + "_convertedToPDF.pdf");
    }

}
