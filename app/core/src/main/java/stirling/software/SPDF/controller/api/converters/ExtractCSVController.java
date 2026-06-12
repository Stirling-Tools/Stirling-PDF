package stirling.software.SPDF.controller.api.converters;

import java.io.ByteArrayOutputStream;
import java.io.StringWriter;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

import org.apache.commons.csv.CSVFormat;
import org.apache.commons.csv.CSVPrinter;
import org.apache.commons.csv.QuoteMode;
import org.apache.pdfbox.pdmodel.PDDocument;
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

import stirling.software.SPDF.config.swagger.CsvConversionResponse;
import stirling.software.SPDF.model.api.PDFWithPageNums;
import stirling.software.SPDF.pdf.parser.PdfModels.TableFragment;
import stirling.software.SPDF.pdf.parser.TabulaTableParser;
import stirling.software.common.annotations.AutoJobPostMapping;
import stirling.software.common.annotations.api.ConvertApi;
import stirling.software.common.enumeration.ResourceWeight;
import stirling.software.common.model.multipart.FileUploadMultipartFile;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.GeneralUtils;
import stirling.software.common.util.WebResponseUtils;

@ConvertApi
@Path("/api/v1/convert")
@ApplicationScoped
@Slf4j
@RequiredArgsConstructor
public class ExtractCSVController {

    private final CustomPDFDocumentFactory pdfDocumentFactory;
    private final TabulaTableParser tabulaTableParser;

    @POST
    @Path("/pdf/csv")
    @Consumes(MediaType.MULTIPART_FORM_DATA)
    @AutoJobPostMapping(
            value = "/pdf/csv",
            consumes = MediaType.MULTIPART_FORM_DATA,
            resourceWeight = ResourceWeight.LARGE_WEIGHT)
    @CsvConversionResponse
    @Operation(
            summary = "Extracts a CSV document from a PDF",
            description =
                    "This operation takes an input PDF file and returns CSV file of whole page."
                            + " Input:PDF Output:CSV Type:SISO")
    public Response pdfToCsv(
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

        String baseName = getBaseName(request.getFileInput().getOriginalFilename());
        List<CsvEntry> csvEntries = new ArrayList<>();

        try (PDDocument document = pdfDocumentFactory.load(request)) {
            List<Integer> pages = request.getPageNumbersList(document, true);
            CSVFormat format =
                    CSVFormat.EXCEL.builder().setEscape('"').setQuoteMode(QuoteMode.ALL).build();

            for (int pageNum : pages) {
                log.info("{}", pageNum);
                List<TableFragment> fragments = tabulaTableParser.parse(document, pageNum);

                for (int i = 0; i < fragments.size(); i++) {
                    StringWriter sw = new StringWriter();
                    try (CSVPrinter printer = format.print(sw)) {
                        for (List<String> row : fragments.get(i).rawRows()) {
                            printer.printRecord(row);
                        }
                    }
                    csvEntries.add(
                            new CsvEntry(
                                    generateEntryName(baseName, pageNum, i + 1), sw.toString()));
                }
            }

            if (csvEntries.isEmpty()) {
                return Response.noContent().build();
            } else if (csvEntries.size() == 1) {
                return createCsvResponse(csvEntries.get(0), baseName);
            } else {
                return createZipResponse(csvEntries, baseName);
            }
        }
    }

    private Response createZipResponse(List<CsvEntry> entries, String baseName) throws Exception {
        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        try (ZipOutputStream zipOut = new ZipOutputStream(baos)) {
            for (CsvEntry entry : entries) {
                ZipEntry zipEntry = new ZipEntry(entry.filename());
                zipOut.putNextEntry(zipEntry);
                zipOut.write(entry.content().getBytes(StandardCharsets.UTF_8));
                zipOut.closeEntry();
            }
        }

        return WebResponseUtils.bytesToWebResponse(
                baos.toByteArray(),
                baseName + "_extracted.zip",
                MediaType.valueOf(MediaType.APPLICATION_OCTET_STREAM));
    }

    private Response createCsvResponse(CsvEntry entry, String baseName) {
        return Response.ok(entry.content())
                .type(MediaType.valueOf("text/csv"))
                .header(
                        "Content-Disposition",
                        "attachment; filename=\"" + baseName + "_extracted.csv\"")
                .build();
    }

    private String generateEntryName(String baseName, int pageNum, int tableIndex) {
        return String.format(Locale.ROOT, "%s_p%d_t%d.csv", baseName, pageNum, tableIndex);
    }

    private String getBaseName(String filename) {
        return GeneralUtils.removeExtension(filename);
    }

    private record CsvEntry(String filename, String content) {}
}
