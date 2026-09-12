package stirling.software.SPDF.controller.api.converters;

import static org.assertj.core.api.Assertions.fail;
import static org.junit.jupiter.api.Assumptions.assumeTrue;

import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.TreeSet;
import java.util.concurrent.TimeUnit;
import java.util.stream.Stream;

import javax.imageio.ImageIO;

import org.apache.commons.io.FileUtils;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.MethodSource;

/**
 * Proves every distinct import filter name in {@link OfficeImportFilters} is one the installed
 * LibreOffice actually resolves.
 *
 * <p>Nothing else can prove it. An {@code --infilter} name LibreOffice cannot resolve is ignored
 * silently: the conversion falls back to content autodetection, exits 0 and writes a good PDF, so a
 * typo turns the forced-filter control off for that extension while every conversion test stays
 * green.
 *
 * <p>A non-zero exit is not the criterion either, and assuming it would be wrong in both
 * directions: {@code MS Excel 2003 XML Orcus} resolves and still exits 0 on a Writer document,
 * returning a blank Calc page, while the OOXML names and {@code Rich Text Format} legitimately
 * accept an OOXML zip. What separates a resolved name from an ignored one is that it produces a
 * <em>different outcome from a deliberately unresolvable name on the same fixture</em>: an ignored
 * name produces exactly the autodetected result, which is what the control measures.
 *
 * <p>Two counter-fixtures, because on a document of a filter's own family a resolved name and an
 * ignored one agree by construction — {@code MS Word 97} forced on a Word 97 binary is the
 * autodetected conversion, byte for byte. A name has to differ on one of them, not on both: the
 * Word 97 binary separates every name but the two Word filters that read it, which the PNG then
 * separates.
 *
 * <p>One LibreOffice launch per name, plus a few for the fixtures and the controls, so it is opt-in
 * rather than part of every run:
 *
 * <pre>{@code
 * STIRLING_TEST_OFFICE_FILTER_SWEEP=true ./gradlew :stirling-pdf:test \
 *     --tests '*OfficeImportFilterNameSweepTest'
 * }</pre>
 */
@EnabledIfEnvironmentVariable(
        named = "STIRLING_TEST_OFFICE_FILTER_SWEEP",
        matches = "(?i)true|1|yes",
        disabledReason =
                "opt-in: set STIRLING_TEST_OFFICE_FILTER_SWEEP=true to check every import filter"
                        + " name against the installed LibreOffice")
@DisplayName("office import filter names")
class OfficeImportFilterNameSweepTest {

    /** A name no filter registry holds, so forcing it is indistinguishable from forcing nothing. */
    private static final String UNRESOLVABLE_FILTER = "Stirling No Such Import Filter";

    private record Outcome(int exitCode, long pdfSize) {
        @Override
        public String toString() {
            return "exit=" + exitCode + (pdfSize < 0 ? ", no pdf" : ", pdf=" + pdfSize);
        }
    }

    /**
     * {@code ignoredFilter} is what this fixture converts to when the forced name means nothing.
     */
    private record CounterFixture(String extension, byte[] bytes, Outcome ignoredFilter) {
        @Override
        public String toString() {
            return "." + extension;
        }
    }

    private static Path staging;
    private static Path profile;
    private static List<CounterFixture> counterFixtures;

    /**
     * Skipping is left to the test method rather than aborted here, so a machine without
     * LibreOffice reports one skip per name rather than an empty class, which a {@code --tests}
     * filter reports as a build failure instead.
     */
    @BeforeAll
    static void buildCounterFixtures() throws Exception {
        if (!OfficeConversionMatrixTest.sofficeAvailable()) {
            return;
        }
        staging = Files.createTempDirectory("filter_sweep_");
        profile = Files.createDirectory(staging.resolve("profile"));
        counterFixtures = List.of(counterFixture("doc", word97()), counterFixture("png", png()));
    }

    @AfterAll
    static void deleteStaging() throws IOException {
        if (staging != null) {
            FileUtils.deleteDirectory(staging.toFile());
        }
    }

