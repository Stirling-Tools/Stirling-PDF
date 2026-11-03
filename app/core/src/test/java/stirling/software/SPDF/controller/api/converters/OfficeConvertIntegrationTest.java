package stirling.software.SPDF.controller.api.converters;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;
import java.util.zip.ZipOutputStream;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDDocumentNameDictionary;
import org.apache.pdfbox.pdmodel.PDEmbeddedFilesNameTreeNode;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.common.filespecification.PDComplexFileSpecification;
import org.apache.pdfbox.pdmodel.common.filespecification.PDEmbeddedFile;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.apache.pdfbox.text.PDFTextStripper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.core.io.Resource;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockMultipartFile;

import stirling.software.SPDF.config.EndpointConfiguration;
import stirling.software.SPDF.model.api.converters.ConvertEbookToPdfRequest;
import stirling.software.SPDF.model.api.converters.ConvertPDFToMarkdown;
import stirling.software.SPDF.model.api.converters.ConvertPdfToEpubRequest;
import stirling.software.SPDF.model.api.converters.PdfToPdfARequest;
import stirling.software.SPDF.service.OfficeConversionService;
import stirling.software.SPDF.service.OfficeToPdfService;
import stirling.software.SPDF.service.VeraPDFService;
import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.model.api.GeneralFile;
import stirling.software.common.model.api.PDFFile;
import stirling.software.common.model.api.converters.HTMLToPdfRequest;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.OfficeDocumentSanitizer;
import stirling.software.common.util.TempFileManager;
import stirling.software.common.util.TempFileRegistry;

class OfficeConvertIntegrationTest {
    private static final String TEXT = "Stirling conversion content";
    @TempDir Path dir;
    private final ApplicationProperties properties = new ApplicationProperties();
    private final EndpointConfiguration endpoints = mock(EndpointConfiguration.class);
    private final CustomPDFDocumentFactory factory =
            new CustomPDFDocumentFactory(
                    mock(stirling.software.common.service.PdfMetadataService.class));
    private TempFileManager tempFiles;
    private OfficeConversionService office;
    private OfficeToPdfService toPdf;

    @BeforeEach
    void setUp() {
        properties.getSystem().getTempFileManagement().setBaseTmpDir(dir.toString());
        tempFiles = new TempFileManager(new TempFileRegistry(), properties);
        office = new OfficeConversionService(properties, endpoints, factory, tempFiles);
        toPdf = new OfficeToPdfService(office, properties, tempFiles);
    }

    @ParameterizedTest
    @ValueSource(
            strings = {"docx", "odt", "rtf", "xml", "pptx", "odp", "xlsx", "ods", "epub", "azw3"})
    void convertsEveryEditableFormatAndReadsItBack(String format) throws Exception {
        Path output = dir.resolve("output." + format);
        try (PDDocument pdf = document()) {
            office.convert(pdf, output, format, office.settings());
        }
        assertThat(Files.size(output)).isPositive();
        Path restored = dir.resolve("restored.pdf");
        toPdf.convert(output, restored);
        assertPdfText(Files.readAllBytes(restored));
    }

    @ParameterizedTest
    @ValueSource(strings = {"txt", "md", "html", "doc"})
    void writesTextFormatsWithContent(String format) throws Exception {
        Path output = dir.resolve("output." + format);
        try (PDDocument pdf = document()) {
            office.convert(pdf, output, format, office.settings());
        }
        assertThat(Files.readString(output)).contains(TEXT);
    }

    @Test
    void htmlOutputRemainsAZipAndConvertsBackWithoutWeasyprint() throws Exception {
        var controller = new ConvertPDFToHtml(tempFiles, office, null);
        PDFFile request = new PDFFile();
        request.setFileInput(uploadPdf());
        byte[] zip = body(controller.processPdfToHTML(request, true));
        try (var in = new ZipInputStream(new ByteArrayInputStream(zip))) {
            assertThat(in.getNextEntry().getName()).isEqualTo("index.html");
            assertThat(new String(in.readAllBytes(), StandardCharsets.UTF_8)).contains(TEXT);
        }
        HTMLToPdfRequest html = new HTMLToPdfRequest();
        html.setFileInput(new MockMultipartFile("fileInput", "page.zip", "application/zip", zip));
        html.setUseStirlingOfficeConvert(true);
        var toHtml = new ConvertHtmlToPDF(factory, null, tempFiles, office, toPdf, null);
        assertPdfText(body(toHtml.HtmlToPdf(html)));
    }

