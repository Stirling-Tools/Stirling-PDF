package stirling.software.SPDF.controller.api.converters;

import java.io.OutputStream;
import java.nio.file.Files;
import java.util.List;
import java.util.Locale;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.poi.ss.usermodel.Cell;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.usermodel.Workbook;
import org.apache.poi.ss.util.WorkbookUtil;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.jboss.resteasy.reactive.RestForm;
import org.jboss.resteasy.reactive.multipart.FileUpload;

import io.swagger.v3.oas.annotations.Operation;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.model.api.PDFWithPageNums;
import stirling.software.common.annotations.AutoJobPostMapping;
import stirling.software.common.annotations.api.ConvertApi;
import stirling.software.common.enumeration.ResourceWeight;
import stirling.software.common.model.multipart.FileUploadMultipartFile;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.GeneralUtils;
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;
import stirling.software.common.util.WebResponseUtils;

import technology.tabula.ObjectExtractor;
import technology.tabula.Page;
import technology.tabula.RectangularTextContainer;
import technology.tabula.Table;
import technology.tabula.extractors.SpreadsheetExtractionAlgorithm;

@ConvertApi
@Path("/api/v1/convert")
@ApplicationScoped
@Slf4j
@RequiredArgsConstructor
public class ConvertPDFToExcelController {

    private final CustomPDFDocumentFactory pdfDocumentFactory;
    private final TempFileManager tempFileManager;

    @POST
    @Path("/pdf/xlsx")
    @Consumes(MediaType.MULTIPART_FORM_DATA)
    @AutoJobPostMapping(
            value = "/pdf/xlsx",
            consumes = MediaType.MULTIPART_FORM_DATA,
            resourceWeight = ResourceWeight.LARGE_WEIGHT)
    @Operation(
            summary = "Convert a PDF to an Excel spreadsheet (XLSX)",
            description =
                    "Extracts tabular data from each page of a PDF and writes it into an Excel"
                            + " workbook, one sheet per table. Input:PDF Output:XLSX Type:SISO")
    public Response pdfToExcel(
            @RestForm("fileInput") FileUpload fileUpload,
            @RestForm("fileId") String fileId,
            @RestForm("pageNumbers") String pageNumbers)
            throws Exception {

        PDFWithPageNums request = new PDFWithPageNums();
        request.setFileInput(FileUploadMultipartFile.of(fileUpload));
        request.setFileId(fileId);
        if (pageNumbers != null) {
            request.setPageNumbers(pageNumbers);
        }

        String baseName =
                GeneralUtils.removeExtension(request.getFileInput().getOriginalFilename());

        TempFile tempOut = tempFileManager.createManagedTempFile(".xlsx");
        try (PDDocument document = pdfDocumentFactory.load(request);
                XSSFWorkbook workbook = new XSSFWorkbook();
                ObjectExtractor extractor = new ObjectExtractor(document)) {

            List<Integer> pages = request.getPageNumbersList(document, true);
            SpreadsheetExtractionAlgorithm sea = new SpreadsheetExtractionAlgorithm();
            int sheetCount = 0;

            for (int pageNum : pages) {
                Page page = extractor.extract(pageNum);
                List<Table> tables = sea.extract(page);

                for (int tableIdx = 0; tableIdx < tables.size(); tableIdx++) {
                    Table table = tables.get(tableIdx);
                    String sheetName =
                            tables.size() == 1
                                    ? String.format(Locale.ROOT, "Page %d", pageNum)
                                    : String.format(
                                            Locale.ROOT, "Page %d Table %d", pageNum, tableIdx + 1);

                    sheetName = getUniqueSheetName(workbook, sheetName);
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

            if (sheetCount == 0) {
                tempOut.close();
                return Response.noContent().build();
            }

            try (OutputStream os = Files.newOutputStream(tempOut.getPath())) {
                workbook.write(os);
            }
        } catch (Exception e) {
            tempOut.close();
            throw e;
        }

        MediaType mediaType =
                MediaType.valueOf(
                        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        return WebResponseUtils.fileToWebResponse(tempOut, baseName + ".xlsx", mediaType);
    }

    private String getUniqueSheetName(Workbook workbook, String baseName) {
        String safeName = WorkbookUtil.createSafeSheetName(baseName);
        String uniqueName = safeName;
        int count = 1;
        while (workbook.getSheet(uniqueName) != null) {
            String suffix = " (" + count + ")";
            if (safeName.length() + suffix.length() > 31) {
                uniqueName = safeName.substring(0, 31 - suffix.length()) + suffix;
            } else {
                uniqueName = safeName + suffix;
            }
            count++;
        }
        return uniqueName;
    }
}
