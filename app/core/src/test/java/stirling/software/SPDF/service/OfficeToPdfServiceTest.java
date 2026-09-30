package stirling.software.SPDF.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.io.IOException;
import java.io.InterruptedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import java.util.Random;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.text.PDFTextStripper;
import org.apache.poi.xslf.usermodel.XMLSlideShow;
import org.apache.poi.xslf.usermodel.XSLFGroupShape;
import org.apache.poi.xslf.usermodel.XSLFSlide;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.officeconvert.memory.Admission;
import stirling.software.officeconvert.topdf.OfficeToPdf;
import stirling.software.officeconvert.topdf.io.OfficeZip;

class OfficeToPdfServiceTest {

    @TempDir Path dir;

    private final CountDownLatch release = new CountDownLatch(1);
    private final AtomicInteger fallbacks = new AtomicInteger();

    @AfterEach
    void unblock() {
        release.countDown();
    }

    private static ApplicationProperties.OfficeToPdf settings(int concurrent, int queued) {
        ApplicationProperties.OfficeToPdf settings = new ApplicationProperties.OfficeToPdf();
        settings.setMaxConcurrent(concurrent);
        settings.setMaxQueued(queued);
        return settings;
    }

    private static OfficeToPdfService service(
            ApplicationProperties.OfficeToPdf settings, OfficeToPdfService.Converter converter) {
        return new OfficeToPdfService(settings, Duration.ofMinutes(1), converter, 4, 4L << 30);
    }

    private Path docx(String... pages) throws IOException {
        Path in = dir.resolve("in.docx");
        Files.write(in, OfficeFixtures.docx(pages));
        return in;
    }

    private void fallback(Path out) throws IOException {
        fallbacks.incrementAndGet();
        Files.writeString(out, "%PDF LibreOffice");
    }

    private OfficeToPdfService.Converter blocking(CountDownLatch started) {
        return (in, out, options) -> {
            started.countDown();
            try {
                release.await();
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                throw new InterruptedIOException();
            }
            Files.writeString(out, "%PDF");
            return new OfficeToPdf.Result(1, false, List.of());
        };
    }

    @Test
    void picksConcurrencyFromProcessorsAndHeap() {
        assertThat(OfficeToPdfService.autoConcurrency(8, 8L << 30)).isEqualTo(4);
        assertThat(OfficeToPdfService.autoConcurrency(16, 1L << 30)).isEqualTo(2);
        assertThat(OfficeToPdfService.autoConcurrency(1, 256L << 20)).isEqualTo(1);
        assertThat(OfficeToPdfService.autoConcurrency(2, 64L << 30)).isEqualTo(1);
    }

    @Test
    void takesOnlyWordPowerPointAndExcel() {
        OfficeToPdfService service = service(settings(1, 0), OfficeToPdf::convert);
        assertThat(service.handles("docx")).isTrue();
        assertThat(service.handles("PPTX")).isTrue();
        assertThat(service.handles("xlsm")).isTrue();
        for (String legacy : new String[] {"xls", "XLT", "ppt", "pps", "pot"}) {
            assertThat(service.handles(legacy)).as(legacy).isTrue();
        }
        assertThat(service.handles("doc")).isFalse();
        assertThat(service.handles("xlsb")).isFalse();
        assertThat(service.handles("odt")).isFalse();
        assertThat(service.handles("rtf")).isFalse();
        assertThat(service.handles(null)).isFalse();

        ApplicationProperties.OfficeToPdf libreOffice = settings(1, 0);
        libreOffice.setEngine(ApplicationProperties.OfficeToPdf.Engine.LIBREOFFICE);
        assertThat(service(libreOffice, OfficeToPdf::convert).handles("docx")).isFalse();
    }

    @Test
    void convertsInProcessWithoutLibreOffice() throws Exception {
        OfficeToPdfService service = service(settings(0, 16), OfficeToPdf::convert);
        Path in = docx("First page text", "Second page text");
        Path out = dir.resolve("in.pdf");

        service.convert(in, out, service.deadline(), true, () -> fallback(out));

        assertThat(fallbacks).hasValue(0);
        try (PDDocument pdf = Loader.loadPDF(out.toFile())) {
            assertThat(pdf.getNumberOfPages()).isEqualTo(2);
            String text = new PDFTextStripper().getText(pdf);
            assertThat(text).contains("First page text").contains("Second page text");
        }
        assertThat(service.available()).isEqualTo(2);
    }

