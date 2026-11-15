package stirling.software.SPDF.controller.api.converters;

import java.io.IOException;
import java.nio.file.Path;
import java.util.List;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.springframework.core.io.Resource;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ModelAttribute;

import io.swagger.v3.oas.annotations.Operation;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.model.api.PDFWithPageNums;
import stirling.software.SPDF.service.OfficeConversionService;
import stirling.software.common.annotations.AutoJobPostMapping;
import stirling.software.common.annotations.api.ConvertApi;
import stirling.software.common.enumeration.ResourceWeight;
import stirling.software.common.model.tool.ToolFormat;
import stirling.software.common.model.tool.ToolIO;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.GeneralUtils;
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;
import stirling.software.common.util.WebResponseUtils;
import stirling.software.officeconvert.OfficeConvert;
import stirling.software.officeconvert.PdfToXlsx;

@ConvertApi
@Slf4j
@RequiredArgsConstructor
public class ConvertPDFToExcelController {

    private final CustomPDFDocumentFactory pdfDocumentFactory;
    private final TempFileManager tempFileManager;
    private final OfficeConversionService officeConversionService;

    @AutoJobPostMapping(
            value = "/pdf/xlsx",
            consumes = MediaType.MULTIPART_FORM_DATA_VALUE,
            resourceWeight = ResourceWeight.LARGE_WEIGHT)
    @ToolIO(produces = ToolFormat.EXCEL)
    @Operation(
            summary = "Convert a PDF to an Excel spreadsheet (XLSX)",
            description =
                    "Extracts tabular data from each page of a PDF and writes it into an Excel"
                            + " workbook, one sheet per table.")
    public ResponseEntity<Resource> pdfToExcel(@ModelAttribute PDFWithPageNums request)
            throws Exception {
        String baseName =
                GeneralUtils.removeExtension(request.getFileInput().getOriginalFilename());

        TempFile tempOut = tempFileManager.createManagedTempFile(".xlsx");
        try (PDDocument document = pdfDocumentFactory.load(request)) {
            List<Integer> pages = request.getPageNumbersList(document, true);
            if (!writeOfficeConvert(document, pages, tempOut.getPath())) {
                tempOut.close();
                return ResponseEntity.noContent().build();
            }
        } catch (Exception e) {
            tempOut.close();
            throw e;
        }

        MediaType mediaType =
                MediaType.parseMediaType(
                        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        return WebResponseUtils.fileToWebResponse(tempOut, baseName + ".xlsx", mediaType);
    }

    private boolean writeOfficeConvert(PDDocument document, List<Integer> pages, Path out)
            throws IOException {
        if (pages.isEmpty()) {
            return false;
        }
        OfficeConvert.Settings settings =
                officeConversionService.settings().sheets(PdfToXlsx.Sheets.TABLE);
        if (consecutive(pages)) {
            // A run of pages converts in place, so sheet names keep the PDF's page numbers.
            officeConversionService.convert(
                    document, out, "xlsx", settings.pages(pages.getFirst(), pages.getLast()));
        } else {
            try (PDDocument chosen = new PDDocument()) {
                for (int page : pages) {
                    chosen.importPage(document.getPage(page - 1));
                }
                officeConversionService.convert(chosen, out, "xlsx", settings);
            }
        }
        return OfficeConversionService.hasCells(out);
    }

    private static boolean consecutive(List<Integer> pages) {
        for (int i = 1; i < pages.size(); i++) {
            if (pages.get(i) != pages.get(i - 1) + 1) {
                return false;
            }
        }
        return true;
    }
}
