package stirling.software.SPDF.controller.api.converters;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;
import java.util.concurrent.TimeUnit;
import java.util.stream.Stream;
import java.util.zip.CRC32;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

import org.apache.commons.io.FileUtils;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.graphics.PDXObject;
import org.apache.pdfbox.pdmodel.graphics.image.PDImageXObject;
import org.apache.pdfbox.text.PDFTextStripper;
import org.apache.poi.poifs.filesystem.DirectoryNode;
import org.apache.poi.poifs.filesystem.DocumentInputStream;
import org.apache.poi.poifs.filesystem.POIFSFileSystem;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIf;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.MethodSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.mock.web.MockMultipartFile;

import stirling.software.SPDF.config.EndpointConfiguration;
import stirling.software.common.configuration.RuntimePathConfig;
import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.service.SsrfProtectionService;
import stirling.software.common.util.CustomHtmlSanitizer;
import stirling.software.common.util.OfficeDocumentSanitizer;
import stirling.software.common.util.TempFileManager;

/**
 * Converts one genuine fixture per allowlisted extension through the real controller path — real
 * sanitizers, real LibreOffice, the forced import filter — and asserts the PDF that comes back is
 * readable and still carries the input's content. Exit codes are not evidence: LibreOffice returns
 * 0 for a blank page.
 *
 * <p>Every extension gets a built fixture; the types the cucumber suite already ships an example
 * for are converted from that file as well, since a built fixture is only ever what LibreOffice
 * writes when asked for that extension.
 *
 * <p>The conversion cases need a LibreOffice install and are skipped without one; {@link
 * #everyAllowlistedExtensionIsAccountedFor()} runs everywhere, so adding an extension to {@code
 * OfficeImportFilters} without a fixture or an entry in {@link #UNTESTABLE} fails the build even
 * where LibreOffice is absent.
 */
@DisplayName("office conversion matrix")
class OfficeConversionMatrixTest {

    private static final String SENTINEL = "STIRLINGSENTINEL";

    /**
     * Extensions accepted by the endpoint that this matrix cannot exercise, because no fixture for
     * them can be produced here: LibreOffice imports them but has no export filter to write one,
     * and they are proprietary or obsolete enough that no sample ships with it. Read the matrix as
     * silent about these, never as evidence that they convert.
     */
    private static final Set<String> UNTESTABLE =
            Set.of("vsd", "lwp", "sdw", "sdc", "sdd", "sda", "svm");

    /**
     * The extensions allowed to reach LibreOffice with nothing stripped. Two groups, and the
     * difference matters when one of them is next touched.
     *
     * <p>Proven inert with a loopback listener: the spreadsheet text formats (a {@code WEBSERVICE}
     * or {@code DDE} formula imports live and is then refused by LibreOffice's own link-formula
     * gate, so this row is really a statement about that gate), {@code rtf} across 27 field, shape
     * and OLE-moniker vectors, {@code eps}, and the raster and metafile formats, which are decoded
     * to pixels with no reference-resolution step at all.
     *
     * <p>Unproven, and recorded as pass-through rather than as safe: {@code xls}, {@code xlt},
     * {@code ppt}, and the legacy binaries. LibreOffice's own export filters discard the linked
     * graphics and OLE objects a probe would need, so no fixture carrying a reference could be
     * built for them. {@code doc} is not in this set for exactly that reason — a fixture could be
     * built for it, and it fetched.
     */
    private static final Set<String> PASS_THROUGH =
            Set.copyOf(
                    List.of(
                            "rtf", "txt", "csv", "slk", "dif", "dbf", "json", "eps", "xls", "xlt",
                            "ppt", "vsd", "lwp", "sdw", "sdc", "sdd", "sda", "png", "jpg", "jpeg",
                            "gif", "bmp", "webp", "tif", "tiff", "wmf", "svm", "pct", "pbm", "pgm",
                            "ppm", "xbm", "xpm", "ras"));

    /**
     * Export filters used to write a fixture for extensions whose forced import filter is
     * import-only. Everything else is written with the very filter the controller forces on import,
     * so a new allowlist entry gets a fixture without a second table to maintain.
     */
    private static final Map<String, String> EXPORT_OVERRIDES =
            Map.ofEntries(
                    Map.entry("png", "draw_png_Export"),
                    Map.entry("jpg", "draw_jpg_Export"),
                    Map.entry("jpeg", "draw_jpg_Export"),
                    Map.entry("gif", "draw_gif_Export"),
                    Map.entry("bmp", "draw_bmp_Export"),
                    Map.entry("webp", "draw_webp_Export"),
                    Map.entry("tif", "draw_tif_Export"),
                    Map.entry("tiff", "draw_tif_Export"),
                    Map.entry("wmf", "draw_wmf_Export"),
                    Map.entry("svg", "draw_svg_Export"),
                    // Without a preview an EPS converts to a placeholder frame carrying only the
                    // DSC header as text, which no content assertion can be written against.
                    Map.entry(
                            "eps",
                            "draw_eps_Export:{\"Preview\":{\"type\":\"long\",\"value\":\"2\"}}"));

    private enum Expect {
        TEXT,
        IMAGE,
        /**
         * Only that a readable page came back. For the pre-97 Word candidates: LibreOffice has no
         * Word 95 export filter, so the only fixture obtainable here is a Word 97 document with its
         * {@code wIdent} rewritten, which the pre-97 reader loads and renders empty. That still
         * exercises the whole path — the wrong candidate refuses these bytes outright — but it
         * cannot carry text through.
         */
        PAGE
    }

    private record Case(String extension, Expect expect, String expectedText) {
        @Override
        public String toString() {
            return extension;
        }
    }

    private static Case text(String extension) {
        return new Case(extension, Expect.TEXT, SENTINEL);
    }

    private static Case text(String extension, String expected) {
        return new Case(extension, Expect.TEXT, expected);
    }

    private static Case image(String extension) {
        return new Case(extension, Expect.IMAGE, null);
    }

    private static List<Case> cases() {
        return List.of(
                text("docx"),
                text("docm"),
                text("dotx"),
                text("dotm"),
                text("doc"),
                text("dot"),
                text("odt"),
                text("ott"),
                text("fodt"),
                text("xml"),
                text("rtf"),
                text("txt"),
                text("md"),
                text("html"),
                text("htm"),
                text("sxw"),
                text("sxc"),
                text("sxg"),
                text("stw"),
                text("odm"),
                text("oth"),
                text("xlsx"),
                text("xlsm"),
                text("xltx"),
                text("xltm"),
                text("xls"),
                text("xlt"),
                text("ods"),
                text("ots"),
                text("fods"),
                text("csv"),
                text("slk"),
                text("dif"),
                text("dbf"),
                text("stc"),
                text("json", "SPDF7680"),
                text("pptx"),
                text("pptm"),
                text("potx"),
                text("potm"),
                text("ppsx"),
                text("ppsm"),
                text("ppt"),
                text("odp"),
                text("otp"),
                text("fodp"),
                text("sxi"),
                text("odg"),
                text("otg"),
                text("sxd"),
                text("svg"),
                text("wmf"),
                image("eps"),
                image("png"),
                image("jpg"),
                image("jpeg"),
                image("gif"),
                image("bmp"),
                image("webp"),
                image("tif"),
                image("tiff"),
                image("pbm"),
                image("pgm"),
                image("ppm"),
                image("xbm"),
                image("xpm"),
                image("ras"),
                text("pct"));
    }