    @ParameterizedTest
    @ValueSource(booleans = {false, true})
    void markdownConvertsInBothDirections(boolean packaged) throws Exception {
        var toMarkdown = new ConvertPDFToMarkdown(tempFiles, null, office);
        PDFFile pdf = new PDFFile();
        pdf.setFileInput(uploadPdf());
        byte[] markdown = toMarkdown.processPdfToMarkdown(pdf, true).getBody();
        assertThat(new String(markdown, StandardCharsets.UTF_8)).contains(TEXT);
        GeneralFile request = new GeneralFile();
        request.setFileInput(
                new MockMultipartFile(
                        "fileInput",
                        packaged ? "notes.zip" : "notes.md",
                        "application/octet-stream",
                        packaged ? zip("index.md", markdown) : markdown));
        var controller = new ConvertMarkdownToPdf(factory, null, tempFiles, office, toPdf, null);
        assertPdfText(body(controller.markdownToPdf(request, true)));
    }

    @ParameterizedTest
    @ValueSource(strings = {"EPUB", "AZW3"})
    void ebooksConvertInBothDirectionsWithoutCalibre(String format) throws Exception {
        ConvertPdfToEpubRequest request = new ConvertPdfToEpubRequest();
        request.setFileInput(uploadPdf());
        request.setOutputFormat(ConvertPdfToEpubRequest.OutputFormat.valueOf(format));
        request.setUseStirlingOfficeConvert(true);
        request.setDetectChapters(false);
        request.setTargetDevice(ConvertPdfToEpubRequest.TargetDevice.KINDLE_EINK_TEXT);
        var writer = new ConvertPDFToEpubController(tempFiles, endpoints, null, office);
        byte[] ebook = body(writer.convertPdfToEpub(request));
        ConvertEbookToPdfRequest read = new ConvertEbookToPdfRequest();
        read.setUseStirlingOfficeConvert(true);
        read.setIncludePageNumbers(true);
        read.setIncludeTableOfContents(true);
        read.setFileInput(
                new MockMultipartFile(
                        "fileInput",
                        "book." + format.toLowerCase(),
                        "application/octet-stream",
                        ebook));
        var reader =
                new ConvertEbookToPDFController(
                        factory,
                        tempFiles,
                        endpoints,
                        mock(OfficeDocumentSanitizer.class),
                        null,
                        office,
                        toPdf);
        assertPdfText(body(reader.convertEbookToPdf(read)));
        read.setUseStirlingOfficeConvert(false);
        assertThatThrownBy(() -> reader.convertEbookToPdf(read))
                .isInstanceOf(IllegalStateException.class);
    }

    @ParameterizedTest
    @ValueSource(strings = {"pdfa-1", "pdfa-2b", "pdfa-3b"})
    void pdfaPassesStrictVeraPdfValidationAndKeepsEligibleAttachments(String format)
            throws Exception {
        VeraPDFService validator = new VeraPDFService();
        validator.initialize();
        var controller = new ConvertPDFToPDFA(null, validator, null, tempFiles, properties, office);
        PdfToPdfARequest request = new PdfToPdfARequest();
        request.setOutputFormat(format);
        request.setStrict(true);
        request.setUseStirlingOfficeConvert(true);
        request.setFileInput(uploadPdf());
        byte[] output = body(controller.pdfToPdfA(request));
        assertPdfText(output);
        if (format.equals("pdfa-3b")) {
            try (PDDocument pdf = Loader.loadPDF(output)) {
                var files = pdf.getDocumentCatalog().getNames().getEmbeddedFiles().getNames();
                assertThat(files.get("source.txt").getEmbeddedFileUnicode().toByteArray())
                        .isEqualTo(TEXT.getBytes(StandardCharsets.UTF_8));
            }
        }
    }