    @Test
    void fallsBackToLibreOfficeWhenTheConverterFails() throws Exception {
        OfficeToPdfService service =
                service(
                        settings(1, 0),
                        (in, out, options) -> {
                            Files.writeString(out, "partial");
                            throw new IOException("The file is not a zip");
                        });
        Path in = docx("x");
        Path out = dir.resolve("in.pdf");

        service.convert(in, out, service.deadline(), true, () -> fallback(out));

        assertThat(fallbacks).hasValue(1);
        assertThat(Files.readString(out)).isEqualTo("%PDF LibreOffice");
        assertThat(service.available()).isEqualTo(1);
    }

    @Test
    void fallsBackToLibreOfficeForABinaryFileTheConverterFailsOn() throws Exception {
        OfficeToPdfService service =
                service(
                        settings(1, 0),
                        (in, out, options) -> {
                            throw new IOException("The workbook could not be read");
                        });
        for (String type : new String[] {"xls", "ppt"}) {
            Path in = dir.resolve("in." + type);
            Files.write(
                    in,
                    new byte[] {
                        (byte) 0xD0,
                        (byte) 0xCF,
                        0x11,
                        (byte) 0xE0,
                        (byte) 0xA1,
                        (byte) 0xB1,
                        0x1A,
                        (byte) 0xE1
                    });
            Path out = dir.resolve("in.pdf");

            service.convert(in, out, service.deadline(), true, () -> fallback(out));

            assertThat(Files.readString(out)).isEqualTo("%PDF LibreOffice");
        }
        assertThat(fallbacks).hasValue(2);
    }

    @Test
    void reportsTheConverterReasonWithoutLibreOffice() throws Exception {
        OfficeToPdfService service =
                service(
                        settings(1, 0),
                        (in, out, options) -> {
                            throw new IOException("The file is password protected");
                        });
        Path out = dir.resolve("in.pdf");

        assertThatThrownBy(
                        () -> service.convert(docx("x"), out, service.deadline(), false, () -> {}))
                .isInstanceOfSatisfying(
                        ResponseStatusException.class,
                        e -> {
                            assertThat(e.getStatusCode())
                                    .isEqualTo(HttpStatus.UNPROCESSABLE_ENTITY);
                            assertThat(e.getReason()).isEqualTo("The file is password protected");
                        });
        assertThat(service.available()).isEqualTo(1);
    }

    @Test
    void aMemoryStopAsksTheClientToRetryAndNeverFallsBack() throws Exception {
        OfficeToPdfService service =
                service(
                        settings(1, 0),
                        (in, out, options) -> {
                            throw new IOException(Admission.NEEDS_MEMORY, new Admission.Stopped());
                        });
        Path out = dir.resolve("in.pdf");

        assertThatThrownBy(
                        () ->
                                service.convert(
                                        docx("x"),
                                        out,
                                        service.deadline(),
                                        true,
                                        () -> fallback(out)))
                .isInstanceOfSatisfying(
                        ResponseStatusException.class,
                        e -> {
                            assertThat(e.getStatusCode()).isEqualTo(HttpStatus.SERVICE_UNAVAILABLE);
                            assertThat(e.getReason()).startsWith(Admission.NEEDS_MEMORY);
                            assertThat(e.getHeaders().getFirst(HttpHeaders.RETRY_AFTER))
                                    .isEqualTo("5");
                        });
        assertThat(fallbacks).hasValue(0);
        assertThat(service.available()).isEqualTo(1);
    }

    @Test
    void recognisesAMemoryStopFromEitherDirection() {
        assertThat(OfficeToPdfService.stoppedForMemory(new Admission.Stopped())).isTrue();
        assertThat(
                        OfficeToPdfService.stoppedForMemory(
                                new IOException(Admission.NEEDS_MEMORY, new OutOfMemoryError())))
                .isTrue();
        assertThat(OfficeToPdfService.stoppedForMemory(new IOException("Not a zip"))).isFalse();
        assertThat(OfficeToPdfService.stoppedForMemory(new InterruptedIOException())).isFalse();
    }

