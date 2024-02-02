package stirling.software.SPDF.controller.api.converters;

import java.io.StringWriter;
import java.util.ArrayList;
import java.util.List;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.opencsv.CSVWriter;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;

import stirling.software.SPDF.controller.api.CropController;
import stirling.software.SPDF.controller.api.strippers.PDFTableStripper;
import stirling.software.SPDF.model.api.extract.PDFFilePage;

@RestController
@RequestMapping("/api/v1/convert")
@Tag(name = "Convert", description = "Convert APIs")
public class ExtractController {

    private static final Logger logger = LoggerFactory.getLogger(CropController.class);

    @PostMapping(value = "/pdf/csv", consumes = "multipart/form-data")
    @Operation(
            summary = "Extracts a PDF document to csv",
            description =
                    "This operation takes an input PDF file and returns CSV file of whole page. Input:PDF Output:CSV Type:SISO")
    public ResponseEntity<String> PdfToCsv(@ModelAttribute PDFFilePage form) throws Exception {

        ArrayList<String> tableData = new ArrayList<>();
        int columnsCount = 0;

        try (PDDocument document = Loader.loadPDF(form.getFileInput().getBytes())) {
            final double res = 72; // PDF units are at 72 DPI
            PDFTableStripper stripper = new PDFTableStripper();
            PDPage pdPage = document.getPage(form.getPageId() - 1);
            stripper.extractTable(pdPage);
            columnsCount = stripper.getColumns();
            for (int c = 0; c < columnsCount; ++c) {
                for (int r = 0; r < stripper.getRows(); ++r) {
                    tableData.add(stripper.getText(r, c));
                }
            }
        }

        ArrayList<String> notEmptyColumns = new ArrayList<>();

        for (String item : tableData) {
            if (!item.trim().isEmpty()) {
                notEmptyColumns.add(item);
            } else {
                columnsCount--;
            }
        }

        List<String> fullTable =
                notEmptyColumns.stream()
                        .map(
                                (entity) ->
                                        entity.replace('\n', ' ')
                                                .replace('\r', ' ')
                                                .trim()
                                                .replaceAll("\\s{2,}", "|"))
                        .toList();

        int rowsCount = fullTable.get(0).split("\\|").length;

        ArrayList<String> headersList = getTableHeaders(columnsCount, fullTable);
        ArrayList<String> recordList = getRecordsList(rowsCount, fullTable);

        if (headersList.size() == 0 && recordList.size() == 0) {
            throw new Exception("No table detected, no headers or records found");
        }

        StringWriter writer = new StringWriter();
        try (CSVWriter csvWriter = new CSVWriter(writer)) {
            csvWriter.writeNext(headersList.toArray(new String[0]));
            for (String record : recordList) {
                csvWriter.writeNext(record.split("\\|"));
            }
        }

        HttpHeaders headers = new HttpHeaders();
        headers.setContentDisposition(
                ContentDisposition.builder("attachment")
                        .filename(
                                form.getFileInput()
                                                .getOriginalFilename()
                                                .replaceFirst("[.][^.]+$", "")
                                        + "_extracted.csv")
                        .build());
        headers.setContentType(MediaType.parseMediaType("text/csv"));

        return ResponseEntity.ok().headers(headers).body(writer.toString());
    }

    private ArrayList<String> getRecordsList(int rowsCounts, List<String> items) {
        ArrayList<String> recordsList = new ArrayList<>();

        for (int b = 1; b < rowsCounts; b++) {
            StringBuilder strbldr = new StringBuilder();

            for (int i = 0; i < items.size(); i++) {
                String[] parts = items.get(i).split("\\|");
                strbldr.append(parts[b]);
                if (i != items.size() - 1) {
                    strbldr.append("|");
                }
            }
            recordsList.add(strbldr.toString());
        }

        return recordsList;
    }

    private ArrayList<String> getTableHeaders(int columnsCount, List<String> items) {
        ArrayList<String> resultList = new ArrayList<>();
        for (int i = 0; i < columnsCount; i++) {
            String[] parts = items.get(i).split("\\|");
            resultList.add(parts[0]);
        }

        return resultList;
    }
}
