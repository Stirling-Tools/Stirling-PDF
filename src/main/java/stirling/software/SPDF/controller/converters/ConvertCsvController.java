package stirling.software.SPDF.controller.converters;

import java.io.BufferedReader;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;

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
import com.itextpdf.text.pdf.PdfPCell;
import com.itextpdf.text.pdf.PdfPTable;
import com.itextpdf.text.pdf.PdfWriter;

import stirling.software.SPDF.utils.PdfUtils;

@Controller
public class ConvertCsvController {

    
    @GetMapping("/csv-to-pdf")
    public String cinvertToPDF(Model model) {
        model.addAttribute("currentPage", "xlsx-to-pdf");
        return "convert/xlsx-to-pdf";
    }



    @PostMapping("/csv-to-pdf")
    public ResponseEntity<byte[]> convertCsvToPdf(@RequestParam("fileInput") MultipartFile csvFile) throws IOException, DocumentException {
        // Create PDF document
        Document document = new Document();
        ByteArrayOutputStream outputStream = new ByteArrayOutputStream();
        PdfWriter.getInstance(document, outputStream);
        document.open();

        // Read CSV file
        InputStreamReader inputStreamReader = new InputStreamReader(csvFile.getInputStream(), StandardCharsets.UTF_8);
        BufferedReader bufferedReader = new BufferedReader(inputStreamReader);

        // Create PDF table from CSV content
        PdfPTable table = null;
        String csvRow;
        while ((csvRow = bufferedReader.readLine()) != null) {
            String[] csvRowCells = csvRow.split(","); // Assuming comma as a delimiter

            if (table == null) {
                table = new PdfPTable(csvRowCells.length);
            }

            for (String cellValue : csvRowCells) {
                PdfPCell pdfCell = new PdfPCell(new Paragraph(cellValue));
                table.addCell(pdfCell);
            }
        }

        if (table != null) {
            document.add(table);
        }

        // Close BufferedReader, document, and output stream
        bufferedReader.close();
        document.close();
        outputStream.close();

        return PdfUtils.boasToWebResponse(outputStream, csvFile.getOriginalFilename().replaceFirst("[.][^.]+$", "") + "_convertedToPDF.pdf");
    }


}
