package stirling.software.SPDF.controller.api.converters;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.junit.jupiter.api.Assumptions.assumeTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.IOException;
import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.cos.COSArray;
import org.apache.pdfbox.cos.COSDictionary;
import org.apache.pdfbox.cos.COSFloat;
import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.PDResources;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.common.function.PDFunctionType2;
import org.apache.pdfbox.pdmodel.font.PDFont;
import org.apache.pdfbox.pdmodel.font.PDType0Font;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.PDType3Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.apache.pdfbox.pdmodel.graphics.color.PDDeviceRGB;
import org.apache.pdfbox.pdmodel.graphics.shading.PDShadingType3;
import org.apache.pdfbox.pdmodel.graphics.state.PDExtendedGraphicsState;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.Mock;
import org.mockito.MockedStatic;
import org.mockito.Mockito;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.core.io.Resource;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.server.ResponseStatusException;

import stirling.software.SPDF.model.api.converters.PdfToPdfARequest;
import stirling.software.SPDF.model.api.security.PDFVerificationResult;
import stirling.software.SPDF.service.VeraPDFService;
import stirling.software.common.configuration.RuntimePathConfig;
import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.service.PdfaLevelAServiceInterface;
import stirling.software.common.util.ProcessExecutor;
import stirling.software.common.util.ProcessExecutor.ProcessExecutorResult;
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;
import stirling.software.common.util.WebResponseUtils;

/**
 * Additional coverage for {@link ConvertPDFToPDFA} focusing on the end-to-end conversion flows
 * (handlePdfAConversion / handlePdfXConversion / convertPDDocumentToPDFA). PDF/X runs through
 * JPDFium in-process; PDF/A external boundaries are mocked with mockStatic so no real binary runs.
 */