    @Test
    void keepsToTheConverterWhenFallbackIsOff() throws Exception {
        ApplicationProperties.OfficeToPdf settings = settings(1, 0);
        settings.setFallbackToLibreOffice(false);
        OfficeToPdfService service =
                service(
                        settings,
                        (in, out, options) -> {
                            throw new IllegalStateException("renderer bug");
                        });
        Path out = dir.resolve("in.pdf");

        assertThatThrownBy(
                        () ->
                                service.convert(
                                        docx("x"),
                                        out,
                                        service.deadline(),
                                        true,
                                        () -> fallback(out)))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("renderer bug");
        assertThat(fallbacks).hasValue(0);
    }

    @Test
    void refusesFilesOverTheSizeLimitBeforeConverting() throws Exception {
        ApplicationProperties.OfficeToPdf settings = settings(1, 0);
        settings.setMaxFileSizeMB(1);
        AtomicInteger calls = new AtomicInteger();
        OfficeToPdfService service =
                service(
                        settings,
                        (in, out, options) -> {
                            calls.incrementAndGet();
                            return new OfficeToPdf.Result(1, false, List.of());
                        });
        Path in = dir.resolve("big.docx");
        Random random = new Random(1);
        StringBuilder noise = new StringBuilder();
        while (noise.length() < 2 << 20) {
            noise.append((char) ('a' + random.nextInt(26)));
        }
        Files.write(in, OfficeFixtures.docx(noise.toString()));
        assertThat(Files.size(in)).isGreaterThan(1 << 20);
        Path out = dir.resolve("big.pdf");

        assertThatThrownBy(() -> service.convert(in, out, service.deadline(), false, () -> {}))
                .isInstanceOfSatisfying(
                        ResponseStatusException.class,
                        e -> assertThat(e.getStatusCode()).isEqualTo(HttpStatus.CONTENT_TOO_LARGE));
        service.convert(in, out, service.deadline(), true, () -> fallback(out));

        assertThat(calls).hasValue(0);
        assertThat(fallbacks).hasValue(1);
    }

    @Test
    void refusesDocumentsOverThePageLimit() throws Exception {
        ApplicationProperties.OfficeToPdf settings = settings(1, 0);
        settings.setMaxPages(2);
        OfficeToPdfService service = service(settings, OfficeToPdf::convert);
        Path out = dir.resolve("in.pdf");

        assertThatThrownBy(
                        () ->
                                service.convert(
                                        docx("one", "two", "three"),
                                        out,
                                        service.deadline(),
                                        false,
                                        () -> {}))
                .isInstanceOfSatisfying(
                        ResponseStatusException.class,
                        e -> {
                            assertThat(e.getStatusCode()).isEqualTo(HttpStatus.CONTENT_TOO_LARGE);
                            assertThat(e.getReason()).contains("more than 2 pages");
                        });
    }

    @Test
    void thePageLimitHoldsWhenLibreOfficeCouldTakeTheFile() throws Exception {
        ApplicationProperties.OfficeToPdf settings = settings(1, 0);
        settings.setMaxPages(2);
        OfficeToPdfService service = service(settings, OfficeToPdf::convert);
        Path out = dir.resolve("in.pdf");

        assertThatThrownBy(
                        () ->
                                service.convert(
                                        docx("one", "two", "three"),
                                        out,
                                        service.deadline(),
                                        true,
                                        () -> fallback(out)))
                .isInstanceOfSatisfying(
                        ResponseStatusException.class,
                        e -> {
                            assertThat(e.getStatusCode()).isEqualTo(HttpStatus.CONTENT_TOO_LARGE);
                            assertThat(e.getReason()).contains("more than 2 pages");
                        });
        assertThat(fallbacks).hasValue(0);
        assertThat(service.available()).isEqualTo(1);
    }

    @Test
    void anOutputOverTheScratchLimitIsRefusedWithoutFallingBack() throws Exception {
        ApplicationProperties.OfficeToPdf settings = settings(1, 0);
        settings.setMaxScratchMB(7);
        OfficeToPdfService service =
                service(
                        settings,
                        (in, out, options) -> {
                            assertThat(options.maxScratchBytes()).isEqualTo(7L << 20);
                            throw new OfficeToPdf.OutputTooLarge(
                                    new IOException(
                                            "Maximum allowed scratch file memory exceeded."));
                        });
        Path out = dir.resolve("in.pdf");

        assertThatThrownBy(
                        () ->
                                service.convert(
                                        docx("x"),
                                        out,
                                        service.deadline(),
                                        true,
                                        () -> fallback(out)))
                .isInstanceOfSatisfying(
                        ResponseStatusException.class,
                        e -> {
                            assertThat(e.getStatusCode()).isEqualTo(HttpStatus.CONTENT_TOO_LARGE);
                            assertThat(e.getReason()).contains("7 MB");
                        });
        assertThat(fallbacks).hasValue(0);
    }

