package stirling.software.SPDF.controller.converters;

import java.io.ByteArrayOutputStream;
import java.io.IOException;

import org.apache.poi.ss.usermodel.Workbook;
import org.apache.poi.ss.usermodel.WorkbookFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.multipart.MultipartFile;

import com.itextpdf.text.BaseColor;
import com.itextpdf.text.Document;
import com.itextpdf.text.DocumentException;
import com.itextpdf.text.pdf.PdfPCell;
import com.itextpdf.text.pdf.PdfPTable;
import com.itextpdf.text.pdf.PdfWriter;

import stirling.software.SPDF.utils.PdfUtils;

@Controller
public class ConvertXlsxController {

    
    @GetMapping("/xlsx-to-pdf")
    public String cinvertToPDF(Model model) {
        model.addAttribute("currentPage", "xlsx-to-pdf");
        return "convert/xlsx-to-pdf";
    }

    @PostMapping("/xlsx-to-pdf")
    public ResponseEntity<byte[]> convertToPDF(@RequestParam("fileInput") MultipartFile xlsx) throws IOException, DocumentException{
     // Load Excel file

        Workbook workbook = WorkbookFactory.create(xlsx.getInputStream());
        
        // Create PDF document
        Document document = new Document();
        ByteArrayOutputStream outputStream = new ByteArrayOutputStream();
        PdfWriter.getInstance(document, outputStream);
        document.open();

        // Convert each sheet in Excel to a separate page in PDF
        for (int i = 0; i < workbook.getNumberOfSheets(); i++) {
            PdfPTable table = new PdfPTable(workbook.getSheetAt(i).getRow(0).getPhysicalNumberOfCells());
            for (int row = 0; row < workbook.getSheetAt(i).getPhysicalNumberOfRows(); row++) {
                for (int cell = 0; cell < workbook.getSheetAt(i).getRow(row).getPhysicalNumberOfCells(); cell++) {
                    PdfPCell pdfCell = new PdfPCell();
                    pdfCell.addElement(new com.itextpdf.text.Paragraph(workbook.getSheetAt(i).getRow(row).getCell(cell).toString()));

                 // Copy cell style, borders, and background color
                    pdfCell.setBorderColor(new BaseColor(workbook.getSheetAt(i).getRow(row).getCell(cell).getCellStyle().getBottomBorderColor()));
                    pdfCell.setBorderColor(new BaseColor(workbook.getSheetAt(i).getRow(row).getCell(cell).getCellStyle().getTopBorderColor()));
                    pdfCell.setBorderColor(new BaseColor(workbook.getSheetAt(i).getRow(row).getCell(cell).getCellStyle().getLeftBorderColor()));
                    pdfCell.setBorderColor(new BaseColor(workbook.getSheetAt(i).getRow(row).getCell(cell).getCellStyle().getRightBorderColor()));
                    Short bc = workbook.getSheetAt(i).getRow(row).getCell(cell).getCellStyle().getFillBackgroundColor();
                    pdfCell.setBackgroundColor(new BaseColor(bc));

                    table.addCell(pdfCell);
                }
            }
            document.add(table);
        }
        // Close document and output stream
        document.close();
        outputStream.flush();
        outputStream.close();
        return PdfUtils.boasToWebResponse(outputStream, xlsx.getOriginalFilename().replaceFirst("[.][^.]+$", "") + "_convertedToPDF.pdf");
        // Close document and input stream
        

    }
}