    static Stream<String> importFilterNames() {
        return new TreeSet<>(
                        OfficeImportFilters.candidateFilters().values().stream()
                                .flatMap(List::stream)
                                .map(OfficeImportFilters.Candidate::importFilter)
                                .toList())
                .stream();
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("importFilterNames")
    @DisplayName("resolves, so forcing it is not the same as forcing nothing")
    void importFilterNameResolves(String importFilter) throws Exception {
        assumeTrue(
                counterFixtures != null,
                "LibreOffice is not installed, so no filter name can be resolved against it; set"
                        + " STIRLING_TEST_SOFFICE to point at a soffice binary");

        List<String> measured = new ArrayList<>();
        for (CounterFixture fixture : counterFixtures) {
            Outcome forced = convert(fixture.extension(), fixture.bytes(), importFilter);
            measured.add(fixture + " (" + forced + ")");
            if (!forced.equals(fixture.ignoredFilter())) {
                System.out.printf(
                        "office filter | %-58s | resolves | %s%n",
                        importFilter, String.join(", ", measured));
                return;
            }
        }
        fail(
                "\"%s\" is not a name this LibreOffice resolves: forcing it produced exactly the"
                        + " outcome of forcing \"%s\" on every counter-fixture — %s. The extensions"
                        + " it serves are therefore imported by content autodetection, which is the"
                        + " type confusion the forced filter exists to close.",
                importFilter, UNRESOLVABLE_FILTER, String.join(", ", measured));
    }

    /**
     * Measures what an ignored filter name does to these bytes, and refuses to hand back a fixture
     * that cannot support the comparison: one that does not convert at all leaves every name
     * looking resolved, and an {@code UNRESOLVABLE_FILTER} that some registry does resolve is no
     * longer a control.
     */
    private static CounterFixture counterFixture(String extension, byte[] bytes) throws Exception {
        Outcome autodetected = convert(extension, bytes, null);
        if (autodetected.exitCode() != 0 || autodetected.pdfSize() < 0) {
            throw new IllegalStateException(
                    "the ." + extension + " counter-fixture does not convert: " + autodetected);
        }
        Outcome ignored = convert(extension, bytes, UNRESOLVABLE_FILTER);
        if (!autodetected.equals(ignored)) {
            throw new IllegalStateException(
                    "\""
                            + UNRESOLVABLE_FILTER
                            + "\" resolves against this LibreOffice, so it cannot measure what an"
                            + " ignored name does: autodetected "
                            + autodetected
                            + ", forced "
                            + ignored);
        }
        return new CounterFixture(extension, bytes, ignored);
    }

    private static Outcome convert(String extension, byte[] fixture, String importFilter)
            throws Exception {
        Path work = Files.createTempDirectory(staging, "run");
        try {
            Path input = work.resolve("fixture." + extension);
            Files.write(input, fixture);
            List<String> arguments = new ArrayList<>();
            if (importFilter != null) {
                arguments.add("--infilter=" + importFilter);
            }
            arguments.addAll(
                    List.of("--convert-to", "pdf", "--outdir", work.toString(), input.toString()));
            int exitCode = soffice(arguments);
            Path pdf = work.resolve("fixture.pdf");
            return new Outcome(exitCode, Files.exists(pdf) ? Files.size(pdf) : -1);
        } finally {
            FileUtils.deleteDirectory(work.toFile());
        }
    }

    private static byte[] word97() throws Exception {
        Path source = staging.resolve("source.fodt");
        Files.writeString(source, FLAT_TEXT_DOCUMENT, StandardCharsets.UTF_8);
        int exitCode =
                soffice(
                        List.of(
                                "--convert-to",
                                "doc:MS Word 97",
                                "--outdir",
                                staging.toString(),
                                source.toString()));
        Path document = staging.resolve("source.doc");
        if (exitCode != 0 || !Files.exists(document)) {
            throw new IllegalStateException(
                    "LibreOffice wrote no Word 97 counter-fixture (exit " + exitCode + ")");
        }
        return Files.readAllBytes(document);
    }

    private static byte[] png() throws IOException {
        BufferedImage image = new BufferedImage(64, 64, BufferedImage.TYPE_INT_RGB);
        Graphics2D graphics = image.createGraphics();
        graphics.setColor(Color.WHITE);
        graphics.fillRect(0, 0, 64, 64);
        graphics.setColor(Color.BLUE);
        graphics.fillOval(8, 8, 48, 48);
        graphics.dispose();
        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        ImageIO.write(image, "png", bytes);
        return bytes.toByteArray();
    }

    private static int soffice(List<String> arguments) throws Exception {
        List<String> command =
                new ArrayList<>(
                        List.of(
                                OfficeConversionMatrixTest.soffice(),
                                "-env:UserInstallation=" + profile.toUri(),
                                "--headless",
                                "--nologo"));
        command.addAll(arguments);
        Process process = new ProcessBuilder(command).redirectErrorStream(true).start();
        process.getInputStream().readAllBytes();
        if (!process.waitFor(3, TimeUnit.MINUTES)) {
            process.destroyForcibly();
            throw new IllegalStateException(
                    "LibreOffice timed out: " + String.join(" ", arguments));
        }
        return process.exitValue();
    }

    private static final String FLAT_TEXT_DOCUMENT =
            "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<office:document"
                    + " xmlns:office=\"urn:oasis:names:tc:opendocument:xmlns:office:1.0\""
                    + " xmlns:text=\"urn:oasis:names:tc:opendocument:xmlns:text:1.0\""
                    + " office:version=\"1.3\""
                    + " office:mimetype=\"application/vnd.oasis.opendocument.text\">"
                    + "<office:body><office:text>"
                    + "<text:p>STIRLINGSENTINEL</text:p>"
                    + "<text:p>Counter-fixture for the office import filter name sweep.</text:p>"
                    + "</office:text></office:body></office:document>";
}