    @Test
    void aZipBombIsRefusedWithoutHandingItToLibreOffice() throws Exception {
        OfficeToPdfService service =
                service(
                        settings(1, 0),
                        (in, out, options) -> {
                            throw new OfficeZip.Oversized(
                                    "The document looks like a zip bomb: it inflates 343 times");
                        });
        Path out = dir.resolve("in.pdf");

        assertThatThrownBy(
                        () ->
                                service.convert(
                                        docx("x"),
                                        out,
                                        service.deadline(),
                                        true,
                                        () -> fallback(out)))
                .isInstanceOfSatisfying(
                        ResponseStatusException.class,
                        e -> {
                            assertThat(e.getStatusCode()).isEqualTo(HttpStatus.CONTENT_TOO_LARGE);
                            assertThat(e.getReason()).contains("zip bomb");
                        });
        assertThat(fallbacks).hasValue(0);
    }

    @Test
    void aPartialResultAtThePageLimitIsReportedAsDamageNotAsThePageLimit() throws Exception {
        ApplicationProperties.OfficeToPdf settings = settings(1, 0);
        settings.setMaxPages(3);
        OfficeToPdfService service =
                service(
                        settings,
                        (in, out, options) ->
                                new OfficeToPdf.Result(
                                        3,
                                        true,
                                        List.of(
                                                "Sheet Data is damaged; some rows could not be read")));
        Path out = dir.resolve("in.pdf");

        assertThatThrownBy(
                        () -> service.convert(docx("x"), out, service.deadline(), false, () -> {}))
                .isInstanceOfSatisfying(
                        ResponseStatusException.class,
                        e -> {
                            assertThat(e.getStatusCode())
                                    .isEqualTo(HttpStatus.UNPROCESSABLE_ENTITY);
                            assertThat(e.getReason()).contains("Sheet Data is damaged");
                        });
        service.convert(docx("x"), out, service.deadline(), true, () -> fallback(out));
        assertThat(fallbacks).hasValue(1);
    }

    @Test
    void keepsTheDeadlineInsideTheRequestTimeout() {
        assertThat(OfficeToPdfService.withinRequest(Duration.ofMinutes(30), 1_200_000))
                .isEqualTo(Duration.ofMinutes(20).minusSeconds(30));
        assertThat(OfficeToPdfService.withinRequest(Duration.ofMinutes(5), 1_200_000))
                .isEqualTo(Duration.ofMinutes(5));
        assertThat(OfficeToPdfService.withinRequest(Duration.ofMinutes(5), 60_000))
                .isEqualTo(Duration.ofSeconds(54));
        assertThat(OfficeToPdfService.withinRequest(Duration.ofMinutes(5), 0))
                .isEqualTo(Duration.ofMinutes(5));
        assertThat(new ApplicationProperties.OfficeToPdf().getTimeoutSeconds()).isEqualTo(300);
    }

    @Test
    void convertsSlidesNestedPastTheJava24XmlDepth() throws Exception {
        OfficeToPdfService service = service(settings(1, 0), OfficeToPdf::convert);
        assertThat(System.getProperty("jdk.xml.maxElementDepth")).isNotNull();
        Path in = dir.resolve("deep.pptx");
        try (XMLSlideShow ppt = new XMLSlideShow()) {
            XSLFSlide slide = ppt.createSlide();
            slide.createTextBox().setText("Top of the slide");
            XSLFGroupShape group = slide.createGroup();
            for (int i = 0; i < 120; i++) {
                group = group.createGroup();
            }
            group.createTextBox().setText("Deep inside");
            try (var os = Files.newOutputStream(in)) {
                ppt.write(os);
            }
        }
        Path out = dir.resolve("deep.pdf");

        service.convert(in, out, service.deadline(), false, () -> {});

        try (PDDocument pdf = Loader.loadPDF(out.toFile())) {
            assertThat(new PDFTextStripper().getText(pdf).replaceAll("\\s", ""))
                    .contains("Topoftheslide");
        }
    }