@DisplayName("ConvertPDFToPDFA additional flow tests")
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class ConvertPDFToPDFAMoreTest {

    @TempDir Path tempDir;

    @Mock private RuntimePathConfig runtimePathConfig;
    @Mock private VeraPDFService veraPDFService;
    @Mock private PdfaLevelAServiceInterface pdfaLevelAService;
    @Mock private TempFileManager tempFileManager;

    private ConvertPDFToPDFA newController() {
        return new ConvertPDFToPDFA(
                runtimePathConfig,
                veraPDFService,
                pdfaLevelAService,
                tempFileManager,
                new ApplicationProperties(),
                mock(stirling.software.SPDF.service.OfficeConversionService.class));
    }

    private static ResponseEntity<Resource> streamingOk(byte[] bytes) {
        return ResponseEntity.ok(new ByteArrayResource(bytes));
    }

    // ---- reflection helpers ----------------------------------------------------------------

    @SuppressWarnings("unchecked")
    private <T> T invokeInstance(Object target, String methodName, Object... args)
            throws Exception {
        Method method = findMethod(methodName, args.length);
        method.setAccessible(true);
        try {
            return (T) method.invoke(target, args);
        } catch (InvocationTargetException e) {
            Throwable cause = e.getCause();
            if (cause instanceof Exception ex) {
                throw ex;
            }
            throw new RuntimeException(cause);
        }
    }

    private static Method findMethod(String methodName, int argCount) {
        for (Method method : ConvertPDFToPDFA.class.getDeclaredMethods()) {
            if (method.getName().equals(methodName) && method.getParameterCount() == argCount) {
                return method;
            }
        }
        throw new IllegalStateException(
                "No method " + methodName + " with " + argCount + " params");
    }

    private static Object resolvePdfaProfile(String token) throws Exception {
        Class<?> enumClass = null;
        for (Class<?> inner : ConvertPDFToPDFA.class.getDeclaredClasses()) {
            if (inner.getSimpleName().equals("PdfaProfile")) {
                enumClass = inner;
            }
        }
        Method m = enumClass.getDeclaredMethod("fromRequest", String.class);
        m.setAccessible(true);
        return m.invoke(null, token);
    }

    private static Object resolvePdfXProfile(String token) throws Exception {
        Class<?> enumClass = null;
        for (Class<?> inner : ConvertPDFToPDFA.class.getDeclaredClasses()) {
            if (inner.getSimpleName().equals("PdfXProfile")) {
                enumClass = inner;
            }
        }
        Method m = enumClass.getDeclaredMethod("fromRequest", String.class);
        m.setAccessible(true);
        return m.invoke(null, token);
    }

    // ---- pdf builders ----------------------------------------------------------------------

    private PDDocument simplePdf() throws IOException {
        PDDocument document = new PDDocument();
        PDPage page = new PDPage(PDRectangle.A4);
        document.addPage(page);
        try (PDPageContentStream cs = new PDPageContentStream(document, page)) {
            cs.beginText();
            cs.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA), 12);
            cs.newLineAtOffset(100, 700);
            cs.showText("hello world");
            cs.endText();
        }
        return document;
    }

    private byte[] simplePdfBytes() throws IOException {
        try (PDDocument document = simplePdf()) {
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            document.save(baos);
            return baos.toByteArray();
        }
    }

    private MockMultipartFile pdfFile() throws IOException {
        return new MockMultipartFile("fileInput", "input.pdf", "application/pdf", simplePdfBytes());
    }

    private MockMultipartFile type3ShadingPdf() throws IOException {
        try (PDDocument document = new PDDocument();
                ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            PDPage page = new PDPage(new PDRectangle(200, 200));
            document.addPage(page);
            PDShadingType3 shading = new PDShadingType3(new COSDictionary());
            shading.setShadingType(3);
            shading.setColorSpace(PDDeviceRGB.INSTANCE);
            COSArray coords = new COSArray();
            coords.add(COSFloat.get("100"));
            coords.add(COSFloat.get("100"));
            coords.add(COSFloat.get("0"));
            coords.add(COSFloat.get("100"));
            coords.add(COSFloat.get("100"));
            coords.add(COSFloat.get("100"));
            shading.setCoords(coords);
            COSDictionary function = new COSDictionary();
            function.setInt(COSName.getPDFName("FunctionType"), 2);
            function.setInt(COSName.getPDFName("N"), 1);
            COSArray c0 = new COSArray();
            c0.add(COSFloat.get("1"));
            c0.add(COSFloat.get("0"));
            c0.add(COSFloat.get("0"));
            COSArray c1 = new COSArray();
            c1.add(COSFloat.get("0"));
            c1.add(COSFloat.get("0"));
            c1.add(COSFloat.get("1"));
            function.setItem(COSName.getPDFName("C0"), c0);
            function.setItem(COSName.getPDFName("C1"), c1);
            shading.setFunction(new PDFunctionType2(function));
            try (PDPageContentStream content = new PDPageContentStream(document, page)) {
                content.shadingFill(shading);
            }
            document.save(output);
            return new MockMultipartFile(
                    "fileInput", "shading.pdf", "application/pdf", output.toByteArray());
        }
    }

    private static boolean ghostscriptAvailable() {
        try {
            return new ProcessBuilder("gs", "--version").start().waitFor() == 0;
        } catch (IOException | InterruptedException e) {
            if (e instanceof InterruptedException) Thread.currentThread().interrupt();
            return false;
        }
    }

    private MockMultipartFile symbolFontPdfFile() throws IOException {
        try (PDDocument document = new PDDocument();
                ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            PDPage page = new PDPage(PDRectangle.A4);
            document.addPage(page);
            PDType1Font font = new PDType1Font(Standard14Fonts.FontName.SYMBOL);
            PDResources resources = new PDResources();
            resources.put(COSName.getPDFName("F1"), font);
            page.setResources(resources);
            try (PDPageContentStream content = new PDPageContentStream(document, page)) {
                content.beginText();
                content.setFont(font, 12);
                content.newLineAtOffset(100, 700);
                content.showText("\u03b1\u03b2\u03b3");
                content.endText();
            }
            document.save(output);
            return new MockMultipartFile(
                    "fileInput", "symbol-font.pdf", "application/pdf", output.toByteArray());
        }
    }

    private MockMultipartFile customFontPdfFile() throws IOException {
        try (PDDocument document = new PDDocument();
                ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            PDPage page = new PDPage(PDRectangle.A4);
            document.addPage(page);
            PDType1Font font = new PDType1Font(Standard14Fonts.FontName.HELVETICA);
            font.getCOSObject().setName(COSName.BASE_FONT, "CustomSans");
            PDResources resources = new PDResources();
            resources.put(COSName.getPDFName("F1"), font);
            page.setResources(resources);
            try (PDPageContentStream content = new PDPageContentStream(document, page)) {
                content.beginText();
                content.setFont(font, 12);
                content.newLineAtOffset(100, 700);
                content.showText("custom font");
                content.endText();
            }
            document.save(output);
            return new MockMultipartFile(
                    "fileInput", "custom-font.pdf", "application/pdf", output.toByteArray());
        }
    }

    private MockMultipartFile transparentPdfFile() throws IOException {
        try (PDDocument document = new PDDocument();
                ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            PDPage page = new PDPage(PDRectangle.A4);
            document.addPage(page);
            PDExtendedGraphicsState transparent = new PDExtendedGraphicsState();
            transparent.setNonStrokingAlphaConstant(0.5f);
            try (PDPageContentStream content = new PDPageContentStream(document, page)) {
                content.setGraphicsStateParameters(transparent);
                content.setNonStrokingColor(1f, 0f, 0f);
                content.addRect(100, 100, 200, 200);
                content.fill();
            }
            document.save(output);
            return new MockMultipartFile(
                    "fileInput", "transparent.pdf", "application/pdf", output.toByteArray());
        }
    }

    /**
     * Sets up a single ProcessExecutor mock returned for every Processes value. The command list
     * decides the result: ghostscript conversion commands write a valid output pdf, version/probe
     * commands return rc 0, everything else returns rc 0 without side effects.
     */
    private ProcessExecutor wireProcessExecutor(MockedStatic<ProcessExecutor> pe, int gsConvertRc)
            throws Exception {
        ProcessExecutor executor = Mockito.mock(ProcessExecutor.class);
        pe.when(() -> ProcessExecutor.getInstance(any(ProcessExecutor.Processes.class)))
                .thenReturn(executor);
        pe.when(
                        () ->
                                ProcessExecutor.getInstance(
                                        any(ProcessExecutor.Processes.class), Mockito.anyBoolean()))
                .thenReturn(executor);

        ProcessExecutorResult okResult = mock(ProcessExecutorResult.class);
        lenient().when(okResult.getRc()).thenReturn(0);

        ProcessExecutorResult gsResult = mock(ProcessExecutorResult.class);
        lenient().when(gsResult.getRc()).thenReturn(gsConvertRc);
        lenient().when(gsResult.getMessages()).thenReturn("gs output");

        lenient()
                .when(executor.runCommandWithOutputHandling(any(List.class)))
                .thenAnswer(
                        invocation -> {
                            List<String> command = invocation.getArgument(0);
                            // The real ghostscript conversion command contains -sOutputFile=...
                            String outFileArg =
                                    command.stream()
                                            .filter(a -> a.startsWith("-sOutputFile="))
                                            .findFirst()
                                            .orElse(null);
                            if (outFileArg != null) {
                                Path out = Path.of(outFileArg.substring("-sOutputFile=".length()));
                                if (gsConvertRc == 0) {
                                    Files.write(out, simplePdfBytes());
                                }
                                return gsResult;
                            }
                            // qpdf normalize/clean writes its (last-arg) output file
                            if (command.contains("--normalize-content=y")) {
                                // qpdf produced file is the last argument
                                Path out = Path.of(command.getLast());
                                Files.write(out, simplePdfBytes());
                            }
                            return okResult;
                        });
        return executor;
    }

    private TempFile managedTempFile() throws IOException {
        File f = Files.createTempFile(tempDir, "managed", ".pdf").toFile();
        TempFile tf = mock(TempFile.class);
        lenient().when(tf.getFile()).thenReturn(f);
        lenient().when(tf.getPath()).thenReturn(f.toPath());
        return tf;
    }

    @Nested
    @DisplayName("isGhostscriptAvailable")
    class GhostscriptAvailability {

        @Test
        @DisplayName("true when gs --version returns rc 0")
        void availableWhenRcZero() throws Exception {
            try (MockedStatic<ProcessExecutor> pe = Mockito.mockStatic(ProcessExecutor.class)) {
                wireProcessExecutor(pe, 0);
                boolean available = invokeInstance(newController(), "isGhostscriptAvailable");
                assertThat(available).isTrue();
            }
        }

        @Test
        @DisplayName("false when probe throws")
        void unavailableWhenThrows() throws Exception {
            try (MockedStatic<ProcessExecutor> pe = Mockito.mockStatic(ProcessExecutor.class)) {
                ProcessExecutor executor = Mockito.mock(ProcessExecutor.class);
                pe.when(() -> ProcessExecutor.getInstance(any(ProcessExecutor.Processes.class)))
                        .thenReturn(executor);
                when(executor.runCommandWithOutputHandling(any(List.class)))
                        .thenThrow(new IOException("gs missing"));

                boolean available = invokeInstance(newController(), "isGhostscriptAvailable");
                assertThat(available).isFalse();
            }
        }
    }

    @Nested
    @DisplayName("handlePdfAConversion via pdfToPdfA endpoint")
    class PdfAConversion {

        @Test
        @DisplayName("Ghostscript success path returns the produced PDF/A-2b file")
        void ghostscriptSuccess() throws Exception {
            TempFile managed = managedTempFile();
            when(tempFileManager.createManagedTempFile(anyString())).thenReturn(managed);

            PdfToPdfARequest request = new PdfToPdfARequest();
            request.setFileInput(pdfFile());
            request.setOutputFormat("pdfa-2b");

            ResponseEntity<Resource> expected = streamingOk("ok".getBytes());

            try (MockedStatic<ProcessExecutor> pe = Mockito.mockStatic(ProcessExecutor.class);
                    MockedStatic<WebResponseUtils> wr =
                            Mockito.mockStatic(WebResponseUtils.class)) {
                wireProcessExecutor(pe, 0);
                wr.when(
                                () ->
                                        WebResponseUtils.pdfFileToWebResponse(
                                                any(TempFile.class), anyString()))
                        .thenReturn(expected);

                ResponseEntity<Resource> response = newController().pdfToPdfA(request);

                assertThat(response).isSameAs(expected);
                wr.verify(
                        () ->
                                WebResponseUtils.pdfFileToWebResponse(
                                        any(TempFile.class),
                                        org.mockito.ArgumentMatchers.contains("_PDFA-2b.pdf")));
            }
        }

        @Test
        @DisplayName("PDF/A-1b exercises the part-1 CIDSet/qpdf branch and succeeds")
        void pdfA1Success() throws Exception {
            TempFile managed = managedTempFile();
            when(tempFileManager.createManagedTempFile(anyString())).thenReturn(managed);

            PdfToPdfARequest request = new PdfToPdfARequest();
            request.setFileInput(pdfFile());
            request.setOutputFormat("pdfa-1");

            ResponseEntity<Resource> expected = streamingOk("ok".getBytes());

            try (MockedStatic<ProcessExecutor> pe = Mockito.mockStatic(ProcessExecutor.class);
                    MockedStatic<WebResponseUtils> wr =
                            Mockito.mockStatic(WebResponseUtils.class)) {
                wireProcessExecutor(pe, 0);
                wr.when(
                                () ->
                                        WebResponseUtils.pdfFileToWebResponse(
                                                any(TempFile.class), anyString()))
                        .thenReturn(expected);

                ResponseEntity<Resource> response = newController().pdfToPdfA(request);
                assertThat(response).isSameAs(expected);
            }
        }

        @Test
        @DisplayName("strict mode runs VeraPDF and a compliant result still returns the file")
        void strictCompliantSucceeds() throws Exception {
            TempFile managed = managedTempFile();
            when(tempFileManager.createManagedTempFile(anyString())).thenReturn(managed);

            PDFVerificationResult ok = new PDFVerificationResult();
            ok.setCompliant(true);
            ok.setStandard("2b");
            ok.setComplianceSummary("PDF/A-2b compliant");
            when(veraPDFService.validatePDF(any())).thenReturn(List.of(ok));

            PdfToPdfARequest request = new PdfToPdfARequest();
            request.setFileInput(pdfFile());
            request.setOutputFormat("pdfa-2b");
            request.setStrict(true);

            ResponseEntity<Resource> expected = streamingOk("ok".getBytes());

            try (MockedStatic<ProcessExecutor> pe = Mockito.mockStatic(ProcessExecutor.class);
                    MockedStatic<WebResponseUtils> wr =
                            Mockito.mockStatic(WebResponseUtils.class)) {
                wireProcessExecutor(pe, 0);
                wr.when(
                                () ->
                                        WebResponseUtils.pdfFileToWebResponse(
                                                any(TempFile.class), anyString()))
                        .thenReturn(expected);

                ResponseEntity<Resource> response = newController().pdfToPdfA(request);

                assertThat(response).isSameAs(expected);
                Mockito.verify(veraPDFService).validatePDF(any());
            }
        }
    }

    @Nested
    @DisplayName("handlePdfXConversion via pdfToPdfA endpoint")
    class PdfXConversion {

        @Test
        @DisplayName("all PDF/X profiles convert and return a PDF")
        void pdfXAllProfiles() throws Exception {
            for (String token : List.of("pdfx-1a", "pdfx-3", "pdfx-4", "pdfx-6")) {
                float version =
                        switch (token) {
                            case "pdfx-1a", "pdfx-3" -> 1.3f;
                            case "pdfx-4" -> 1.6f;
                            case "pdfx-6" -> 2.0f;
                            default -> throw new IllegalStateException(token);
                        };
                TempFile managed = managedTempFile();
                when(tempFileManager.createManagedTempFile(anyString())).thenReturn(managed);

                PdfToPdfARequest request = new PdfToPdfARequest();
                request.setFileInput(pdfFile());
                request.setOutputFormat(token);

                ResponseEntity<Resource> expected = streamingOk("ok".getBytes());
                try (MockedStatic<WebResponseUtils> wr =
                        Mockito.mockStatic(WebResponseUtils.class)) {
                    wr.when(
                                    () ->
                                            WebResponseUtils.pdfFileToWebResponse(
                                                    any(TempFile.class), anyString()))
                            .thenReturn(expected);
                    ResponseEntity<Resource> response = newController().pdfToPdfA(request);
                    assertThat(response).as(token).isSameAs(expected);
                    try (PDDocument output = Loader.loadPDF(managed.getFile())) {
                        assertThat(output.getVersion()).as(token).isEqualTo(version);
                        assertThat(
                                        output.getPage(0)
                                                .getCOSObject()
                                                .getDictionaryObject(COSName.TRIM_BOX))
                                .as(token)
                                .isNotNull();
                        assertThat(output.getDocumentInformation().getTitle())
                                .as(token)
                                .isNotBlank();
                    }
                }
            }
        }

        @Test
        @DisplayName("PDF/X-1a embeds a non-embedded Standard 14 font")
        void pdfX1aEmbedsStandardFont() throws Exception {
            TempFile managed = managedTempFile();
            when(tempFileManager.createManagedTempFile(anyString())).thenReturn(managed);

            PdfToPdfARequest request = new PdfToPdfARequest();
            request.setFileInput(pdfFile());
            request.setOutputFormat("pdfx-1a");

            ResponseEntity<Resource> expected = streamingOk("ok".getBytes());
            try (MockedStatic<WebResponseUtils> wr = Mockito.mockStatic(WebResponseUtils.class)) {
                wr.when(
                                () ->
                                        WebResponseUtils.pdfFileToWebResponse(
                                                any(TempFile.class), anyString()))
                        .thenReturn(expected);

                ResponseEntity<Resource> response = newController().pdfToPdfA(request);

                assertThat(response).isSameAs(expected);
                try (PDDocument output = Loader.loadPDF(managed.getFile())) {
                    PDResources resources = output.getPage(0).getResources();
                    assertThat(resources.getFontNames()).isNotEmpty();
                    for (var name : resources.getFontNames()) {
                        PDFont font = resources.getFont(name);
                        assertThat(font.isEmbedded()).as("font %s", font.getName()).isTrue();
                    }
                }
            }
        }

        @Test
        @DisplayName("PDF/X-1a substitutes a custom non-embedded simple font")
        void pdfX1aEmbedsCustomSimpleFont() throws Exception {
            TempFile managed = managedTempFile();
            when(tempFileManager.createManagedTempFile(anyString())).thenReturn(managed);

            PdfToPdfARequest request = new PdfToPdfARequest();
            request.setFileInput(customFontPdfFile());
            request.setOutputFormat("pdfx-1a");

            ResponseEntity<Resource> expected = streamingOk("ok".getBytes());
            try (MockedStatic<WebResponseUtils> wr = Mockito.mockStatic(WebResponseUtils.class)) {
                wr.when(
                                () ->
                                        WebResponseUtils.pdfFileToWebResponse(
                                                any(TempFile.class), anyString()))
                        .thenReturn(expected);

                assertThat(newController().pdfToPdfA(request)).isSameAs(expected);
                try (PDDocument output = Loader.loadPDF(managed.getFile())) {
                    PDResources resources = output.getPage(0).getResources();
                    assertThat(resources.getFontNames()).isNotEmpty();
                    for (var name : resources.getFontNames()) {
                        PDFont font = resources.getFont(name);
                        assertThat(font.isEmbedded()).as("font %s", font.getName()).isTrue();
                        assertThat(font.getName()).contains("Liberation");
                    }
                }
            }
        }

        @Test
        @DisplayName("PDF/X font substitution leaves composite and Type3 fonts alone")
        void pdfXFontSubstitutionSkipsUnsafeFontTypes() throws Exception {
            PDResources resources = mock(PDResources.class);
            PDType0Font composite = mock(PDType0Font.class);
            PDType3Font type3 = mock(PDType3Font.class);
            COSName compositeName = COSName.getPDFName("Composite");
            COSName type3Name = COSName.getPDFName("Type3");
            when(composite.isEmbedded()).thenReturn(false);
            when(type3.isEmbedded()).thenReturn(false);
            when(resources.getFontNames()).thenReturn(List.of(compositeName, type3Name));
            when(resources.getFont(compositeName)).thenReturn(composite);
            when(resources.getFont(type3Name)).thenReturn(type3);
            when(resources.getXObjectNames()).thenReturn(List.of());

            Method replace =
                    ConvertPDFToPDFA.class.getDeclaredMethod(
                            "replacePdfxFonts", PDDocument.class, PDResources.class, int.class);
            replace.setAccessible(true);
            try (PDDocument document = new PDDocument()) {
                assertThat((int) replace.invoke(newController(), document, resources, 0)).isZero();
                verify(resources, never()).put(any(COSName.class), any(PDFont.class));
            }
        }

        @Test
        @DisplayName("PDF/X embeds Symbol fonts with Ghostscript when available")
        void pdfXEmbedsSymbolFontWithGhostscript() throws Exception {
            assumeTrue(ghostscriptAvailable(), "Ghostscript is not installed");
            TempFile managed = managedTempFile();
            when(tempFileManager.createManagedTempFile(anyString())).thenReturn(managed);

            PdfToPdfARequest request = new PdfToPdfARequest();
            request.setFileInput(symbolFontPdfFile());
            request.setOutputFormat("pdfx-1a");
            request.setStrict(false);

            ResponseEntity<Resource> expected = streamingOk("ok".getBytes());
            try (MockedStatic<WebResponseUtils> wr = Mockito.mockStatic(WebResponseUtils.class)) {
                wr.when(
                                () ->
                                        WebResponseUtils.pdfFileToWebResponse(
                                                any(TempFile.class), anyString()))
                        .thenReturn(expected);

                assertThat(newController().pdfToPdfA(request)).isSameAs(expected);
                try (PDDocument output = Loader.loadPDF(managed.getFile())) {
                    PDResources resources = output.getPage(0).getResources();
                    assertThat(resources.getFontNames()).isNotEmpty();
                    for (var name : resources.getFontNames()) {
                        PDFont font = resources.getFont(name);
                        assertThat(font.isEmbedded()).as("font %s", font.getName()).isTrue();
                    }
                }
            }
        }

        @Test
        @DisplayName("PDF/X rejects Symbol fonts when Ghostscript is unavailable")
        void pdfXRejectsSymbolFontWithoutGhostscript() throws Exception {
            TempFile managed = managedTempFile();
            when(tempFileManager.createManagedTempFile(anyString())).thenReturn(managed);

            PdfToPdfARequest request = new PdfToPdfARequest();
            request.setFileInput(symbolFontPdfFile());
            request.setOutputFormat("pdfx-1a");
            request.setStrict(false);

            try (MockedStatic<ProcessExecutor> pe = Mockito.mockStatic(ProcessExecutor.class)) {
                ProcessExecutor executor = Mockito.mock(ProcessExecutor.class);
                pe.when(() -> ProcessExecutor.getInstance(any(ProcessExecutor.Processes.class)))
                        .thenReturn(executor);
                when(executor.runCommandWithOutputHandling(any(List.class)))
                        .thenThrow(new IOException("gs missing"));

                assertThatThrownBy(() -> newController().pdfToPdfA(request))
                        .isInstanceOf(ResponseStatusException.class)
                        .hasMessageContaining("Symbol");
            }
        }

        @Test
        @DisplayName("PDF/X-1a uses the Ghostscript fallback for non-Type-2 shading")
        void pdfX1aConvertsNonType2Shading() throws Exception {
            assumeTrue(ghostscriptAvailable(), "Ghostscript is not installed");
            TempFile managed = managedTempFile();
            when(tempFileManager.createManagedTempFile(anyString())).thenReturn(managed);

            PdfToPdfARequest request = new PdfToPdfARequest();
            request.setFileInput(type3ShadingPdf());
            request.setOutputFormat("pdfx-1a");

            ResponseEntity<Resource> expected = streamingOk("ok".getBytes());
            try (MockedStatic<WebResponseUtils> wr = Mockito.mockStatic(WebResponseUtils.class)) {
                wr.when(
                                () ->
                                        WebResponseUtils.pdfFileToWebResponse(
                                                any(TempFile.class), anyString()))
                        .thenReturn(expected);

                assertThat(newController().pdfToPdfA(request)).isSameAs(expected);
                try (PDDocument output = Loader.loadPDF(managed.getFile())) {
                    assertThat(output.getDocumentCatalog().getOutputIntents()).isNotEmpty();
                }
            }
        }

        @Test
        @DisplayName("PDF/X-1a flattens transparent pages instead of rejecting them")
        void pdfX1aFlattensTransparency() throws Exception {
            TempFile managed = managedTempFile();
            when(tempFileManager.createManagedTempFile(anyString())).thenReturn(managed);

            PdfToPdfARequest request = new PdfToPdfARequest();
            request.setFileInput(transparentPdfFile());
            request.setOutputFormat("pdfx-1a");

            ResponseEntity<Resource> expected = streamingOk("ok".getBytes());
            try (MockedStatic<WebResponseUtils> wr = Mockito.mockStatic(WebResponseUtils.class)) {
                wr.when(
                                () ->
                                        WebResponseUtils.pdfFileToWebResponse(
                                                any(TempFile.class), anyString()))
                        .thenReturn(expected);

                ResponseEntity<Resource> response = newController().pdfToPdfA(request);

                assertThat(response).isSameAs(expected);
                assertThat(managed.getFile()).exists();
                try (PDDocument output = Loader.loadPDF(managed.getFile())) {
                    assertThat(output.getVersion()).isEqualTo(1.3f);
                    assertThat(output.getDocumentCatalog().getOutputIntents()).isNotEmpty();
                }
            }
        }

        @Test
        @DisplayName("JPDFium success path returns the produced PDF/X file")
        void pdfXSuccess() throws Exception {
            TempFile managed = managedTempFile();
            when(tempFileManager.createManagedTempFile(anyString())).thenReturn(managed);

            PdfToPdfARequest request = new PdfToPdfARequest();
            request.setFileInput(pdfFile());
            request.setOutputFormat("pdfx");

            ResponseEntity<Resource> expected = streamingOk("ok".getBytes());

            try (MockedStatic<WebResponseUtils> wr = Mockito.mockStatic(WebResponseUtils.class)) {
                wr.when(
                                () ->
                                        WebResponseUtils.pdfFileToWebResponse(
                                                any(TempFile.class), anyString()))
                        .thenReturn(expected);

                ResponseEntity<Resource> response = newController().pdfToPdfA(request);

                assertThat(response).isSameAs(expected);
                assertThat(managed.getFile()).exists();
                assertThat(managed.getFile().length()).isGreaterThan(0);
                try (PDDocument output = Loader.loadPDF(managed.getFile())) {
                    assertThat(output.getDocumentCatalog().getOutputIntents()).isNotEmpty();
                    assertThat(output.getVersion()).isEqualTo(1.6f);
                }
                wr.verify(
                        () ->
                                WebResponseUtils.pdfFileToWebResponse(
                                        any(TempFile.class),
                                        org.mockito.ArgumentMatchers.contains("_PDFX.pdf")));
            }
        }
    }

    @Nested
    @DisplayName("convertPDDocumentToPDFA")
    class ConvertDocument {

        @Test
        @DisplayName("Ghostscript success returns converted bytes")
        void documentConversionSuccess() throws Exception {
            try (PDDocument document = simplePdf();
                    MockedStatic<ProcessExecutor> pe = Mockito.mockStatic(ProcessExecutor.class)) {
                wireProcessExecutor(pe, 0);

                byte[] converted = newController().convertPDDocumentToPDFA(document, "pdfa-2b");

                assertThat(converted).isNotNull();
                assertThat(converted.length).isGreaterThan(0);
            }
        }
    }

    @Nested
    @DisplayName("Ghostscript command builders")
    class CommandBuilders {

        @Test
        @DisplayName("buildGhostscriptCommand wires PDF/A part, devices and IO files")
        void buildsPdfACommand() throws Exception {
            Path workingDir = Files.createDirectories(tempDir.resolve("gs"));
            Path input = Files.write(workingDir.resolve("in.pdf"), simplePdfBytes());
            Path output = workingDir.resolve("out.pdf");
            Path rgb = Files.write(workingDir.resolve("rgb.icc"), new byte[] {1});
            Path gray = Files.write(workingDir.resolve("gray.icc"), new byte[] {1});
            Path defFile = Files.write(workingDir.resolve("def.ps"), new byte[] {1});

            Object colorProfiles = newColorProfiles(rgb, gray);
            Object profile = resolvePdfaProfile("pdfa-1");

            Method m =
                    ConvertPDFToPDFA.class.getDeclaredMethod(
                            "buildGhostscriptCommand",
                            Path.class,
                            Path.class,
                            colorProfiles.getClass(),
                            Path.class,
                            profile.getClass(),
                            Path.class);
            m.setAccessible(true);
            @SuppressWarnings("unchecked")
            List<String> command =
                    (List<String>)
                            m.invoke(
                                    null,
                                    input,
                                    output,
                                    colorProfiles,
                                    workingDir,
                                    profile,
                                    defFile);

            assertThat(command).isNotEmpty();
            assertThat(command.get(0)).isEqualTo("gs");
            assertThat(command).contains("-dPDFA=1", "-sDEVICE=pdfwrite", "-dEmbedAllFonts=true");
            assertThat(command).anyMatch(a -> a.startsWith("-sOutputFile="));
        }

        @Test
        @DisplayName("createPdfaDefFile writes a PDFA_def.ps with the profile title")
        void createsPdfaDef() throws Exception {
            Path workingDir = Files.createDirectories(tempDir.resolve("def"));
            Path rgb = Files.write(workingDir.resolve("rgb.icc"), new byte[] {1});
            Path gray = Files.write(workingDir.resolve("gray.icc"), new byte[] {1});

            Object colorProfiles = newColorProfiles(rgb, gray);
            Object profile = resolvePdfaProfile("pdfa-2b");

            Method m =
                    ConvertPDFToPDFA.class.getDeclaredMethod(
                            "createPdfaDefFile",
                            Path.class,
                            colorProfiles.getClass(),
                            profile.getClass());
            m.setAccessible(true);
            Path defFile = (Path) m.invoke(null, workingDir, colorProfiles, profile);

            assertThat(defFile).exists();
            String content = Files.readString(defFile);
            assertThat(content).contains("PDF/A-2b");
            assertThat(content).contains("OutputIntent");
        }

        @Test
        @DisplayName("prepareColorProfiles copies the sRGB icc and writes a gray profile")
        void preparesColorProfiles() throws Exception {
            Path workingDir = Files.createDirectories(tempDir.resolve("colors"));
            Object colorProfiles =
                    invokeInstance(newController(), "prepareColorProfiles", workingDir);
            assertThat(colorProfiles).isNotNull();

            Method rgbAccessor = colorProfiles.getClass().getDeclaredMethod("rgb");
            rgbAccessor.setAccessible(true);
            Path rgb = (Path) rgbAccessor.invoke(colorProfiles);
            assertThat(rgb).exists();
            assertThat(Files.size(rgb)).isGreaterThan(0L);
        }

        private Object newColorProfiles(Path rgb, Path gray) throws Exception {
            Class<?> recordClass = null;
            for (Class<?> inner : ConvertPDFToPDFA.class.getDeclaredClasses()) {
                if (inner.getSimpleName().equals("ColorProfiles")) {
                    recordClass = inner;
                }
            }
            var ctor = recordClass.getDeclaredConstructor(Path.class, Path.class);
            ctor.setAccessible(true);
            return ctor.newInstance(rgb, gray);
        }
    }

    @Nested
    @DisplayName("qpdf helpers")
    class QpdfHelpers {

        @Test
        @DisplayName("normalizePdfWithQpdf returns null when qpdf is unavailable")
        void normalizeUnavailable() throws Exception {
            Path input = Files.write(tempDir.resolve("n.pdf"), simplePdfBytes());
            try (MockedStatic<ProcessExecutor> pe = Mockito.mockStatic(ProcessExecutor.class)) {
                ProcessExecutor executor = Mockito.mock(ProcessExecutor.class);
                pe.when(() -> ProcessExecutor.getInstance(any(ProcessExecutor.Processes.class)))
                        .thenReturn(executor);
                ProcessExecutorResult notAvail = mock(ProcessExecutorResult.class);
                when(notAvail.getRc()).thenReturn(1);
                when(executor.runCommandWithOutputHandling(any(List.class))).thenReturn(notAvail);

                Path result = invokeInstance(newController(), "normalizePdfWithQpdf", input);
                assertThat(result).isNull();
            }
        }

        @Test
        @DisplayName("cleanCidSetWithQpdf returns null on exception")
        void cleanCidSetThrows() throws Exception {
            Path input = Files.write(tempDir.resolve("c.pdf"), simplePdfBytes());
            try (MockedStatic<ProcessExecutor> pe = Mockito.mockStatic(ProcessExecutor.class)) {
                ProcessExecutor executor = Mockito.mock(ProcessExecutor.class);
                pe.when(() -> ProcessExecutor.getInstance(any(ProcessExecutor.Processes.class)))
                        .thenReturn(executor);
                when(executor.runCommandWithOutputHandling(any(List.class)))
                        .thenThrow(new IOException("qpdf boom"));

                Path result = invokeInstance(newController(), "cleanCidSetWithQpdf", input);
                assertThat(result).isNull();
            }
        }
    }
}
