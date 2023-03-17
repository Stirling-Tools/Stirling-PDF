package stirling.software.SPDF.controller.converters;

import java.io.ByteArrayOutputStream;
import java.io.IOException;

import org.apache.poi.ss.usermodel.Cell;
import org.apache.poi.ss.usermodel.DataFormatter;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.usermodel.Workbook;
import org.apache.poi.ss.usermodel.WorkbookFactory;
import org.apache.poi.xssf.usermodel.XSSFCellStyle;
import org.apache.poi.xssf.usermodel.XSSFColor;
import org.apache.poi.xssf.usermodel.XSSFFont;
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
import com.itextpdf.text.Font;
import com.itextpdf.text.Paragraph;
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
    public ResponseEntity<byte[]> convertToPDF(@RequestParam("fileInput") MultipartFile xlsx) throws IOException, DocumentException {
        // Load Excel file
        Workbook workbook = WorkbookFactory.create(xlsx.getInputStream());

        // Create PDF document
        Document document = new Document();
        ByteArrayOutputStream outputStream = new ByteArrayOutputStream();
        PdfWriter.getInstance(document, outputStream);
        document.open();

        // Convert each sheet in Excel to a separate page in PDF
        for (int i = 0; i < workbook.getNumberOfSheets(); i++) {
            Sheet sheet = workbook.getSheetAt(i);
            int numOfColumns = sheet.getRow(0).getPhysicalNumberOfCells();
            PdfPTable table = new PdfPTable(numOfColumns);

            for (int row = 0; row < sheet.getPhysicalNumberOfRows(); row++) {
                Row excelRow = sheet.getRow(row);
                if (excelRow == null) {
                    continue; // Skip this row if it's null
                }
                for (int cell = 0; cell < excelRow.getPhysicalNumberOfCells(); cell++) {
                    Cell excelCell = excelRow.getCell(cell);

                    // Check if the cell is null
                    if (excelCell == null) {
                        table.addCell(""); // Add an empty cell to the PDF table
                        continue;
                    }
                    
                    // Convert cell to string
                    DataFormatter dataFormatter = new DataFormatter();
                    String cellValue = dataFormatter.formatCellValue(excelCell);
                    System.out.println("Cell Value: " + cellValue); 
                    // Get Excel cell font
                    Font cellFont = getFontFromExcelCell(workbook, excelCell);

                    // Create PDF cell with Excel cell font
                    PdfPCell pdfCell = new PdfPCell(new Paragraph(cellValue, cellFont));
                    
                    // Set cell height and width
                    float height = sheet.getRow(row).getHeightInPoints();
                    System.out.print(height);
                    pdfCell.setFixedHeight(30f);


                    // Copy cell style, borders, and background color
                    XSSFCellStyle cellStyle = (XSSFCellStyle) excelCell.getCellStyle();
                    if (cellStyle != null) {
                        XSSFColor bottomBorderColor = cellStyle.getBottomBorderXSSFColor();
                        if (bottomBorderColor != null) {
                            pdfCell.setBorderColor(new BaseColor(bottomBorderColor.getRGB()[0] & 0xFF, bottomBorderColor.getRGB()[1] & 0xFF, bottomBorderColor.getRGB()[2] & 0xFF));
                        }

                        XSSFColor topBorderColor = cellStyle.getTopBorderXSSFColor();
                        if (topBorderColor != null) {
                            pdfCell.setBorderColor(new BaseColor(topBorderColor.getRGB()[0] & 0xFF, topBorderColor.getRGB()[1] & 0xFF, topBorderColor.getRGB()[2] & 0xFF));
                        }

                        XSSFColor leftBorderColor = cellStyle.getLeftBorderXSSFColor();
                        if (leftBorderColor != null) {
                            pdfCell.setBorderColor(new BaseColor(leftBorderColor.getRGB()[0] & 0xFF, leftBorderColor.getRGB()[1] & 0xFF, leftBorderColor.getRGB()[2] & 0xFF));
                        }

                        XSSFColor rightBorderColor = cellStyle.getRightBorderXSSFColor();
                        if (rightBorderColor != null) {
                            pdfCell.setBorderColor(new BaseColor(rightBorderColor.getRGB()[0] & 0xFF, rightBorderColor.getRGB()[1] & 0xFF, rightBorderColor.getRGB()[2] & 0xFF));
                        }
                        
                        XSSFColor fillForegroundColor = cellStyle.getFillForegroundXSSFColor();
                        if (fillForegroundColor != null) {
                            pdfCell.setBackgroundColor(new BaseColor(fillForegroundColor.getRGB()[0] & 0xFF, fillForegroundColor.getRGB()[1] & 0xFF, fillForegroundColor.getRGB()[2] & 0xFF));
                        }

                    }

                    table.addCell(pdfCell);
                }
            }

            // Add sheet to PDF
            document.add(table);

            // Add page break if there are more sheets
            if (i < workbook.getNumberOfSheets() - 1) {
                document.newPage();
            }
        }

        // Close document and output stream
        document.close();
        outputStream.flush();
        outputStream.close();   

        // Return PDF as response
        return PdfUtils.boasToWebResponse(outputStream, xlsx.getOriginalFilename().replaceFirst("[.][^.]+$", "") + "_convertedToPDF.pdf");
    }

    private Font getFontFromExcelCell(Workbook workbook, Cell excelCell) {
        XSSFFont excelFont = ((XSSFCellStyle) excelCell.getCellStyle()).getFont();
        Font.FontFamily fontFamily = Font.getFamily(excelFont.getFontName());
        float fontSize = excelFont.getFontHeightInPoints();
        int fontStyle = (excelFont.getBold() ? Font.BOLD : Font.NORMAL) | (excelFont.getItalic() ? Font.ITALIC : Font.NORMAL);

        return new Font(fontFamily, fontSize, fontStyle);
    }

}
