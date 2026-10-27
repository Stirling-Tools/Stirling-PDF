package stirling.software.SPDF.service;

import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.atLeastOnce;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.mockStatic;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.spy;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.IOException;
import java.io.OutputStream;
import java.lang.reflect.Field;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;

import org.apache.pdfbox.cos.COSArray;
import org.apache.pdfbox.cos.COSDictionary;
import org.apache.pdfbox.cos.COSFloat;
import org.apache.pdfbox.cos.COSInteger;
import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.cos.COSStream;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDResources;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.MockedStatic;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.mock.web.MockMultipartFile;

import stirling.software.SPDF.config.EndpointConfiguration;
import stirling.software.SPDF.service.pdfjson.PdfJsonFontService;
import stirling.software.SPDF.service.pdfjson.type3.Type3FontConversionService;
import stirling.software.SPDF.service.pdfjson.type3.Type3GlyphExtractor;
import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.service.TaskManager;
import stirling.software.common.util.ProcessExecutor;
import stirling.software.common.util.ProcessExecutor.ProcessExecutorResult;
import stirling.software.common.util.TempFileManager;

import tools.jackson.databind.DeserializationFeature;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.json.JsonMapper;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class PdfJsonConversionServiceCffFontTest {

    private static final byte[] SFD_PAYLOAD =
            ("SplineFontDB: 3.2\n"
                            + "FontName: Evil\n"
                            + "PickledData: \"cos\nsystem\n(S'true'\ntR.\"\n"
                            + "EndSplineFont\n")
                    .getBytes(StandardCharsets.US_ASCII);

    private static final byte[] CFF_PAYLOAD = {1, 0, 4, 1, 0, 0, 0, 0};

    @Mock private CustomPDFDocumentFactory pdfDocumentFactory;
    @Mock private EndpointConfiguration endpointConfiguration;
    @Mock private TempFileManager tempFileManager;
    @Mock private TaskManager taskManager;
    @Mock private PdfJsonFallbackFontService fallbackFontService;
    @Mock private Type3FontConversionService type3FontConversionService;
    @Mock private Type3GlyphExtractor type3GlyphExtractor;
    @Mock private ApplicationProperties applicationProperties;

    private final ObjectMapper objectMapper =
            JsonMapper.builder()
                    .disable(DeserializationFeature.FAIL_ON_NULL_FOR_PRIMITIVES)
                    .build();

    private final List<Path> createdTempFiles = new ArrayList<>();

    private PdfJsonFontService fontService;
    private PdfJsonConversionService service;

    @BeforeEach
    void setUp() throws Exception {
        fontService = spy(new PdfJsonFontService(tempFileManager, new ApplicationProperties()));
        setFontServiceField("cffConversionEnabled", true);
        setFontServiceField("cffConverterMethod", "fontforge");
        setFontServiceField("fontforgeCommand", "fontforge");
        setFontServiceField("fontForgeCffConverterAvailable", true);
        setFontServiceField("pythonCffConverterAvailable", false);

        service =
                new PdfJsonConversionService(
                        pdfDocumentFactory,
                        objectMapper,
                        endpointConfiguration,
                        tempFileManager,
                        taskManager,
                        new PdfJsonCosMapper(),
                        fallbackFontService,
                        fontService,
                        type3FontConversionService,
                        type3GlyphExtractor,
                        applicationProperties);

        when(tempFileManager.createTempFile(anyString()))
                .thenAnswer(
                        invocation -> {
                            Path path =
                                    Files.createTempFile(
                                            "pdfjson-cff-test", invocation.getArgument(0));
                            createdTempFiles.add(path);
                            return path.toFile();
                        });
        when(tempFileManager.deleteTempFile(any(File.class)))
                .thenAnswer(
                        invocation -> {
                            File file = invocation.getArgument(0);
                            return file != null && file.delete();
                        });
    }

    @AfterEach
    void tearDown() throws IOException {
        for (Path path : createdTempFiles) {
            Files.deleteIfExists(path);
        }
        createdTempFiles.clear();
    }

    @Test
    void sfdLabelledType1cNeverReachesFontForge() throws Exception {
        try (MockedStatic<ProcessExecutor> processExecutor = mockStatic(ProcessExecutor.class);
                PDDocument pdf = pdfWithType3FontFile3(SFD_PAYLOAD)) {
            stubCffConverter(processExecutor);
            when(pdfDocumentFactory.load(any(Path.class), eq(true))).thenReturn(pdf);

            service.convertPdfToJson(pdfMultipart(), new ByteArrayOutputStream());

            verify(fontService, atLeastOnce()).isCffFontProgram(SFD_PAYLOAD);
            verify(fontService, never()).convertCffProgramToTrueType(any(), any());
            verify(fontService, never()).convertCffUsingFontForge(any());
            processExecutor.verify(
                    () -> ProcessExecutor.getInstance(ProcessExecutor.Processes.CFF_CONVERTER),
                    never());
        }
    }

    @Test
    void cffLabelledType1cStillReachesFontForge() throws Exception {
        try (MockedStatic<ProcessExecutor> processExecutor = mockStatic(ProcessExecutor.class);
                PDDocument pdf = pdfWithType3FontFile3(CFF_PAYLOAD)) {
            stubCffConverter(processExecutor);
            when(pdfDocumentFactory.load(any(Path.class), eq(true))).thenReturn(pdf);

            ByteArrayOutputStream out = new ByteArrayOutputStream();
            service.convertPdfToJson(pdfMultipart(), out);

            verify(fontService, atLeastOnce()).convertCffUsingFontForge(CFF_PAYLOAD);
            processExecutor.verify(
                    () -> ProcessExecutor.getInstance(ProcessExecutor.Processes.CFF_CONVERTER),
                    atLeastOnce());
            assertTrue(out.toString(StandardCharsets.UTF_8).contains("\"pages\""));
        }
    }

    private void stubCffConverter(MockedStatic<ProcessExecutor> processExecutor) throws Exception {
        ProcessExecutor executor = mock(ProcessExecutor.class);
        ProcessExecutorResult result = mock(ProcessExecutorResult.class);
        when(result.getRc()).thenReturn(1);
        when(executor.runCommandWithOutputHandling(anyList())).thenReturn(result);
        processExecutor
                .when(() -> ProcessExecutor.getInstance(ProcessExecutor.Processes.CFF_CONVERTER))
                .thenReturn(executor);
    }

    private void setFontServiceField(String name, Object value) throws Exception {
        Field field = PdfJsonFontService.class.getDeclaredField(name);
        field.setAccessible(true);
        field.set(fontService, value);
    }

    private PDDocument pdfWithType3FontFile3(byte[] fontProgram) throws IOException {
        PDDocument document = new PDDocument();
        PDPage page = new PDPage(PDRectangle.LETTER);
        document.addPage(page);

        COSStream fontFile3 = document.getDocument().createCOSStream();
        fontFile3.setItem(COSName.SUBTYPE, COSName.getPDFName("Type1C"));
        try (OutputStream stream = fontFile3.createOutputStream()) {
            stream.write(fontProgram);
        }

        COSDictionary descriptor = new COSDictionary();
        descriptor.setItem(COSName.TYPE, COSName.FONT_DESC);
        descriptor.setName(COSName.FONT_NAME, "Evil");
        descriptor.setInt(COSName.FLAGS, 4);
        descriptor.setItem(COSName.FONT_BBOX, numbers(0, 0, 1000, 1000));
        descriptor.setInt(COSName.ITALIC_ANGLE, 0);
        descriptor.setInt(COSName.ASCENT, 800);
        descriptor.setInt(COSName.DESCENT, -200);
        descriptor.setInt(COSName.CAP_HEIGHT, 700);
        descriptor.setInt(COSName.STEM_V, 80);
        descriptor.setItem(COSName.FONT_FILE3, fontFile3);

        COSArray fontMatrix = new COSArray();
        fontMatrix.add(new COSFloat(0.001f));
        fontMatrix.add(COSInteger.ZERO);
        fontMatrix.add(COSInteger.ZERO);
        fontMatrix.add(new COSFloat(0.001f));
        fontMatrix.add(COSInteger.ZERO);
        fontMatrix.add(COSInteger.ZERO);

        COSDictionary font = new COSDictionary();
        font.setItem(COSName.TYPE, COSName.FONT);
        font.setItem(COSName.SUBTYPE, COSName.TYPE3);
        font.setItem(COSName.FONT_BBOX, numbers(0, 0, 1000, 1000));
        font.setItem(COSName.FONT_MATRIX, fontMatrix);
        font.setItem(COSName.CHAR_PROCS, new COSDictionary());
        font.setInt(COSName.FIRST_CHAR, 65);
        font.setInt(COSName.LAST_CHAR, 65);
        font.setItem(COSName.WIDTHS, numbers(1000));
        font.setItem(COSName.FONT_DESC, descriptor);

        COSDictionary fonts = new COSDictionary();
        fonts.setItem(COSName.getPDFName("F1"), font);
        COSDictionary resources = new COSDictionary();
        resources.setItem(COSName.FONT, fonts);
        page.setResources(new PDResources(resources));
        return document;
    }

    private static COSArray numbers(int... values) {
        COSArray array = new COSArray();
        for (int value : values) {
            array.add(COSInteger.get(value));
        }
        return array;
    }

    private static MockMultipartFile pdfMultipart() {
        return new MockMultipartFile(
                "fileInput",
                "input.pdf",
                "application/pdf",
                "%PDF-1.4 placeholder".getBytes(StandardCharsets.US_ASCII));
    }
}