    /**
     * The example files the cucumber suite ships, converted here as well as the built fixtures:
     * these are what Word, LibreOffice and a hand-written page actually produce, where a built
     * fixture is only ever what LibreOffice writes when asked for that extension.
     */
    private record RepositoryFixture(String extension, String file, String expectedText) {
        @Override
        public String toString() {
            return extension + " (" + file + ")";
        }
    }

    private static List<RepositoryFixture> repositoryFixtures() {
        return List.of(
                new RepositoryFixture("docx", "example.docx", "ABC"),
                new RepositoryFixture("odt", "example.odt", "ABC"),
                new RepositoryFixture("odp", "example.odp", "ABC"),
                new RepositoryFixture("pptx", "example.pptx", "ABC"),
                new RepositoryFixture("rtf", "example.rtf", "ABC"),
                new RepositoryFixture("html", "example.html", "MyFirstHeading"),
                new RepositoryFixture("md", "example.md", "PDFFeatures"),
                new RepositoryFixture(
                        "fodt", "security_flat_external.fodt", "flatODFsecurityfixture"),
                new RepositoryFixture(
                        "xml", "security_flat_external.xml", "flatODFsecurityfixture"));
    }

    /**
     * The StarOffice XML template extensions the allowlist deliberately omits, because LibreOffice
     * 26.8 cannot open one at all: the same package converts under {@code mediaType} and fails
     * under {@code templateMediaType}, which is the one a genuine template carries, with the filter
     * forced and under plain autodetection alike. The Calc and Writer templates in the same family
     * do load, so this is not LibreOffice dropping StarOffice templates wholesale. Pinned by {@link
     * #starOfficeTemplatePackagesStillDoNotLoad} so the entries come back if that ever changes.
     */
    private record StarOfficeTemplate(
            String extension,
            String importFilter,
            String templateMediaType,
            String mediaType,
            String documentClass) {
        @Override
        public String toString() {
            return extension;
        }
    }

    private static List<StarOfficeTemplate> starOfficeTemplates() {
        return List.of(
                new StarOfficeTemplate(
                        "sti",
                        "impress_StarOffice_XML_Impress_Template",
                        "application/vnd.sun.xml.impress.template",
                        "application/vnd.sun.xml.impress",
                        "presentation"),
                new StarOfficeTemplate(
                        "std",
                        "draw_StarOffice_XML_Draw_Template",
                        "application/vnd.sun.xml.draw.template",
                        "application/vnd.sun.xml.draw",
                        "drawing"));
    }

    @Test
    @DisplayName("every allowlisted extension is either exercised here or recorded as untestable")
    void everyAllowlistedExtensionIsAccountedFor() {
        Set<String> exercised = new TreeSet<>(cases().stream().map(Case::extension).toList());
        Set<String> accounted = new TreeSet<>(exercised);
        accounted.addAll(UNTESTABLE);

        assertThat(exercised).doesNotContainAnyElementsOf(UNTESTABLE);
        assertThat(accounted)
                .as("allowlist and matrix have drifted apart")
                .isEqualTo(new TreeSet<>(OfficeImportFilters.candidateFilters().keySet()));
    }

    @Test
    @DisplayName("every candidate names a filter and the sanitizer that filter needs")
    void everyCandidateIsComplete() {
        OfficeImportFilters.candidateFilters()
                .forEach(
                        (extension, candidates) -> {
                            assertThat(candidates).as(".%s has no filter", extension).isNotEmpty();
                            for (OfficeImportFilters.Candidate candidate : candidates) {
                                assertThat(candidate.importFilter())
                                        .as(".%s has a blank filter name", extension)
                                        .isNotBlank();
                                assertThat(candidate.sanitizer())
                                        .as(".%s declares no sanitizer", extension)
                                        .isNotNull();
                                assertThat(candidate.declares())
                                        .as(".%s declares no discriminator", extension)
                                        .isNotNull();
                            }
                        });
    }

    @Test
    @DisplayName("every extension that can carry markup declares a sanitizer for it")
    void noMarkupBearingExtensionPassesThroughUnsanitized() {
        Set<String> unsanitized = new TreeSet<>();
        OfficeImportFilters.candidateFilters()
                .forEach(
                        (extension, candidates) -> {
                            for (OfficeImportFilters.Candidate candidate : candidates) {
                                if (candidate.sanitizer()
                                        == OfficeImportFilters.SanitizerKind.NONE) {
                                    unsanitized.add(extension);
                                }
                            }
                        });

        assertThat(unsanitized)
                .as("a new extension may not reach LibreOffice unsanitized by omission")
                .isEqualTo(new TreeSet<>(PASS_THROUGH));
    }

    @Test
    @DisplayName("the example files this matrix borrows are still where it expects them")
    void repositoryFixturesArePresent() {
        Path directory = exampleFiles();
        assertThat(directory).as("testing/cucumber/exampleFiles").isNotNull();
        for (RepositoryFixture fixture : repositoryFixtures()) {
            assertThat(directory.resolve(fixture.file())).isRegularFile();
            assertThat(OfficeImportFilters.candidateFilters()).containsKey(fixture.extension());
        }
    }