    @ParameterizedTest
    @ValueSource(strings = {"docx", "xlsx", "pptx", "odt", "ods", "odp", "rtf"})
    void fileToPdfEndpointUsesTheNativeConverterAfterSanitizing(String format) throws Exception {
        Path input = dir.resolve("source." + format);
        try (PDDocument pdf = document()) {
            office.convert(pdf, input, format, office.settings());
        }
        var sanitizer =
                new OfficeDocumentSanitizer(
                        mock(stirling.software.common.service.SsrfProtectionService.class),
                        properties);
        var controller =
                new ConvertOfficeController(
                        factory, null, null, sanitizer, endpoints, tempFiles, office, toPdf);
        var mvc =
                org.springframework.test.web.servlet.setup.MockMvcBuilders.standaloneSetup(
                                controller)
                        .build();
        var response =
                mvc.perform(
                                org.springframework.test.web.servlet.request.MockMvcRequestBuilders
                                        .multipart("/api/v1/convert/file/pdf")
                                        .file(
                                                new MockMultipartFile(
                                                        "fileInput",
                                                        "source." + format,
                                                        "application/octet-stream",
                                                        Files.readAllBytes(input)))
                                        .param("useStirlingOfficeConvert", "true"))
                        .andReturn()
                        .getResponse();
        assertThat(response.getStatus()).isEqualTo(200);
        assertPdfText(response.getContentAsByteArray());
    }

    @ParameterizedTest
    @ValueSource(strings = {"mobi", "fb2"})
    void readsAdditionalEbookFormats(String format) throws Exception {
        byte[] input;
        if (format.equals("fb2")) {
            input =
                    ("<?xml version=\"1.0\" encoding=\"utf-8\"?>"
                                    + "<FictionBook xmlns=\"http://www.gribuser.ru/xml/fictionbook/2.0\">"
                                    + "<body><section><p>"
                                    + TEXT
                                    + "</p></section></body></FictionBook>")
                            .getBytes(StandardCharsets.UTF_8);
        } else {
            Path ebook = dir.resolve("book.azw3");
            try (PDDocument pdf = document()) {
                office.convert(pdf, ebook, "azw3", office.settings());
            }
            input = Files.readAllBytes(ebook);
        }
        ConvertEbookToPdfRequest request = new ConvertEbookToPdfRequest();
        request.setUseStirlingOfficeConvert(true);
        request.setFileInput(
                new MockMultipartFile(
                        "fileInput", "book." + format, "application/octet-stream", input));
        var controller =
                new ConvertEbookToPDFController(
                        factory,
                        tempFiles,
                        endpoints,
                        mock(OfficeDocumentSanitizer.class),
                        null,
                        office,
                        toPdf);
        assertPdfText(body(controller.convertEbookToPdf(request)));
    }

    @ParameterizedTest
    @org.junit.jupiter.params.provider.CsvSource({
        "word,docx",
        "word,doc",
        "word,odt",
        "presentation,ppt",
        "presentation,pptx",
        "presentation,odp",
        "text,txt",
        "text,rtf",
        "xml,xml"
    })
    void existingPdfEndpointsBindThePerRequestChoice(String endpoint, String format)
            throws Exception {
        org.mockito.Mockito.when(endpoints.isEndpointEnabled("pdf-to-rtf")).thenReturn(true);
        var controller = new ConvertPDFToOffice(factory, tempFiles, null, office, endpoints);
        var mvc =
                org.springframework.test.web.servlet.setup.MockMvcBuilders.standaloneSetup(
                                controller)
                        .build();
        var response =
                mvc.perform(
                                org.springframework.test.web.servlet.request.MockMvcRequestBuilders
                                        .multipart("/api/v1/convert/pdf/" + endpoint)
                                        .file(uploadPdf())
                                        .param("outputFormat", format)
                                        .param("useStirlingOfficeConvert", "true"))
                        .andReturn()
                        .getResponse();
        assertThat(response.getStatus()).isEqualTo(200);
        assertThat(response.getContentAsByteArray()).isNotEmpty();
        assertThat(response.getHeader("Content-Disposition")).contains("." + format);
    }