    @Test
    void explainsAnXmlLimitInPlainWords() {
        assertThat(
                        OfficeToPdfService.reason(
                                new IOException(
                                        "The document exceeds the JVM's XML limit"
                                                + " jdk.xml.maxElementDepth; start the JVM with"
                                                + " -Djdk.xml.maxElementDepth=...")))
                .isEqualTo(
                        "The document is nested too deeply or holds too much text in one part to"
                                + " convert");
        assertThat(OfficeToPdfService.reason(new IOException("The file is empty")))
                .isEqualTo("The file is empty");
    }

    @Test
    void retriesAPartialConversionWithLibreOffice() throws Exception {
        OfficeToPdfService service =
                service(
                        settings(1, 0),
                        (in, out, options) ->
                                new OfficeToPdf.Result(
                                        3, true, List.of("Only the first 3 pages were converted")));
        Path out = dir.resolve("in.pdf");

        service.convert(docx("x"), out, service.deadline(), true, () -> fallback(out));

        assertThat(fallbacks).hasValue(1);
    }

    @Test
    void refusesARequestWhenEverySlotAndQueuePlaceIsTaken() throws Exception {
        CountDownLatch started = new CountDownLatch(1);
        OfficeToPdfService service = service(settings(1, 0), blocking(started));
        Path in = docx("x");
        CompletableFuture<Void> first =
                CompletableFuture.runAsync(
                        () -> {
                            try {
                                service.convert(
                                        in,
                                        dir.resolve("a.pdf"),
                                        service.deadline(),
                                        true,
                                        () -> {});
                            } catch (Exception e) {
                                throw new IllegalStateException(e);
                            }
                        });
        assertThat(started.await(10, TimeUnit.SECONDS)).isTrue();

        long start = System.nanoTime();
        assertThatThrownBy(
                        () ->
                                service.convert(
                                        in,
                                        dir.resolve("b.pdf"),
                                        service.deadline(),
                                        true,
                                        () -> fallback(dir.resolve("b.pdf"))))
                .isInstanceOfSatisfying(
                        ResponseStatusException.class,
                        e -> {
                            assertThat(e.getStatusCode()).isEqualTo(HttpStatus.SERVICE_UNAVAILABLE);
                            assertThat(e.getHeaders().getFirst(HttpHeaders.RETRY_AFTER))
                                    .isEqualTo("5");
                        });
        assertThat(Duration.ofNanos(System.nanoTime() - start)).isLessThan(Duration.ofSeconds(5));
        assertThat(fallbacks).hasValue(0);

        release.countDown();
        first.get(10, TimeUnit.SECONDS);
        assertThat(service.available()).isEqualTo(1);
    }

    @Test
    void queuedRequestsWaitForASlotUpToTheQueueLength() throws Exception {
        CountDownLatch started = new CountDownLatch(1);
        OfficeToPdfService service = service(settings(1, 1), blocking(started));
        Path in = docx("x");
        CompletableFuture<Void> first = convertAsync(service, in, "a.pdf");
        assertThat(started.await(10, TimeUnit.SECONDS)).isTrue();
        CompletableFuture<Void> second = convertAsync(service, in, "b.pdf");
        waitForQueue(service, second);

        assertThatThrownBy(
                        () ->
                                service.convert(
                                        in,
                                        dir.resolve("c.pdf"),
                                        service.deadline(),
                                        true,
                                        () -> {}))
                .isInstanceOf(ResponseStatusException.class);

        release.countDown();
        first.get(10, TimeUnit.SECONDS);
        second.get(10, TimeUnit.SECONDS);
        assertThat(dir.resolve("b.pdf")).exists();
        assertThat(service.available()).isEqualTo(1);
    }

