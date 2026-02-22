package stirling.software.SPDF.controller.api.converters;

import java.io.ByteArrayOutputStream;
import java.util.List;
import java.util.Locale;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.poi.ss.usermodel.Cell;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ModelAttribute;

import io.swagger.v3.oas.annotations.Operation;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.model.api.PDFWithPageNums;
import stirling.software.common.annotations.AutoJobPostMapping;
import stirling.software.common.annotations.api.ConvertApi;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.GeneralUtils;

import technology.tabula.ObjectExtractor;
import technology.tabula.Page;
import technology.tabula.RectangularTextContainer;
import technology.tabula.Table;
import technology.tabula.extractors.SpreadsheetExtractionAlgorithm;

@ConvertApi
@Slf4j
@RequiredArgsConstructor
public class ConvertPDFToExcelController {

    private final CustomPDFDocumentFactory pdfDocumentFactory;

    @AutoJobPostMapping(value = "/pdf/xlsx", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @Operation(
            summary = "Convert a PDF to an Excel spreadsheet (XLSX)",
            description =
                    "Extracts tabular data from each page of a PDF and writes it into an Excel"
                            + " workbook, one sheet per table. Input:PDF Output:XLSX Type:SISO")
    public ResponseEntity<byte[]> pdfToExcel(@ModelAttribute PDFWithPageNums request)
            throws Exception {
        String baseName =
                GeneralUtils.removeExtension(request.getFileInput().getOriginalFilename());

        try (PDDocument document = pdfDocumentFactory.load(request);
                XSSFWorkbook workbook = new XSSFWorkbook()) {

            List<Integer> pages = request.getPageNumbersList(document, true);
            SpreadsheetExtractionAlgorithm sea = new SpreadsheetExtractionAlgorithm();
            int sheetCount = 0;

            for (int pageNum : pages) {
                try (ObjectExtractor extractor = new ObjectExtractor(document)) {
                    Page page = extractor.extract(pageNum);
                    List<Table> tables = sea.extract(page);

                    for (int tableIdx = 0; tableIdx < tables.size(); tableIdx++) {
                        Table table = tables.get(tableIdx);
                        String sheetName =
                                tables.size() == 1
                                        ? String.format(Locale.ROOT, "Page %d", pageNum)
                                        : String.format(
                                                Locale.ROOT,
                                                "Page %d Table %d",
                                                pageNum,
                                                tableIdx + 1);

                        Sheet sheet = workbook.createSheet(sheetName);
                        List<List<RectangularTextContainer>> rows = table.getRows();

                        for (int rowIdx = 0; rowIdx < rows.size(); rowIdx++) {
                            Row excelRow = sheet.createRow(rowIdx);
                            List<RectangularTextContainer> cells = rows.get(rowIdx);
                            for (int cellIdx = 0; cellIdx < cells.size(); cellIdx++) {
                                Cell excelCell = excelRow.createCell(cellIdx);
                                excelCell.setCellValue(cells.get(cellIdx).getText());
                            }
                        }
                        sheetCount++;
                    }
                }
            }

            if (sheetCount == 0) {
                return ResponseEntity.noContent().build();
            }

            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            workbook.write(baos);

            HttpHeaders headers = new HttpHeaders();
            headers.setContentDisposition(
                    ContentDisposition.builder("attachment").filename(baseName + ".xlsx").build());
            headers.setContentType(
                    MediaType.parseMediaType(
                            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"));

            return ResponseEntity.ok().headers(headers).body(baos.toByteArray());
        }
    }
}