    @ParameterizedTest(name = "{0}")
    @ValueSource(strings = {"xlsb", "vsdx", "wpd", "hwp", "pdf", "zip", "exe", "docx.exe", ""})
    @DisplayName("an extension outside the allowlist is refused before LibreOffice is invoked")
    void unknownExtensionIsRefusedBeforeLibreOfficeIsInvoked(String extension) {
        // A path that cannot be executed: reaching LibreOffice at all would surface as an IO
        // failure rather than the argument rejection asserted here.
        ConvertOfficeController controller = newController("/nonexistent/soffice");
        MockMultipartFile upload =
                new MockMultipartFile(
                        "fileInput",
                        "payload." + extension,
                        "application/octet-stream",
                        WRITER_SOURCE.getBytes(StandardCharsets.UTF_8));

        assertThatThrownBy(() -> controller.convertToPdf(upload))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("cases")
    @EnabledIf("sofficeAvailable")
    @DisplayName("converts to a readable pdf that still carries the input's content")
    void convertsToAReadablePdf(Case testCase) throws Exception {
        String extension = testCase.extension();
        Path staging = Files.createTempDirectory("matrix_" + extension + "_");
        try {
            byte[] fixture = buildFixture(extension, staging);
            assertThat(fixture).as("fixture for .%s", extension).isNotEmpty();
            convertAndAssert(
                    "built", extension, fixture, testCase.expect(), testCase.expectedText());
        } finally {
            FileUtils.deleteDirectory(staging.toFile());
        }
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("repositoryFixtures")
    @EnabledIf("sofficeAvailable")
    @DisplayName("converts the repository's own example file for the types that ship one")
    void convertsARepositoryFixtureToAReadablePdf(RepositoryFixture fixture) throws Exception {
        byte[] bytes = Files.readAllBytes(exampleFiles().resolve(fixture.file()));
        convertAndAssert("repo", fixture.extension(), bytes, Expect.TEXT, fixture.expectedText());
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("starOfficeTemplates")
    @EnabledIf("sofficeAvailable")
    @DisplayName("a StarOffice template package still fails to load, so the allowlist omits it")
    void starOfficeTemplatePackagesStillDoNotLoad(StarOfficeTemplate template) throws Exception {
        assertThat(OfficeImportFilters.candidateFilters()).doesNotContainKey(template.extension());

        Path staging = Files.createTempDirectory("dead_" + template.extension() + "_");
        try {
            byte[] asTemplate =
                    starOfficePackage(
                            template.templateMediaType(), template.documentClass(), DRAW_BODY);
            assertThat(convertWithForcedFilter(asTemplate, template, staging))
                    .as(
                            ".%s now loads; give it an allowlist entry rather than leaving it"
                                    + " pinned here",
                            template.extension())
                    .isNotZero();

            // The same package under the media type a genuine document carries does load, so the
            // filter name is sound and it is the template media type LibreOffice refuses.
            byte[] asDocument =
                    starOfficePackage(template.mediaType(), template.documentClass(), DRAW_BODY);
            assertThat(convertWithForcedFilter(asDocument, template, staging)).isZero();
        } finally {
            FileUtils.deleteDirectory(staging.toFile());
        }
    }

    private int convertWithForcedFilter(byte[] fixture, StarOfficeTemplate template, Path staging)
            throws Exception {
        Path work = Files.createTempDirectory(staging, "run");
        Path input = work.resolve("fixture." + template.extension());
        Files.write(input, fixture);
        Path profile = work.resolve("profile");
        Files.createDirectories(profile);
        Process process =
                new ProcessBuilder(
                                soffice(),
                                "-env:UserInstallation=" + profile.toUri(),
                                "--headless",
                                "--nologo",
                                "--infilter=" + template.importFilter(),
                                "--convert-to",
                                "pdf",
                                "--outdir",
                                work.toString(),
                                input.toString())
                        .redirectErrorStream(true)
                        .start();
        process.getInputStream().readAllBytes();
        if (!process.waitFor(3, TimeUnit.MINUTES)) {
            process.destroyForcibly();
            throw new IllegalStateException("timed out loading a ." + template.extension());
        }
        try (Stream<Path> written = Files.list(work)) {
            boolean pdf = written.anyMatch(p -> p.getFileName().toString().endsWith(".pdf"));
            return process.exitValue() == 0 && pdf ? 0 : 1;
        }
    }

    /**
     * One way an extension with several candidate filters can legitimately arrive. {@code source}
     * names the fixture builder; {@code expectedFilter} is the filter that candidate set must
     * force, which is the half a conversion cannot check — LibreOffice ignores a filter name it
     * cannot resolve and quietly autodetects instead.
     */
    private record CandidateCase(
            String extension,
            String source,
            String expectedFilter,
            Expect expect,
            String expectedText) {

        CandidateCase(String extension, String source, String expectedFilter, String expectedText) {
            this(extension, source, expectedFilter, Expect.TEXT, expectedText);
        }

        @Override
        public String toString() {
            return extension + " as " + source;
        }
    }

    private static List<CandidateCase> candidateCases() {
        return List.of(
                new CandidateCase("doc", "word97", "MS Word 97", SENTINEL),
                new CandidateCase("doc", "word95", "MS Word 95", Expect.PAGE, null),
                new CandidateCase("doc", "winword6", "MS Word 95", Expect.PAGE, null),
                new CandidateCase("doc", "word2003xml", "MS Word 2003 XML", SENTINEL),
                new CandidateCase("dot", "word97", "MS Word 97 Vorlage", SENTINEL),
                new CandidateCase("dot", "word95", "MS Word 95 Vorlage", Expect.PAGE, null),
                new CandidateCase("xls", "excel97", "MS Excel 97", SENTINEL),
                new CandidateCase("xls", "biff4", "MS Excel 97", "1234.5"),
                new CandidateCase("xls", "excel2003xml", "MS Excel 2003 XML Orcus", SENTINEL),
                new CandidateCase("xlt", "excel97", "MS Excel 97 Vorlage/Template", SENTINEL),
                new CandidateCase("ppt", "powerpoint97", "MS PowerPoint 97", SENTINEL),
                new CandidateCase("xml", "excel2003xml", "MS Excel 2003 XML Orcus", SENTINEL),
                new CandidateCase("xml", "word2003xml", "MS Word 2003 XML", SENTINEL),
                new CandidateCase("xml", "flatWriter", "OpenDocument Text Flat XML", SENTINEL),
                new CandidateCase("xml", "flatCalc", "OpenDocument Spreadsheet Flat XML", SENTINEL),
                new CandidateCase(
                        "xml", "flatImpress", "OpenDocument Presentation Flat XML", SENTINEL),
                new CandidateCase("xml", "flatDraw", "OpenDocument Drawing Flat XML", SENTINEL),
                new CandidateCase("odt", "package", "writer8", SENTINEL),
                new CandidateCase("odt", "flatWriter", "OpenDocument Text Flat XML", SENTINEL),
                new CandidateCase("ods", "package", "calc8", SENTINEL),
                new CandidateCase("ods", "flatCalc", "OpenDocument Spreadsheet Flat XML", SENTINEL),
                new CandidateCase("odp", "package", "impress8", SENTINEL),
                new CandidateCase(
                        "odp", "flatImpress", "OpenDocument Presentation Flat XML", SENTINEL),
                new CandidateCase("odg", "package", "draw8", SENTINEL),
                new CandidateCase("odg", "flatDraw", "OpenDocument Drawing Flat XML", SENTINEL));
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("candidateCases")
    @EnabledIf("sofficeAvailable")
    @DisplayName("each candidate of a multi-format extension is chosen and converts")
    void eachCandidateIsChosenFromTheDocumentsOwnDeclaration(CandidateCase testCase)
            throws Exception {
        Path staging = Files.createTempDirectory("candidate_" + testCase.extension() + "_");
        try {
            byte[] fixture = candidateFixture(testCase.extension(), testCase.source(), staging);
            assertThat(fixture).as("fixture %s", testCase.source()).isNotEmpty();

            assertThat(forcedFilter(testCase.extension(), fixture))
                    .as("wrong candidate chosen for .%s", testCase.extension())
                    .isEqualTo(testCase.expectedFilter());

            convertAndAssert(
                    "cand",
                    testCase.extension(),
                    fixture,
                    testCase.expect(),
                    testCase.expectedText());
        } finally {
            FileUtils.deleteDirectory(staging.toFile());
        }
    }

    /**
     * A file whose extension is allowlisted but whose bytes declare none of that extension's
     * candidates. LibreOffice refuses every one of these under every candidate filter, so the only
     * question is whether the endpoint says so before spawning a converter or after it fails.
     */
    private record NoMatchCase(String extension, String source) {
        @Override
        public String toString() {
            return extension + " as " + source;
        }
    }

    private static List<NoMatchCase> noMatchCases() {
        return List.of(
                new NoMatchCase("doc", "html"),
                new NoMatchCase("doc", "plaintext"),
                new NoMatchCase("dot", "html"),
                new NoMatchCase("xls", "html"),
                new NoMatchCase("xls", "plaintext"),
                new NoMatchCase("xlt", "html"),
                new NoMatchCase("ppt", "html"),
                new NoMatchCase("xml", "html"),
                new NoMatchCase("xml", "undeclaredXml"),
                new NoMatchCase("odt", "html"),
                new NoMatchCase("ods", "html"),
                new NoMatchCase("odp", "html"),
                new NoMatchCase("odg", "html"));
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("noMatchCases")
    @DisplayName("bytes that declare no candidate are refused before LibreOffice is invoked")
    void undeclaredContentIsRefusedBeforeLibreOfficeIsInvoked(NoMatchCase testCase)
            throws Exception {
        Path staging = Files.createTempDirectory("nomatch_" + testCase.extension() + "_");
        try {
            byte[] fixture = noMatchFixture(testCase.source());
            // A path that cannot be executed: reaching LibreOffice would surface as an IO failure
            // rather than the argument rejection asserted here.
            ConvertOfficeController controller = newController("/nonexistent/soffice");

            assertThatThrownBy(() -> controller.convertToPdf(upload(testCase.extension(), fixture)))
                    .isInstanceOf(IllegalArgumentException.class)
                    .hasMessageNotContaining(testCase.extension());
        } finally {
            FileUtils.deleteDirectory(staging.toFile());
        }
    }

    @Test
    @DisplayName("a markdown upload keeps its content and loses every outbound reference")
    void markdownReferencesAreStrippedAndTheDocumentSurvives() {
        String markdown =
                """
                # KEEPHEADING

                ![remote](http://127.0.0.1:1/A-INLINE)
                ![titled](http://127.0.0.1:1/B-TITLE "t")
                ![angle](<http://127.0.0.1:1/C-ANGLE>)
                ![full][r1]
                ![collapsed][]
                ![shortcut]
                <img src="http://127.0.0.1:1/D-RAW-HTML">

                <table><tr><td background="http://127.0.0.1:1/E-BGATTR">x</td></tr></table>

                <p style="background:url(http://127.0.0.1:1/F-CSS)">y</p>

                [r1]: http://127.0.0.1:1/G-REFDEF
                [collapsed]: http://127.0.0.1:1/H-COLLAPSED
                [shortcut]: http://127.0.0.1:1/I-SHORTCUT

                Keep the data image: ![d](data:image/gif;base64,R0lGOD)

                Keep the link: [docs](https://example.com/docs) and KEEPTAIL.

                ```java
                int answer = 42; // <img src="http://127.0.0.1:1/J-FENCED">
                ```
                """;

        ApplicationProperties applicationProperties = new ApplicationProperties();
        String sanitized =
                MarkdownSanitizer.sanitize(
                        markdown,
                        new CustomHtmlSanitizer(
                                new SsrfProtectionService(applicationProperties),
                                applicationProperties));

        assertThat(sanitized)
                .doesNotContain(
                        "A-INLINE",
                        "B-TITLE",
                        "C-ANGLE",
                        "D-RAW-HTML",
                        "E-BGATTR",
                        "F-CSS",
                        "G-REFDEF",
                        "H-COLLAPSED",
                        "I-SHORTCUT");
        assertThat(sanitized).contains("KEEPHEADING", "KEEPTAIL");
        assertThat(sanitized).contains("data:image/gif;base64,R0lGOD");
        assertThat(sanitized).contains("https://example.com/docs");
        assertThat(sanitized)
                .as("a reference inside a code fence is content, and must survive verbatim")
                .contains("int answer = 42; // <img src=\"http://127.0.0.1:1/J-FENCED\">");
    }

    @Test
    @EnabledIf("sofficeAvailable")
    @DisplayName("a Word binary of an unrecognised generation is refused, not guessed at")
    void wordBinaryOfAnUnknownGenerationIsRefused() throws Exception {
        Path staging = Files.createTempDirectory("badwident_");
        try {
            byte[] unknown = patchWIdent(candidateFixture("doc", "word97", staging), 0x1234);
            ConvertOfficeController controller = newController("/nonexistent/soffice");

            assertThatThrownBy(() -> controller.convertToPdf(upload("doc", unknown)))
                    .isInstanceOf(IllegalArgumentException.class);
        } finally {
            FileUtils.deleteDirectory(staging.toFile());
        }
    }

    @Test
    @EnabledIf("sofficeAvailable")
    @DisplayName("a word binary's INCLUDEPICTURE is blanked and the document still converts")
    void wordBinaryFieldReferencesAreBlanked() throws Exception {
        Path staging = Files.createTempDirectory("wordfield_");
        try {
            byte[] linked =
                    export(writeTemp(".fodt", WRITER_LINKED_SOURCE), "doc", "MS Word 97", staging);
            assertThat(new String(linked, StandardCharsets.ISO_8859_1))
                    .as("the export must carry the field this test is about")
                    .contains(utf16("INCLUDEPICTURE"));

            Path staged = staging.resolve("field.doc");
            Files.write(staged, linked);
            WordBinarySanitizer.sanitizeInPlace(staged);

            String sanitized = new String(Files.readAllBytes(staged), StandardCharsets.ISO_8859_1);
            assertThat(sanitized).doesNotContain(utf16("INCLUDEPICTURE"));
            assertThat(sanitized).doesNotContain(utf16("127.0.0.1"));

            convertAndAssert("field", "doc", Files.readAllBytes(staged), Expect.TEXT, SENTINEL);
        } finally {
            FileUtils.deleteDirectory(staging.toFile());
        }
    }

    /** The UTF-16LE form a WW8 text run stores, read back as latin-1 so it can be searched for. */
    private static String utf16(String text) {
        StringBuilder encoded = new StringBuilder();
        for (char character : text.toCharArray()) {
            encoded.append(character).append((char) 0);
        }
        return encoded.toString();
    }

    /** The filter the candidate set forces for these bytes under this extension. */
    private static String forcedFilter(String extension, byte[] fixture) throws IOException {
        Path staged = Files.createTempFile("resolve_", "." + extension);
        try {
            Files.write(staged, fixture);
            OfficeImportFilters.Candidate candidate =
                    OfficeImportFilters.resolve(extension, staged);
            assertThat(candidate).as("no candidate matched a .%s fixture", extension).isNotNull();
            return candidate.importFilter();
        } finally {
            Files.deleteIfExists(staged);
        }
    }

    private byte[] candidateFixture(String extension, String source, Path staging)
            throws Exception {
        return switch (source) {
            case "word97" ->
                    export(writeTemp(".fodt", WRITER_SOURCE), "doc", "MS Word 97", staging);
            case "word95" -> patchWIdent(candidateFixture(extension, "word97", staging), 0xA5DC);
            case "winword6" -> patchWIdent(candidateFixture(extension, "word97", staging), 0xA5DB);
            case "word2003xml" ->
                    export(writeTemp(".fodt", WRITER_SOURCE), "xml", "MS Word 2003 XML", staging);
            case "excel97" ->
                    export(writeTemp(".fods", CALC_SOURCE), "xls", "MS Excel 97", staging);
            case "excel2003xml" ->
                    export(writeTemp(".fods", CALC_SOURCE), "xml", "MS Excel 2003 XML", staging);
            case "powerpoint97" ->
                    export(writeTemp(".fodp", IMPRESS_SOURCE), "ppt", "MS PowerPoint 97", staging);
            case "biff4" -> flatBiff4();
            case "flatWriter" -> WRITER_SOURCE.getBytes(StandardCharsets.UTF_8);
            case "flatCalc" -> CALC_SOURCE.getBytes(StandardCharsets.UTF_8);
            case "flatImpress" -> IMPRESS_SOURCE.getBytes(StandardCharsets.UTF_8);
            case "flatDraw" -> DRAW_SOURCE.getBytes(StandardCharsets.UTF_8);
            case "package" ->
                    export(
                            sourceFor(extension),
                            extension,
                            OfficeImportFilters.forExtension(extension).getFirst().importFilter(),
                            staging);
            default -> throw new IllegalArgumentException("no candidate fixture " + source);
        };
    }

    private static byte[] noMatchFixture(String source) {
        return switch (source) {
            case "html" ->
                    ("<html><body><img src=\"http://127.0.0.1:1/LEAK\">"
                                    + "<table><tr><td background=\"http://127.0.0.1:1/BG\">x</td>"
                                    + "</tr></table></body></html>")
                            .getBytes(StandardCharsets.UTF_8);
            case "plaintext" ->
                    "Just some prose, with no declaration of any kind."
                            .getBytes(StandardCharsets.UTF_8);
            case "undeclaredXml" ->
                    "<?xml version=\"1.0\"?><root><child>x</child></root>"
                            .getBytes(StandardCharsets.UTF_8);
            default -> throw new IllegalArgumentException("no no-match fixture " + source);
        };
    }

    /**
     * Rewrites the {@code wIdent} at the head of the {@code WordDocument} stream, MS-DOC 2.5.1,
     * which is the whole of what selects a Word generation. Two bytes, in the compound file's
     * mini-stream for a document this size, so it is read and written through POI rather than
     * patched at a file offset.
     */
    private static byte[] patchWIdent(byte[] document, int wIdent) throws IOException {
        Path file = Files.createTempFile("wident_", ".doc");
        try {
            Files.write(file, document);
            try (POIFSFileSystem fileSystem = new POIFSFileSystem(file.toFile(), false)) {
                DirectoryNode root = fileSystem.getRoot();
                byte[] stream;
                try (DocumentInputStream in =
                        fileSystem.createDocumentInputStream("WordDocument")) {
                    stream = in.readAllBytes();
                }
                stream[0] = (byte) (wIdent & 0xFF);
                stream[1] = (byte) ((wIdent >>> 8) & 0xFF);
                root.getEntry("WordDocument").delete();
                root.createDocument("WordDocument", new ByteArrayInputStream(stream));
                fileSystem.writeFilesystem();
            }
            return Files.readAllBytes(file);
        } finally {
            Files.deleteIfExists(file);
        }
    }

    /**
     * A BIFF4 worksheet as a bare record stream: BOF, two NUMBER records, EOF. Excel 4 wrote these
     * without a compound file wrapper, and LibreOffice still reads one under the Excel 97 filter —
     * the four BIFF filter names are aliases for a reader that sniffs the version itself.
     */
    private static byte[] flatBiff4() throws IOException {
        ByteArrayOutputStream sheet = new ByteArrayOutputStream();
        writeBiffRecord(sheet, 0x0409, shorts(0x0400, 0x0010, 0x0000));
        writeBiffRecord(sheet, 0x0203, cell(0, 1234.5));
        writeBiffRecord(sheet, 0x0203, cell(1, 6789.0));
        writeBiffRecord(sheet, 0x000A, new byte[0]);
        return sheet.toByteArray();
    }

    private static byte[] cell(int row, double value) {
        byte[] number = new byte[14];
        writeLittleEndianShort(number, 0, row);
        long bits = Double.doubleToLongBits(value);
        for (int i = 0; i < 8; i++) {
            number[6 + i] = (byte) (bits >>> (8 * i));
        }
        return number;
    }

    private static byte[] shorts(int... values) {
        byte[] bytes = new byte[values.length * 2];
        for (int i = 0; i < values.length; i++) {
            writeLittleEndianShort(bytes, i * 2, values[i]);
        }
        return bytes;
    }

    private static void writeBiffRecord(ByteArrayOutputStream out, int record, byte[] payload)
            throws IOException {
        out.write(shorts(record, payload.length));
        out.write(payload);
    }

    private static void writeLittleEndianShort(byte[] bytes, int offset, int value) {
        bytes[offset] = (byte) (value & 0xFF);
        bytes[offset + 1] = (byte) ((value >>> 8) & 0xFF);
    }

    private void convertAndAssert(
            String origin, String extension, byte[] fixture, Expect expect, String expectedText)
            throws Exception {
        File produced = newController().convertToPdf(upload(extension, fixture));
        try {
            byte[] pdf = Files.readAllBytes(produced.toPath());
            assertThat(pdf).as(".%s produced no bytes", extension).isNotEmpty();
            assertThat(new String(pdf, 0, 5, StandardCharsets.ISO_8859_1)).isEqualTo("%PDF-");

            try (PDDocument document = Loader.loadPDF(pdf)) {
                String extracted = new PDFTextStripper().getText(document).trim();
                record(
                        origin,
                        extension,
                        forcedFilter(extension, fixture),
                        fixture.length,
                        pdf.length,
                        document,
                        expect,
                        extracted);

                assertThat(document.getNumberOfPages())
                        .as(".%s produced a pdf with no pages", extension)
                        .isGreaterThanOrEqualTo(1);
                switch (expect) {
                    case TEXT ->
                            assertThat(extracted.replaceAll("\\s+", ""))
                                    .as(
                                            ".%s lost its text; the pdf is blank or unrelated",
                                            extension)
                                    .contains(expectedText);
                    case IMAGE ->
                            assertThat(hasImage(document))
                                    .as(".%s produced a pdf with no image on it", extension)
                                    .isTrue();
                    case PAGE -> {}
                }
            }
        } finally {
            FileUtils.deleteDirectory(produced.getParentFile());
        }
    }

    private static MockMultipartFile upload(String extension, byte[] fixture) {
        return new MockMultipartFile(
                "fileInput", "fixture." + extension, "application/octet-stream", fixture);
    }

    /** One audit line per format, so a run of this class is itself the conversion record. */
    private static void record(
            String origin,
            String extension,
            String filter,
            int inputSize,
            int outputSize,
            PDDocument document,
            Expect expect,
            String extracted)
            throws IOException {
        String summary =
                expect == Expect.TEXT
                        ? "text=\"" + extracted.replaceAll("\\s+", " ").trim() + '"'
                        : "images=" + hasImage(document);
        System.out.printf(
                "office matrix | %-5s | %-5s | filter=%-45s | in=%7d | out=%7d | pages=%d | %s%n",
                origin,
                extension,
                filter,
                inputSize,
                outputSize,
                document.getNumberOfPages(),
                summary.length() > 140 ? summary.substring(0, 140) + "…\"" : summary);
    }

    private static Path exampleFiles() {
        for (Path directory = Path.of("").toAbsolutePath();
                directory != null;
                directory = directory.getParent()) {
            Path candidate = directory.resolve("testing/cucumber/exampleFiles");
            if (Files.isDirectory(candidate)) {
                return candidate;
            }
        }
        return null;
    }

    private ConvertOfficeController newController() {
        return newController(soffice());
    }

    private ConvertOfficeController newController(String sofficePath) {
        ApplicationProperties applicationProperties = new ApplicationProperties();
        SsrfProtectionService ssrfProtectionService =
                new SsrfProtectionService(applicationProperties);
        RuntimePathConfig runtimePathConfig = mock(RuntimePathConfig.class);
        lenient().when(runtimePathConfig.getSOfficePath()).thenReturn(sofficePath);
        EndpointConfiguration endpointConfiguration = mock(EndpointConfiguration.class);
        lenient().when(endpointConfiguration.isGroupEnabled("Unoconvert")).thenReturn(false);
        lenient().when(endpointConfiguration.isGroupEnabled("Python")).thenReturn(false);
        return new ConvertOfficeController(
                mock(CustomPDFDocumentFactory.class),
                runtimePathConfig,
                new CustomHtmlSanitizer(ssrfProtectionService, applicationProperties),
                new OfficeDocumentSanitizer(ssrfProtectionService, applicationProperties),
                endpointConfiguration,
                mock(TempFileManager.class));
    }

    private static boolean hasImage(PDDocument document) throws IOException {
        for (PDPage page : document.getPages()) {
            for (var name : page.getResources().getXObjectNames()) {
                PDXObject xObject = page.getResources().getXObject(name);
                if (xObject instanceof PDImageXObject) {
                    return true;
                }
            }
        }
        return false;
    }

    private byte[] buildFixture(String extension, Path staging) throws Exception {
        byte[] written = writtenFixture(extension);
        if (written != null) {
            return written;
        }
        String filter = EXPORT_OVERRIDES.get(extension);
        if (filter == null) {
            filter = OfficeImportFilters.forExtension(extension).getFirst().importFilter();
        }
        return export(sourceFor(extension), extension, filter, staging);
    }

    private static byte[] writtenFixture(String extension) throws IOException {
        return switch (extension) {
            case "fodt" -> WRITER_SOURCE.getBytes(StandardCharsets.UTF_8);
            case "xml" -> WRITER_SOURCE.getBytes(StandardCharsets.UTF_8);
            case "fods" -> CALC_SOURCE.getBytes(StandardCharsets.UTF_8);
            case "fodp" -> IMPRESS_SOURCE.getBytes(StandardCharsets.UTF_8);
            case "json" ->
                    "[[\"SPDF7680\", 42], [\"ZULU7680\", 7], [\"third\", 13]]"
                            .getBytes(StandardCharsets.UTF_8);
            case "sxw" -> starOfficePackage("application/vnd.sun.xml.writer", "text", TEXT_BODY);
            case "sxc" ->
                    starOfficePackage("application/vnd.sun.xml.calc", "spreadsheet", SHEET_BODY);
            case "stw" ->
                    starOfficePackage("application/vnd.sun.xml.writer.template", "text", TEXT_BODY);
            case "sxg" ->
                    starOfficePackage(
                            "application/vnd.sun.xml.writer.global", "text-global", TEXT_BODY);
            case "sxi" ->
                    starOfficePackage("application/vnd.sun.xml.impress", "presentation", DRAW_BODY);
            case "sxd" -> starOfficePackage("application/vnd.sun.xml.draw", "drawing", DRAW_BODY);
            case "stc" ->
                    starOfficePackage(
                            "application/vnd.sun.xml.calc.template", "spreadsheet", SHEET_BODY);
            case "pbm" -> netpbm("P1", "", (x, y) -> ((x / 4 + y / 4) % 2 == 0) ? "0" : "1");
            case "pgm" -> netpbm("P2", "255\n", (x, y) -> Integer.toString((x * 16 + y * 3) % 256));
            case "ppm" ->
                    netpbm("P3", "255\n", (x, y) -> (x * 16) % 256 + " " + (y * 16) % 256 + " 128");
            case "xbm" -> xbm();
            case "xpm" -> xpm();
            case "ras" -> sunRaster();
            case "pct" -> macPict();
            default -> null;
        };
    }

    private String sourceFor(String extension) throws IOException {
        return switch (moduleOf(extension)) {
            case "calc" -> writeTemp(".fods", CALC_SOURCE);
            case "impress" -> writeTemp(".fodp", IMPRESS_SOURCE);
            case "draw" -> writeTemp(".fodg", DRAW_SOURCE);
            default -> writeTemp(".fodt", WRITER_SOURCE);
        };
    }

    private static String moduleOf(String extension) {
        if (Set.of(
                        "xlsx", "xlsm", "xltx", "xltm", "xls", "xlt", "ods", "ots", "fods", "csv",
                        "slk", "dif", "dbf")
                .contains(extension)) {
            return "calc";
        }
        if (Set.of("pptx", "pptm", "potx", "potm", "ppsx", "ppsm", "ppt", "odp", "otp", "fodp")
                .contains(extension)) {
            return "impress";
        }
        if (Set.of(
                        "odg", "otg", "png", "jpg", "jpeg", "gif", "bmp", "webp", "tif", "tiff",
                        "wmf", "svg", "eps")
                .contains(extension)) {
            return "draw";
        }
        return "writer";
    }

    private String writeTemp(String suffix, String content) throws IOException {
        Path path = Files.createTempFile("matrix_source", suffix);
        path.toFile().deleteOnExit();
        Files.writeString(path, content, StandardCharsets.UTF_8);
        return path.toString();
    }

    private byte[] export(String source, String extension, String filter, Path staging)
            throws Exception {
        Path profile = staging.resolve("profile");
        Files.createDirectories(profile);
        Process process =
                new ProcessBuilder(
                                soffice(),
                                "-env:UserInstallation=" + profile.toUri(),
                                "--headless",
                                "--nologo",
                                "--convert-to",
                                extension + ":" + filter,
                                "--outdir",
                                staging.toString(),
                                source)
                        .redirectErrorStream(true)
                        .start();
        process.getInputStream().readAllBytes();
        if (!process.waitFor(3, TimeUnit.MINUTES)) {
            process.destroyForcibly();
            throw new IllegalStateException("timed out writing a ." + extension + " fixture");
        }
        try (Stream<Path> written = Files.list(staging)) {
            Path fixture =
                    written.filter(p -> p.getFileName().toString().endsWith("." + extension))
                            .findFirst()
                            .orElseThrow(
                                    () ->
                                            new IllegalStateException(
                                                    "LibreOffice wrote no ."
                                                            + extension
                                                            + " fixture with filter "
                                                            + filter));
            return Files.readAllBytes(fixture);
        }
    }

    private interface Pixel {
        String at(int x, int y);
    }

    private static byte[] netpbm(String magic, String maxValue, Pixel pixel) {
        StringBuilder image = new StringBuilder(magic).append("\n16 16\n").append(maxValue);
        for (int y = 0; y < 16; y++) {
            List<String> row = new ArrayList<>();
            for (int x = 0; x < 16; x++) {
                row.add(pixel.at(x, y));
            }
            image.append(String.join(" ", row)).append('\n');
        }
        return image.toString().getBytes(StandardCharsets.US_ASCII);
    }

    private static byte[] xbm() {
        StringBuilder bits = new StringBuilder();
        for (int i = 0; i < 32; i++) {
            bits.append(i == 0 ? "" : ", ").append(String.format("0x%02x", (i * 37) % 256));
        }
        return ("#define fixture_width 16\n#define fixture_height 16\n"
                        + "static unsigned char fixture_bits[] = {\n"
                        + bits
                        + " };\n")
                .getBytes(StandardCharsets.US_ASCII);
    }

    private static byte[] xpm() {
        StringBuilder rows = new StringBuilder();
        for (int y = 0; y < 16; y++) {
            StringBuilder row = new StringBuilder();
            for (int x = 0; x < 16; x++) {
                row.append((x / 4 + y / 4) % 2 == 0 ? '.' : '+');
            }
            rows.append(",\n\"").append(row).append('"');
        }
        return ("/* XPM */\nstatic char * fixture_xpm[] = {\n\"16 16 2 1\",\n"
                        + "\".\tc #FF0000\",\n\"+\tc #0000FF\""
                        + rows
                        + "};\n")
                .getBytes(StandardCharsets.US_ASCII);
    }

    /**
     * A version 1 QuickTime picture: 512 bytes of application header, then the picture's own size
     * and frame, the {@code 0x11 0x01} version opcode, a clip region, the text and rectangle the
     * assertion looks for, and the {@code 0xFF} terminator. Written by hand because LibreOffice
     * imports PICT and has no filter that writes one.
     *
     * <p>Like {@code wmf}, this draws as vector operators rather than an image XObject, so the
     * conversion has to be asserted through the text it carries.
     */
    private static byte[] macPict() throws IOException {
        byte[] text = SENTINEL.getBytes(StandardCharsets.US_ASCII);
        ByteArrayOutputStream picture = new ByteArrayOutputStream();
        writeRect(picture, 0, 0, 120, 400);
        picture.write(new byte[] {0x11, 0x01});
        picture.write(0x01); // clipRgn
        writeShort(picture, 10);
        writeRect(picture, 0, 0, 120, 400);
        picture.write(0x03); // txFont
        writeShort(picture, 0);
        picture.write(0x0D); // txSize
        writeShort(picture, 24);
        picture.write(0x28); // longText
        writeShort(picture, 60);
        writeShort(picture, 10);
        picture.write(text.length);
        picture.write(text);
        picture.write(0x31); // paintRect
        writeRect(picture, 90, 10, 110, 200);
        picture.write(0xFF);

        ByteArrayOutputStream file = new ByteArrayOutputStream();
        file.write(new byte[512]);
        writeShort(file, picture.size() + 2);
        picture.writeTo(file);
        return file.toByteArray();
    }

    private static void writeShort(ByteArrayOutputStream out, int value) {
        out.write((value >>> 8) & 0xFF);
        out.write(value & 0xFF);
    }

    private static void writeRect(
            ByteArrayOutputStream out, int top, int left, int bottom, int right) {
        writeShort(out, top);
        writeShort(out, left);
        writeShort(out, bottom);
        writeShort(out, right);
    }

    private static byte[] sunRaster() throws IOException {
        ByteArrayOutputStream pixels = new ByteArrayOutputStream();
        for (int y = 0; y < 16; y++) {
            for (int x = 0; x < 16; x++) {
                pixels.write((x * 16) % 256);
                pixels.write((y * 16) % 256);
                pixels.write(128);
            }
        }
        ByteArrayOutputStream file = new ByteArrayOutputStream();
        // RAS_MAGIC, width, height, depth, data length, RT_STANDARD, RMT_NONE, map length.
        for (int header : new int[] {0x59a66a95, 16, 16, 24, pixels.size(), 1, 0, 0}) {
            file.write(header >>> 24);
            file.write((header >>> 16) & 0xFF);
            file.write((header >>> 8) & 0xFF);
            file.write(header & 0xFF);
        }
        pixels.writeTo(file);
        return file.toByteArray();
    }

    private static byte[] starOfficePackage(String mediaType, String documentClass, String body)
            throws IOException {
        String namespaces =
                "xmlns:office=\"http://openoffice.org/2000/office\""
                        + " xmlns:style=\"http://openoffice.org/2000/style\""
                        + " xmlns:text=\"http://openoffice.org/2000/text\""
                        + " xmlns:table=\"http://openoffice.org/2000/table\""
                        + " xmlns:draw=\"http://openoffice.org/2000/drawing\""
                        + " xmlns:fo=\"http://www.w3.org/1999/XSL/Format\""
                        + " xmlns:xlink=\"http://www.w3.org/1999/xlink\""
                        + " xmlns:dc=\"http://purl.org/dc/elements/1.1/\""
                        + " xmlns:meta=\"http://openoffice.org/2000/meta\""
                        + " xmlns:number=\"http://openoffice.org/2000/datastyle\""
                        + " xmlns:svg=\"http://www.w3.org/2000/svg\""
                        + " xmlns:chart=\"http://openoffice.org/2000/chart\""
                        + " xmlns:dr3d=\"http://openoffice.org/2000/dr3d\""
                        + " xmlns:form=\"http://openoffice.org/2000/form\""
                        + " xmlns:script=\"http://openoffice.org/2000/script\"";
        String content =
                "<?xml version=\"1.0\" encoding=\"UTF-8\"?>"
                        + "<office:document-content "
                        + namespaces
                        + " office:class=\""
                        + documentClass
                        + "\" office:version=\"1.0\">"
                        + "<office:automatic-styles>"
                        + "<style:style style:name=\"co1\" style:family=\"table-column\">"
                        + "<style:properties style:column-width=\"8cm\"/></style:style>"
                        + "</office:automatic-styles>"
                        + "<office:body>"
                        + body
                        + "</office:body></office:document-content>";
        String styles =
                "<?xml version=\"1.0\" encoding=\"UTF-8\"?>"
                        + "<office:document-styles "
                        + namespaces
                        + " office:version=\"1.0\"><office:styles/>"
                        + "<office:automatic-styles/><office:master-styles/>"
                        + "</office:document-styles>";
        String manifest =
                "<?xml version=\"1.0\" encoding=\"UTF-8\"?>"
                        + "<manifest:manifest"
                        + " xmlns:manifest=\"http://openoffice.org/2001/manifest\">"
                        + "<manifest:file-entry manifest:full-path=\"/\" manifest:media-type=\""
                        + mediaType
                        + "\"/>"
                        + "<manifest:file-entry manifest:full-path=\"content.xml\""
                        + " manifest:media-type=\"text/xml\"/>"
                        + "<manifest:file-entry manifest:full-path=\"styles.xml\""
                        + " manifest:media-type=\"text/xml\"/>"
                        + "</manifest:manifest>";

        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        try (ZipOutputStream zip = new ZipOutputStream(bytes)) {
            // Stored, first and uncompressed: LibreOffice reads the media type off the raw bytes.
            byte[] mimetype = mediaType.getBytes(StandardCharsets.US_ASCII);
            ZipEntry entry = new ZipEntry("mimetype");
            entry.setMethod(ZipEntry.STORED);
            entry.setSize(mimetype.length);
            entry.setCompressedSize(mimetype.length);
            CRC32 crc = new CRC32();
            crc.update(mimetype);
            entry.setCrc(crc.getValue());
            zip.putNextEntry(entry);
            zip.write(mimetype);
            zip.closeEntry();
            Map<String, String> parts = new LinkedHashMap<>();
            parts.put("content.xml", content);
            parts.put("styles.xml", styles);
            parts.put("META-INF/manifest.xml", manifest);
            for (Map.Entry<String, String> part : parts.entrySet()) {
                zip.putNextEntry(new ZipEntry(part.getKey()));
                zip.write(part.getValue().getBytes(StandardCharsets.UTF_8));
                zip.closeEntry();
            }
        }
        return bytes.toByteArray();
    }

    private static final String TEXT_BODY =
            "<text:p>"
                    + SENTINEL
                    + "</text:p><text:p>Office conversion allowlist fixture.</text:p>"
                    + "<text:p>ZULUMARKER</text:p>";

    private static final String DRAW_BODY =
            "<draw:page draw:name=\"page1\">"
                    + "<draw:text-box svg:x=\"1cm\" svg:y=\"2cm\" svg:width=\"18cm\""
                    + " svg:height=\"3cm\"><text:p>"
                    + SENTINEL
                    + "</text:p><text:p>ZULUMARKER</text:p></draw:text-box></draw:page>";

    private static final String SHEET_BODY =
            "<table:table table:name=\"Sheet1\">"
                    + "<table:table-column table:style-name=\"co1\"/>"
                    + "<table:table-column table:style-name=\"co1\"/>"
                    + "<table:table-row><table:table-cell><text:p>"
                    + SENTINEL
                    + "</text:p></table:table-cell>"
                    + "<table:table-cell table:value-type=\"float\" table:value=\"42\">"
                    + "<text:p>42</text:p></table:table-cell></table:table-row>"
                    + "<table:table-row><table:table-cell><text:p>ZULUMARKER</text:p>"
                    + "</table:table-cell></table:table-row></table:table>";

    private static final String ODF_NAMESPACES =
            "xmlns:office=\"urn:oasis:names:tc:opendocument:xmlns:office:1.0\""
                    + " xmlns:text=\"urn:oasis:names:tc:opendocument:xmlns:text:1.0\""
                    + " xmlns:table=\"urn:oasis:names:tc:opendocument:xmlns:table:1.0\""
                    + " xmlns:draw=\"urn:oasis:names:tc:opendocument:xmlns:drawing:1.0\""
                    + " xmlns:style=\"urn:oasis:names:tc:opendocument:xmlns:style:1.0\""
                    + " xmlns:svg=\"urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0\""
                    + " xmlns:fo=\"urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0\"";

    private static final String WRITER_SOURCE =
            "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<office:document "
                    + ODF_NAMESPACES
                    + " office:version=\"1.3\""
                    + " office:mimetype=\"application/vnd.oasis.opendocument.text\">"
                    + "<office:body><office:text><text:p>"
                    + SENTINEL
                    + "</text:p>"
                    + "<text:p>Office conversion allowlist fixture for the convert endpoint.</text:p>"
                    + "<text:p>A second paragraph, so the document is not trivial and renders a"
                    + " real page of content.</text:p>"
                    + "<text:p>ZULUMARKER</text:p>"
                    + "</office:text></office:body></office:document>";

    private static final String WRITER_LINKED_SOURCE =
            "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<office:document "
                    + ODF_NAMESPACES
                    + " xmlns:xlink=\"http://www.w3.org/1999/xlink\""
                    + " office:version=\"1.3\""
                    + " office:mimetype=\"application/vnd.oasis.opendocument.text\">"
                    + "<office:body><office:text><text:p>"
                    + SENTINEL
                    + "</text:p>"
                    + "<text:p><draw:frame svg:width=\"3cm\" svg:height=\"3cm\">"
                    + "<draw:image xlink:href=\"http://127.0.0.1:1/LINKED\""
                    + " xlink:type=\"simple\" xlink:show=\"embed\"/></draw:frame></text:p>"
                    + "</office:text></office:body></office:document>";

    private static final String CALC_SOURCE =
            "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<office:document "
                    + ODF_NAMESPACES
                    + " office:version=\"1.3\""
                    + " office:mimetype=\"application/vnd.oasis.opendocument.spreadsheet\">"
                    + "<office:automatic-styles>"
                    + "<style:style style:name=\"co1\" style:family=\"table-column\">"
                    + "<style:table-column-properties style:column-width=\"8cm\"/></style:style>"
                    + "</office:automatic-styles>"
                    + "<office:body><office:spreadsheet>"
                    + "<table:table table:name=\"Sheet1\">"
                    + "<table:table-column table:style-name=\"co1\"/>"
                    + "<table:table-column table:style-name=\"co1\"/>"
                    + "<table:table-row>"
                    + "<table:table-cell office:value-type=\"string\"><text:p>"
                    + SENTINEL
                    + "</text:p></table:table-cell>"
                    + "<table:table-cell office:value-type=\"float\" office:value=\"42\">"
                    + "<text:p>42</text:p></table:table-cell></table:table-row>"
                    + "<table:table-row>"
                    + "<table:table-cell office:value-type=\"string\">"
                    + "<text:p>ZULUMARKER</text:p></table:table-cell>"
                    + "<table:table-cell office:value-type=\"float\" office:value=\"7\">"
                    + "<text:p>7</text:p></table:table-cell></table:table-row>"
                    + "</table:table></office:spreadsheet></office:body></office:document>";

    private static final String IMPRESS_SOURCE =
            "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<office:document "
                    + ODF_NAMESPACES
                    + " office:version=\"1.3\""
                    + " office:mimetype=\"application/vnd.oasis.opendocument.presentation\">"
                    + "<office:body><office:presentation>"
                    + "<draw:page draw:name=\"page1\">"
                    + "<draw:frame svg:width=\"20cm\" svg:height=\"3cm\" svg:x=\"2cm\""
                    + " svg:y=\"3cm\"><draw:text-box><text:p>"
                    + SENTINEL
                    + "</text:p><text:p>ZULUMARKER</text:p></draw:text-box></draw:frame>"
                    + "</draw:page></office:presentation></office:body></office:document>";

    private static final String DRAW_SOURCE =
            "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<office:document "
                    + ODF_NAMESPACES
                    + " office:version=\"1.3\""
                    + " office:mimetype=\"application/vnd.oasis.opendocument.graphics\">"
                    + "<office:body><office:drawing>"
                    + "<draw:page draw:name=\"page1\">"
                    + "<draw:frame svg:width=\"18cm\" svg:height=\"3cm\" svg:x=\"1cm\""
                    + " svg:y=\"2cm\"><draw:text-box><text:p>"
                    + SENTINEL
                    + "</text:p><text:p>ZULUMARKER</text:p></draw:text-box></draw:frame>"
                    + "</draw:page></office:drawing></office:body></office:document>";

    static boolean sofficeAvailable() {
        return soffice() != null;
    }

    static String soffice() {
        String configured = System.getenv("STIRLING_TEST_SOFFICE");
        List<String> candidates =
                new ArrayList<>(
                        List.of(
                                "/opt/homebrew/bin/soffice",
                                "/usr/bin/soffice",
                                "/usr/local/bin/soffice",
                                "/Applications/LibreOffice.app/Contents/MacOS/soffice"));
        if (configured != null && !configured.isBlank()) {
            candidates.add(0, configured.trim());
        }
        for (String candidate : candidates) {
            if (Files.isExecutable(Path.of(candidate))) {
                return candidate;
            }
        }
        return null;
    }
}