    @Test
    void aQueuedRequestGivesUpAtItsDeadline() throws Exception {
        CountDownLatch started = new CountDownLatch(1);
        OfficeToPdfService service = service(settings(1, 4), blocking(started));
        Path in = docx("x");
        CompletableFuture<Void> first = convertAsync(service, in, "a.pdf");
        assertThat(started.await(10, TimeUnit.SECONDS)).isTrue();

        long start = System.nanoTime();
        long deadline = start + Duration.ofMillis(300).toNanos();
        assertThatThrownBy(
                        () ->
                                service.convert(
                                        in,
                                        dir.resolve("b.pdf"),
                                        deadline,
                                        true,
                                        () -> fallback(dir.resolve("b.pdf"))))
                .isInstanceOfSatisfying(
                        ResponseStatusException.class,
                        e ->
                                assertThat(e.getStatusCode())
                                        .isEqualTo(HttpStatus.SERVICE_UNAVAILABLE));
        Duration waited = Duration.ofNanos(System.nanoTime() - start);
        assertThat(waited).isBetween(Duration.ofMillis(250), Duration.ofSeconds(5));
        assertThat(fallbacks).hasValue(0);

        release.countDown();
        first.get(10, TimeUnit.SECONDS);
    }

    @Test
    void passesTheRemainingTimeToTheConverter() throws Exception {
        Duration[] seen = new Duration[1];
        OfficeToPdfService service =
                service(
                        settings(1, 0),
                        (in, out, options) -> {
                            seen[0] = options.timeout();
                            return new OfficeToPdf.Result(1, false, List.of());
                        });

        service.convert(
                docx("x"),
                dir.resolve("a.pdf"),
                System.nanoTime() + Duration.ofSeconds(5).toNanos(),
                true,
                () -> {});

        assertThat(seen[0]).isPositive().isLessThanOrEqualTo(Duration.ofSeconds(5));
    }

    @Test
    void stopsALongConversionAtTheDeadlineWithoutFallingBack() throws Exception {
        OfficeToPdfService service = service(settings(1, 0), OfficeToPdf::convert);
        String words = String.join(" ", Collections.nCopies(100, "lorem"));
        String[] pages = new String[2000];
        Arrays.fill(pages, words);
        Path in = dir.resolve("long.docx");
        Files.write(in, OfficeFixtures.docx(pages));
        Path out = dir.resolve("long.pdf");

        long start = System.nanoTime();
        assertThatThrownBy(
                        () ->
                                service.convert(
                                        in,
                                        out,
                                        start + Duration.ofMillis(100).toNanos(),
                                        true,
                                        () -> fallback(out)))
                .isInstanceOfSatisfying(
                        ResponseStatusException.class,
                        e -> {
                            assertThat(e.getStatusCode()).isEqualTo(HttpStatus.SERVICE_UNAVAILABLE);
                            assertThat(e.getReason()).contains("time limit");
                        });
        assertThat(Duration.ofNanos(System.nanoTime() - start)).isLessThan(Duration.ofSeconds(10));
        assertThat(fallbacks).hasValue(0);
        assertThat(out).doesNotExist();
        assertThat(service.available()).isEqualTo(1);
    }

    @Test
    void aTimeoutOrInterruptNeverFallsBack() throws Exception {
        OfficeToPdfService service =
                service(
                        settings(1, 0),
                        (in, out, options) -> {
                            throw new InterruptedIOException("stopped");
                        });
        Path out = dir.resolve("in.pdf");

        assertThatThrownBy(
                        () ->
                                service.convert(
                                        docx("x"),
                                        out,
                                        service.deadline(),
                                        true,
                                        () -> fallback(out)))
                .isInstanceOf(InterruptedIOException.class);
        assertThat(fallbacks).hasValue(0);
        assertThat(service.available()).isEqualTo(1);
    }

    @Test
    void anExpiredDeadlineNeitherConvertsNorFallsBack() throws Exception {
        AtomicInteger calls = new AtomicInteger();
        OfficeToPdfService service =
                service(
                        settings(1, 0),
                        (in, out, options) -> {
                            calls.incrementAndGet();
                            return new OfficeToPdf.Result(1, false, List.of());
                        });
        Path out = dir.resolve("in.pdf");

        assertThatThrownBy(
                        () ->
                                service.convert(
                                        docx("x"),
                                        out,
                                        System.nanoTime() - 1,
                                        true,
                                        () -> fallback(out)))
                .isInstanceOf(ResponseStatusException.class);
        assertThat(calls).hasValue(0);
        assertThat(fallbacks).hasValue(0);
    }