    @ParameterizedTest
    @ValueSource(strings = {"1", "1-2", "1,3"})
    void excelEndpointHonoursPageSelections(String pages) throws Exception {
        byte[] input;
        try (PDDocument pdf = new PDDocument();
                var out = new ByteArrayOutputStream()) {
            for (int number = 1; number <= 3; number++) {
                PDPage page = new PDPage();
                pdf.addPage(page);
                try (var content = new PDPageContentStream(pdf, page)) {
                    for (int x = 72; x <= 272; x += 100) {
                        content.moveTo(x, 550);
                        content.lineTo(x, 650);
                    }
                    for (int y = 550; y <= 650; y += 50) {
                        content.moveTo(72, y);
                        content.lineTo(272, y);
                    }
                    content.stroke();
                    content.beginText();
                    content.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA), 12);
                    content.newLineAtOffset(82, 625);
                    content.showText("Page" + number);
                    content.newLineAtOffset(100, 0);
                    content.showText("Value");
                    content.newLineAtOffset(-100, -50);
                    content.showText("Row");
                    content.newLineAtOffset(100, 0);
                    content.showText("42");
                    content.endText();
                }
            }
            pdf.save(out);
            input = out.toByteArray();
        }
        var request = new stirling.software.SPDF.model.api.PDFWithPageNums();
        request.setPageNumbers(pages);
        request.setFileInput(
                new MockMultipartFile("fileInput", "tables.pdf", "application/pdf", input));
        var controller = new ConvertPDFToExcelController(factory, tempFiles, office);
        byte[] output = body(controller.pdfToExcel(request, true));
        StringBuilder cells = new StringBuilder();
        try (var workbook =
                new org.apache.poi.xssf.usermodel.XSSFWorkbook(new ByteArrayInputStream(output))) {
            for (var sheet : workbook) {
                for (var row : sheet) {
                    for (var cell : row) {
                        cells.append(cell).append(' ');
                    }
                }
            }
        }
        assertThat(cells.toString()).contains("Page1");
        if (pages.equals("1,3")) {
            assertThat(cells.toString()).contains("Page3").doesNotContain("Page2");
        } else if (pages.equals("1-2")) {
            assertThat(cells.toString()).contains("Page2").doesNotContain("Page3");
        } else {
            assertThat(cells.toString()).doesNotContain("Page2", "Page3");
        }
    }

    private MockMultipartFile uploadPdf() throws Exception {
        try (PDDocument pdf = document();
                var out = new ByteArrayOutputStream()) {
            var attachment = new PDComplexFileSpecification();
            attachment.setFile("source.txt");
            attachment.setFileUnicode("source.txt");
            var payload =
                    new PDEmbeddedFile(
                            pdf, new ByteArrayInputStream(TEXT.getBytes(StandardCharsets.UTF_8)));
            payload.setSubtype("text/plain");
            attachment.setEmbeddedFileUnicode(payload);
            attachment.setEmbeddedFile(payload);
            var files = new PDEmbeddedFilesNameTreeNode();
            files.setNames(Map.of("source.txt", attachment));
            var names = new PDDocumentNameDictionary(pdf.getDocumentCatalog());
            names.setEmbeddedFiles(files);
            pdf.getDocumentCatalog().setNames(names);
            pdf.save(out);
            return new MockMultipartFile(
                    "fileInput", "sample.pdf", "application/pdf", out.toByteArray());
        }
    }

    private static PDDocument document() throws Exception {
        PDDocument pdf = new PDDocument();
        PDPage page = new PDPage();
        pdf.addPage(page);
        try (var content = new PDPageContentStream(pdf, page)) {
            content.beginText();
            content.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA), 12);
            content.newLineAtOffset(72, 700);
            content.showText(TEXT);
            content.endText();
        }
        return pdf;
    }

    private static byte[] zip(String name, byte[] bytes) throws Exception {
        var out = new ByteArrayOutputStream();
        try (var zip = new ZipOutputStream(out)) {
            zip.putNextEntry(new ZipEntry(name));
            zip.write(bytes);
            zip.closeEntry();
        }
        return out.toByteArray();
    }

    private static byte[] body(ResponseEntity<Resource> response) throws Exception {
        try (var in = response.getBody().getInputStream()) {
            return in.readAllBytes();
        }
    }

    private static void assertPdfText(byte[] bytes) throws Exception {
        try (PDDocument pdf = Loader.loadPDF(bytes)) {
            assertThat(new PDFTextStripper().getText(pdf)).contains(TEXT);
        }
    }
}
