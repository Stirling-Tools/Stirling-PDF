package stirling.software.SPDF.controller.api.converters;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.hamcrest.Matchers.containsString;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.mockStatic;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
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
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.common.filespecification.PDComplexFileSpecification;
import org.apache.pdfbox.pdmodel.common.filespecification.PDEmbeddedFile;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.apache.pdfbox.text.PDFTextStripper;
import org.apache.pdfbox.util.Matrix;
import org.apache.xmpbox.XMPMetadata;
import org.apache.xmpbox.xml.DomXmpParser;
import org.apache.xmpbox.xml.XmpSerializer;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.mockito.MockedStatic;
import org.springframework.context.support.StaticMessageSource;
import org.springframework.core.io.Resource;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.env.MockEnvironment;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import stirling.software.SPDF.config.EndpointConfiguration;
import stirling.software.SPDF.exception.GlobalExceptionHandler;
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
import stirling.software.officeconvert.pdfa.PdfToPdfA;
import stirling.software.officeconvert.topdf.OfficeToPdf;

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
        office = new OfficeConversionService(properties, factory, tempFiles);
        toPdf = new OfficeToPdfService(properties, tempFiles);
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
    @ValueSource(strings = {"txt", "md", "html"})
    void writesTextFormatsWithContent(String format) throws Exception {
        Path output = dir.resolve("output." + format);
        try (PDDocument pdf = document()) {
            office.convert(pdf, output, format, office.settings());
        }
        assertThat(Files.readString(output)).contains(TEXT);
    }

    @Test
    void htmlOutputRemainsAZipAndConvertsBack() throws Exception {
        var controller = new ConvertPDFToHtml(tempFiles, office);
        PDFFile request = new PDFFile();
        request.setFileInput(uploadPdf());
        byte[] zip = body(controller.processPdfToHTML(request));
        try (var in = new ZipInputStream(new ByteArrayInputStream(zip))) {
            assertThat(in.getNextEntry().getName()).isEqualTo("index.html");
            assertThat(new String(in.readAllBytes(), StandardCharsets.UTF_8)).contains(TEXT);
        }
        HTMLToPdfRequest html = new HTMLToPdfRequest();
        html.setFileInput(new MockMultipartFile("fileInput", "page.zip", "application/zip", zip));
        var toHtml = new ConvertHtmlToPDF(factory, tempFiles, toPdf);
        assertPdfText(body(toHtml.HtmlToPdf(html)));
    }

    @ParameterizedTest
    @ValueSource(booleans = {false, true})
    void markdownConvertsInBothDirections(boolean packaged) throws Exception {
        var toMarkdown =
                new ConvertPDFToMarkdown(
                        tempFiles, new stirling.software.common.pdf.BasicPdfMarkdownExtractor());
        PDFFile pdf = new PDFFile();
        pdf.setFileInput(uploadPdf());
        byte[] markdown = toMarkdown.processPdfToMarkdown(pdf).getBody();
        assertThat(new String(markdown, StandardCharsets.UTF_8)).contains(TEXT);
        GeneralFile request = new GeneralFile();
        request.setFileInput(
                new MockMultipartFile(
                        "fileInput",
                        packaged ? "notes.zip" : "notes.md",
                        "application/octet-stream",
                        packaged ? zip("index.md", markdown) : markdown));
        var controller = new ConvertMarkdownToPdf(factory, tempFiles, toPdf);
        assertPdfText(body(controller.markdownToPdf(request)));
    }

    @Test
    void htmlLimitErrorsNameTheDocumentNotATempFile() throws Exception {
        try (MockedStatic<OfficeToPdf> engine = mockStatic(OfficeToPdf.class)) {
            engine.when(
                            () ->
                                    OfficeToPdf.convert(
                                            any(Path.class),
                                            any(Path.class),
                                            any(OfficeToPdf.Options.class)))
                    .thenReturn(new OfficeToPdf.Result(1, false, List.of(), true));

            assertThatThrownBy(
                            () ->
                                    toPdf.convertHtml(
                                            "<p>x</p>".getBytes(StandardCharsets.UTF_8), false))
                    .isInstanceOf(IllegalArgumentException.class)
                    .hasMessageStartingWith("Converting the document would produce more than");
        }
    }

    @ParameterizedTest
    @CsvSource({
        "true,false,400,Only part of book.epub could be converted",
        "false,true,400,Converting book.epub would produce more than"
    })
    void ebookIncompleteOutputReturnsTheReasonToTheClient(
            boolean truncated, boolean pageLimited, int status, String reason) throws Exception {
        var controller =
                new ConvertEbookToPDFController(
                        factory, tempFiles, endpoints, mock(OfficeDocumentSanitizer.class), toPdf);
        var mvc =
                MockMvcBuilders.standaloneSetup(controller)
                        .setControllerAdvice(
                                new GlobalExceptionHandler(
                                        new StaticMessageSource(), new MockEnvironment()))
                        .build();
        try (MockedStatic<OfficeToPdf> engine = mockStatic(OfficeToPdf.class)) {
            engine.when(
                            () ->
                                    OfficeToPdf.convert(
                                            any(Path.class),
                                            any(Path.class),
                                            any(OfficeToPdf.Options.class)))
                    .thenReturn(new OfficeToPdf.Result(1, truncated, List.of(), pageLimited));

            mvc.perform(
                            multipart("/api/v1/convert/ebook/pdf")
                                    .file(
                                            new MockMultipartFile(
                                                    "fileInput",
                                                    "book.epub",
                                                    "application/epub+zip",
                                                    new byte[] {1})))
                    .andExpect(status().is(status))
                    .andExpect(jsonPath("$.detail").value(containsString(reason)));
        }
        try (var files = Files.list(dir)) {
            assertThat(files).isEmpty();
        }
    }

    @ParameterizedTest
    @ValueSource(strings = {"EPUB", "AZW3"})
    void ebooksConvertInBothDirections(String format) throws Exception {
        ConvertPdfToEpubRequest request = new ConvertPdfToEpubRequest();
        request.setFileInput(uploadPdf());
        request.setOutputFormat(ConvertPdfToEpubRequest.OutputFormat.valueOf(format));
        request.setDetectChapters(false);
        request.setTargetDevice(ConvertPdfToEpubRequest.TargetDevice.KINDLE_EINK_TEXT);
        var writer = new ConvertPDFToEpubController(office);
        byte[] ebook = body(writer.convertPdfToEpub(request));
        ConvertEbookToPdfRequest read = new ConvertEbookToPdfRequest();
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
                        factory, tempFiles, endpoints, mock(OfficeDocumentSanitizer.class), toPdf);
        assertPdfText(body(reader.convertEbookToPdf(read)));
    }

    @ParameterizedTest
    @CsvSource({"6,true", "3,false"})
    void pdfaRefusesDocumentsOverThePageLimit(int pages, boolean overLimit) throws Exception {
        properties.getSystem().setMaxPdfaConversionPages(5);
        var controller = new ConvertPDFToPDFA(null, null, null, tempFiles, properties, office);
        PdfToPdfARequest request = new PdfToPdfARequest();
        request.setOutputFormat("pdfa-2b");
        try (PDDocument pdf = new PDDocument();
                var out = new ByteArrayOutputStream()) {
            for (int i = 0; i < pages; i++) {
                pdf.addPage(new PDPage());
            }
            pdf.save(out);
            request.setFileInput(
                    new MockMultipartFile(
                            "fileInput", "long.pdf", "application/pdf", out.toByteArray()));
        }

        try (MockedStatic<PdfToPdfA> engine = mockStatic(PdfToPdfA.class)) {
            engine.when(
                            () ->
                                    PdfToPdfA.convert(
                                            any(Path.class),
                                            any(Path.class),
                                            any(PdfToPdfA.Options.class)))
                    .thenThrow(new IOException("converter refused"));

            if (overLimit) {
                assertThatThrownBy(() -> controller.pdfToPdfA(request))
                        .isInstanceOf(IllegalArgumentException.class)
                        .hasMessageContaining("limited to 5 pages");
            } else {
                assertThatThrownBy(() -> controller.pdfToPdfA(request))
                        .isInstanceOf(IOException.class)
                        .hasMessage("converter refused");
            }
        }
    }

    @Test
    void pdfaKeepsTheUploadNameAndDocumentInformation() throws Exception {
        var controller = new ConvertPDFToPDFA(null, null, null, tempFiles, properties, office);
        PdfToPdfARequest request = new PdfToPdfARequest();
        request.setOutputFormat("pdfa-2b");
        try (PDDocument pdf = document();
                var out = new ByteArrayOutputStream()) {
            pdf.getDocumentInformation().setTitle("Quarterly report");
            pdf.getDocumentInformation().setAuthor("Finance team");
            pdf.save(out);
            request.setFileInput(
                    new MockMultipartFile(
                            "fileInput", "report.pdf", "application/pdf", out.toByteArray()));
        }

        var response = controller.pdfToPdfA(request);

        assertThat(response.getHeaders().getContentDisposition().getFilename())
                .isEqualTo("report.pdf");
        try (PDDocument output = Loader.loadPDF(body(response))) {
            assertThat(output.getDocumentInformation().getTitle()).isEqualTo("Quarterly report");
            assertThat(output.getDocumentInformation().getAuthor()).isEqualTo("Finance team");
        }
    }

    @Test
    void pdfaKeepsEachPageTheRightWayUp() throws Exception {
        var controller = new ConvertPDFToPDFA(null, null, null, tempFiles, properties, office);
        PdfToPdfARequest request = new PdfToPdfARequest();
        request.setOutputFormat("pdfa-2b");
        List<Integer> rotations = List.of(0, 90, 270);
        try (PDDocument pdf = new PDDocument();
                var out = new ByteArrayOutputStream()) {
            for (int rotation : rotations) {
                pdf.addPage(sidewaysPage(pdf, rotation));
            }
            pdf.save(out);
            request.setFileInput(
                    new MockMultipartFile(
                            "fileInput", "scan.pdf", "application/pdf", out.toByteArray()));
        }

        try (PDDocument output = Loader.loadPDF(body(controller.pdfToPdfA(request)))) {
            assertThat(output.getPages())
                    .extracting(PDPage::getRotation)
                    .containsExactlyElementsOf(rotations);
            assertThat(output.getPages())
                    .extracting(PDPage::getMediaBox)
                    .allSatisfy(
                            box -> {
                                assertThat(box.getWidth()).isEqualTo(PDRectangle.A4.getWidth());
                                assertThat(box.getHeight()).isEqualTo(PDRectangle.A4.getHeight());
                            });
        }
    }

    @Test
    void attachmentsConvertAnOpenDocumentToCompliantPdfA3() throws Exception {
        VeraPDFService validator = new VeraPDFService();
        validator.initialize();
        var controller = new ConvertPDFToPDFA(null, validator, null, tempFiles, properties, office);

        byte[] output;
        try (PDDocument pdf = document()) {
            output = controller.convertPDDocumentToPDFA(pdf, "pdfa-3b");
        }

        assertPdfText(output);
        assertThat(validator.validatePDF(new ByteArrayInputStream(output)))
                .anySatisfy(
                        result -> {
                            assertThat(result.isCompliant()).isTrue();
                            assertThat(result.getStandard()).startsWith("3");
                        });
    }

    @ParameterizedTest
    @CsvSource({"html-endpoint,html", "html-endpoint,zip", "file-endpoint,html"})
    void htmlNeverReadsLocalFiles(String endpoint, String format) throws Exception {
        Path secret = dir.resolve("secret.png");
        javax.imageio.ImageIO.write(
                new java.awt.image.BufferedImage(40, 40, java.awt.image.BufferedImage.TYPE_INT_RGB),
                "png",
                secret.toFile());
        byte[] html =
                ("<html><body><p>"
                                + TEXT
                                + "</p><img src=\""
                                + secret.toUri()
                                + "\"><img src=\"../secret.png\"><img src=\"data:image/png;base64,"
                                + java.util.Base64.getEncoder().encodeToString(inlinePng())
                                + "\"></body></html>")
                        .getBytes(StandardCharsets.UTF_8);
        byte[] upload = format.equals("zip") ? zip("index.html", html) : html;
        byte[] pdf;
        if (endpoint.equals("html-endpoint")) {
            HTMLToPdfRequest request = new HTMLToPdfRequest();
            request.setFileInput(
                    new MockMultipartFile(
                            "fileInput", "page." + format, "application/octet-stream", upload));
            pdf = body(new ConvertHtmlToPDF(factory, tempFiles, toPdf).HtmlToPdf(request));
        } else {
            var sanitizer =
                    new OfficeDocumentSanitizer(
                            mock(stirling.software.common.service.SsrfProtectionService.class),
                            properties);
            GeneralFile request = new GeneralFile();
            request.setFileInput(
                    new MockMultipartFile("fileInput", "page.html", "text/html", upload));
            pdf =
                    body(
                            new ConvertOfficeController(factory, sanitizer, tempFiles, toPdf)
                                    .processFileToPDF(request));
        }

        assertPdfText(pdf);
        int images = 0;
        try (PDDocument document = Loader.loadPDF(pdf)) {
            for (var page : document.getPages()) {
                for (var name : page.getResources().getXObjectNames()) {
                    if (page.getResources().isImageXObject(name)) {
                        images++;
                    }
                }
            }
        }
        assertThat(images).as("only the inline image, nothing from the local disk").isEqualTo(1);
    }

    @Test
    void htmlPackageDrawsImagesFromInsideThePackage() throws Exception {
        byte[] page =
                ("<html><body><p>" + TEXT + "</p><img src=\"images/photo.png\"></body></html>")
                        .getBytes(StandardCharsets.UTF_8);
        byte[] pdf =
                htmlToPdf(
                        "page.zip",
                        zip(Map.of("index.html", page, "images/photo.png", inlinePng())));

        assertPdfText(pdf);
        assertThat(imageCount(pdf)).isEqualTo(1);
    }

    @Test
    void htmlZoomEnlargesTheContent() throws Exception {
        byte[] html =
                ("<html><body>" + ("<p>" + TEXT + "</p>").repeat(80) + "</body></html>")
                        .getBytes(StandardCharsets.UTF_8);

        int normal = pageCount(toPdf.convertHtml(html, false, 1f));
        int zoomed = pageCount(toPdf.convertHtml(html, false, 2f));

        assertThat(zoomed).isGreaterThan(normal);
    }

    private static int pageCount(byte[] pdf) throws IOException {
        try (PDDocument document = Loader.loadPDF(pdf)) {
            return document.getNumberOfPages();
        }
    }

    @Test
    void htmlPackageWithoutAPageIsRefused() throws Exception {
        byte[] upload = zip(Map.of("images/photo.png", inlinePng()));

        assertThatThrownBy(() -> htmlToPdf("page.zip", upload)).isInstanceOf(Exception.class);
    }

    @Test
    void htmlPackageOpensItsIndexPage() throws Exception {
        byte[] index =
                ("<html><body><p>" + TEXT + "</p></body></html>").getBytes(StandardCharsets.UTF_8);
        byte[] other =
                "<html><body><p>Unrelated page</p></body></html>".getBytes(StandardCharsets.UTF_8);
        byte[] pdf = htmlToPdf("page.zip", zip(Map.of("about.html", other, "index.html", index)));

        try (PDDocument document = Loader.loadPDF(pdf)) {
            assertThat(new PDFTextStripper().getText(document))
                    .contains(TEXT)
                    .doesNotContain("Unrelated page");
        }
    }

    @ParameterizedTest
    @ValueSource(strings = {"html", "zip"})
    void htmlScriptsNeverRun(String format) throws Exception {
        byte[] page =
                ("<html><body><p>"
                                + TEXT
                                + "</p><script>document.write('Injected by script')</script>"
                                + "</body></html>")
                        .getBytes(StandardCharsets.UTF_8);
        byte[] upload = format.equals("zip") ? zip("index.html", page) : page;

        byte[] pdf = htmlToPdf("page." + format, upload);

        try (PDDocument document = Loader.loadPDF(pdf)) {
            assertThat(new PDFTextStripper().getText(document))
                    .contains(TEXT)
                    .doesNotContain("Injected by script");
        }
    }

    @ParameterizedTest
    @CsvSource({"pdfa-1,1,B", "pdfa-2b,2,B", "pdfa-3b,3,B"})
    void pdfaRecordsTheProfileAndKeepsTheAuthorInXmp(String format, int part, String conformance)
            throws Exception {
        var controller = new ConvertPDFToPDFA(null, null, null, tempFiles, properties, office);
        PdfToPdfARequest request = new PdfToPdfARequest();
        request.setOutputFormat(format);
        try (PDDocument pdf = document();
                var out = new ByteArrayOutputStream()) {
            pdf.getDocumentInformation().setAuthor("Finance team");
            pdf.getDocumentInformation()
                    .setCreationDate(
                            new java.util.GregorianCalendar(
                                    2024, java.util.Calendar.MARCH, 5, 9, 30, 0));
            pdf.save(out);
            request.setFileInput(
                    new MockMultipartFile(
                            "fileInput", "report.pdf", "application/pdf", out.toByteArray()));
        }

        try (PDDocument output = Loader.loadPDF(body(controller.pdfToPdfA(request)));
                var xmp = output.getDocumentCatalog().getMetadata().exportXMPMetadata()) {
            XMPMetadata metadata = new DomXmpParser().parse(xmp);
            assertThat(metadata.getPDFAIdentificationSchema().getPart()).isEqualTo(part);
            assertThat(metadata.getPDFAIdentificationSchema().getConformance())
                    .isEqualTo(conformance);
            assertThat(metadata.getDublinCoreSchema().getCreators()).contains("Finance team");
            assertThat(metadata.getXMPBasicSchema().getCreateDate().get(java.util.Calendar.YEAR))
                    .isEqualTo(2024);
        }
    }

    @Test
    void pdfaReplacesStaleXmpIdentificationAndLeadsWithTheAuthor() throws Exception {
        XMPMetadata stale = XMPMetadata.createXMPMetadata();
        stale.createAndAddPDFAIdentificationSchema().setPart(1);
        var creators = stale.createAndAddDublinCoreSchema();
        for (int i = 0; i < 5_000; i++) {
            creators.addCreator("creator " + i);
        }
        var packet = new ByteArrayOutputStream();
        new XmpSerializer().serialize(stale, packet, true);

        XMPMetadata metadata = pdfaXmp("pdfa-2b", packet.toByteArray());

        assertThat(metadata.getPDFAIdentificationSchema().getPart()).isEqualTo(2);
        assertThat(metadata.getDublinCoreSchema().getCreators())
                .singleElement()
                .asString()
                .startsWith("Finance team");
    }

    @Test
    void pdfaReplacesAnOversizedXmpPacket() throws Exception {
        byte[] oversized =
                ("<?xpacket begin=\"\" id=\"W5M0MpCehiHzreSzNTczkc9d\"?><!--"
                                + "x".repeat(8 * 1024 * 1024)
                                + "--><x:xmpmeta xmlns:x=\"adobe:ns:meta/\"/>"
                                + "<?xpacket end=\"w\"?>")
                        .getBytes(StandardCharsets.UTF_8);

        XMPMetadata metadata = pdfaXmp("pdfa-2b", oversized);

        assertThat(metadata.getPDFAIdentificationSchema().getPart()).isEqualTo(2);
    }

    private XMPMetadata pdfaXmp(String format, byte[] existingXmp) throws Exception {
        var controller = new ConvertPDFToPDFA(null, null, null, tempFiles, properties, office);
        PdfToPdfARequest request = new PdfToPdfARequest();
        request.setOutputFormat(format);
        try (PDDocument pdf = document();
                var out = new ByteArrayOutputStream()) {
            pdf.getDocumentInformation().setAuthor("Finance team");
            var metadata = new org.apache.pdfbox.pdmodel.common.PDMetadata(pdf);
            metadata.importXMPMetadata(existingXmp);
            pdf.getDocumentCatalog().setMetadata(metadata);
            pdf.save(out);
            request.setFileInput(
                    new MockMultipartFile(
                            "fileInput", "report.pdf", "application/pdf", out.toByteArray()));
        }
        try (PDDocument output = Loader.loadPDF(body(controller.pdfToPdfA(request)));
                var xmp = output.getDocumentCatalog().getMetadata().exportXMPMetadata()) {
            return new DomXmpParser().parse(xmp);
        }
    }

    private byte[] htmlToPdf(String name, byte[] upload) throws Exception {
        HTMLToPdfRequest request = new HTMLToPdfRequest();
        request.setFileInput(
                new MockMultipartFile("fileInput", name, "application/octet-stream", upload));
        return body(new ConvertHtmlToPDF(factory, tempFiles, toPdf).HtmlToPdf(request));
    }

    private static int imageCount(byte[] pdf) throws Exception {
        int images = 0;
        try (PDDocument document = Loader.loadPDF(pdf)) {
            for (var page : document.getPages()) {
                for (var name : page.getResources().getXObjectNames()) {
                    if (page.getResources().isImageXObject(name)) {
                        images++;
                    }
                }
            }
        }
        return images;
    }

    private static byte[] zip(Map<String, byte[]> entries) throws Exception {
        var out = new ByteArrayOutputStream();
        try (var zip = new ZipOutputStream(out)) {
            for (var entry : new java.util.TreeMap<>(entries).entrySet()) {
                zip.putNextEntry(new ZipEntry(entry.getKey()));
                zip.write(entry.getValue());
                zip.closeEntry();
            }
        }
        return out.toByteArray();
    }

    private static byte[] inlinePng() throws Exception {
        var out = new ByteArrayOutputStream();
        javax.imageio.ImageIO.write(
                new java.awt.image.BufferedImage(8, 8, java.awt.image.BufferedImage.TYPE_INT_RGB),
                "png",
                out);
        return out.toByteArray();
    }

    @Test
    void pdfaTreatsANegativePageLimitAsUnlimited() throws Exception {
        properties.getSystem().setMaxPdfaConversionPages(-1);
        var controller = new ConvertPDFToPDFA(null, null, null, tempFiles, properties, office);
        PdfToPdfARequest request = new PdfToPdfARequest();
        request.setOutputFormat("pdfa-2b");
        request.setFileInput(uploadPdf());

        assertPdfText(body(controller.pdfToPdfA(request)));
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
        var controller = new ConvertOfficeController(factory, sanitizer, tempFiles, toPdf);
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
                                                        Files.readAllBytes(input))))
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
        request.setFileInput(
                new MockMultipartFile(
                        "fileInput", "book." + format, "application/octet-stream", input));
        var controller =
                new ConvertEbookToPDFController(
                        factory, tempFiles, endpoints, mock(OfficeDocumentSanitizer.class), toPdf);
        assertPdfText(body(controller.convertEbookToPdf(request)));
    }

    @ParameterizedTest
    @org.junit.jupiter.params.provider.CsvSource({
        "word,docx",
        "word,odt",
        "presentation,ppt",
        "presentation,pptx",
        "presentation,odp",
        "text,txt",
        "text,rtf",
        "xml,xml"
    })
    void existingPdfEndpointsConvertEveryFormat(String endpoint, String format) throws Exception {
        org.mockito.Mockito.when(endpoints.isEndpointEnabled("pdf-to-rtf")).thenReturn(true);
        var controller = new ConvertPDFToOffice(factory, tempFiles, office, endpoints);
        var mvc =
                org.springframework.test.web.servlet.setup.MockMvcBuilders.standaloneSetup(
                                controller)
                        .build();
        var response =
                mvc.perform(
                                org.springframework.test.web.servlet.request.MockMvcRequestBuilders
                                        .multipart("/api/v1/convert/pdf/" + endpoint)
                                        .file(uploadPdf())
                                        .param("outputFormat", format))
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
        var controller = new ConvertPDFToExcelController(factory, tempFiles);
        byte[] output = body(controller.pdfToExcel(request));
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

    /** A portrait page whose text reads upright only once its {@code /Rotate} is applied. */
    private static PDPage sidewaysPage(PDDocument pdf, int rotation) throws IOException {
        PDPage page = new PDPage(PDRectangle.A4);
        page.setRotation(rotation);
        try (var content = new PDPageContentStream(pdf, page)) {
            content.beginText();
            content.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA), 12);
            content.setTextMatrix(
                    Matrix.getRotateInstance(
                            Math.toRadians(rotation),
                            PDRectangle.A4.getWidth() / 2,
                            PDRectangle.A4.getHeight() / 2));
            content.showText(TEXT);
            content.endText();
        }
        return page;
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