    @Test
    void stopsASlowLibreOfficeFallbackAtTheDeadline() throws Exception {
        OfficeToPdfService service =
                service(
                        settings(1, 0),
                        (in, out, options) -> {
                            throw new IOException("The file is not a zip");
                        });
        Path out = dir.resolve("in.pdf");
        AtomicInteger stopped = new AtomicInteger();

        long start = System.nanoTime();
        assertThatThrownBy(
                        () ->
                                service.convert(
                                        docx("x"),
                                        out,
                                        start + Duration.ofMillis(300).toNanos(),
                                        true,
                                        () -> {
                                            try {
                                                Thread.sleep(Duration.ofMinutes(1));
                                            } catch (InterruptedException e) {
                                                stopped.incrementAndGet();
                                                throw e;
                                            }
                                        }))
                .isInstanceOfSatisfying(
                        ResponseStatusException.class,
                        e -> {
                            assertThat(e.getStatusCode()).isEqualTo(HttpStatus.SERVICE_UNAVAILABLE);
                            assertThat(e.getReason()).contains("time limit");
                            assertThat(e.getHeaders().getFirst(HttpHeaders.RETRY_AFTER)).isNull();
                        });
        assertThat(Duration.ofNanos(System.nanoTime() - start)).isLessThan(Duration.ofSeconds(10));
        assertThat(stopped).hasValue(1);
        assertThat(Thread.currentThread().isInterrupted()).isFalse();
    }

    @Test
    void aFallbackThatFinishesInTimeLeavesNoInterruptBehind() throws Exception {
        OfficeToPdfService service =
                service(
                        settings(1, 0),
                        (in, out, options) -> {
                            throw new IOException("The file is not a zip");
                        });
        Path out = dir.resolve("in.pdf");

        service.convert(
                docx("x"),
                out,
                System.nanoTime() + Duration.ofMillis(200).toNanos(),
                true,
                () -> fallback(out));
        Thread.sleep(400);

        assertThat(fallbacks).hasValue(1);
        assertThat(Thread.currentThread().isInterrupted()).isFalse();
    }

    @Test
    void reportsTheConverterReasonWhenLibreOfficeFailsToo() throws Exception {
        OfficeToPdfService service =
                service(
                        settings(1, 0),
                        (in, out, options) -> {
                            throw new IOException("The file is not a zip");
                        });
        Path out = dir.resolve("in.pdf");

        assertThatThrownBy(
                        () ->
                                service.convert(
                                        docx("x"),
                                        out,
                                        service.deadline(),
                                        true,
                                        () -> {
                                            throw new IllegalStateException(
                                                    "Conversion failed (exit 1)");
                                        }))
                .isInstanceOfSatisfying(
                        ResponseStatusException.class,
                        e -> {
                            assertThat(e.getStatusCode())
                                    .isEqualTo(HttpStatus.UNPROCESSABLE_ENTITY);
                            assertThat(e.getReason()).isEqualTo("The file is not a zip");
                            assertThat(e.getSuppressed())
                                    .singleElement()
                                    .extracting(Throwable::getMessage)
                                    .isEqualTo("Conversion failed (exit 1)");
                        });
    }

    @Test
    void anInterruptedFallbackStaysInterrupted() throws Exception {
        OfficeToPdfService service =
                service(
                        settings(1, 0),
                        (in, out, options) -> {
                            throw new IOException("The file is not a zip");
                        });
        Path out = dir.resolve("in.pdf");

        assertThatThrownBy(
                        () ->
                                service.convert(
                                        docx("x"),
                                        out,
                                        service.deadline(),
                                        true,
                                        () -> {
                                            throw new InterruptedException("cancelled");
                                        }))
                .isInstanceOf(InterruptedException.class);
    }

    private CompletableFuture<Void> convertAsync(OfficeToPdfService service, Path in, String out) {
        return CompletableFuture.runAsync(
                () -> {
                    try {
                        service.convert(in, dir.resolve(out), service.deadline(), true, () -> {});
                    } catch (Exception e) {
                        throw new IllegalStateException(e);
                    }
                });
    }

    private static void waitForQueue(OfficeToPdfService service, CompletableFuture<Void> waiting)
            throws InterruptedException, ExecutionException {
        long until = System.nanoTime() + Duration.ofSeconds(10).toNanos();
        while (service.queued() == 0 && System.nanoTime() < until) {
            if (waiting.isDone()) {
                waiting.get();
            }
            Thread.onSpinWait();
        }
        assertThat(service.queued()).isEqualTo(1);
    }
}
