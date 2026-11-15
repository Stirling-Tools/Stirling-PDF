package stirling.software.SPDF.service;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.Enumeration;
import java.util.Map;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.FutureTask;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import java.util.zip.ZipEntry;
import java.util.zip.ZipFile;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.springframework.core.io.Resource;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import lombok.RequiredArgsConstructor;

import stirling.software.SPDF.config.EndpointConfiguration;
import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.ExceptionUtils;
import stirling.software.common.util.GeneralUtils;
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;
import stirling.software.common.util.WebResponseUtils;
import stirling.software.officeconvert.OfficeConvert;
import stirling.software.officeconvert.PdfToPptx;
import stirling.software.officeconvert.legacy.PdfToPpt;

/**
 * PDF to Office in process through Stirling Office Convert, and the switch between it and the
 * legacy converters. Conversions use the configured LibreOffice timeout.
 */
@Service
@RequiredArgsConstructor
public class OfficeConversionService {

    /** Output formats by extension; a .doc is RTF, which Word opens as a document. */
    private static final Map<String, OfficeConvert.Format> FORMATS =
            Map.ofEntries(
                    Map.entry("docx", OfficeConvert.Format.DOCX),
                    Map.entry("doc", OfficeConvert.Format.RTF),
                    Map.entry("odt", OfficeConvert.Format.ODT),
                    Map.entry("rtf", OfficeConvert.Format.RTF),
                    Map.entry("txt", OfficeConvert.Format.TXT),
                    Map.entry("pptx", OfficeConvert.Format.PPTX),
                    Map.entry("odp", OfficeConvert.Format.ODP),
                    Map.entry("xlsx", OfficeConvert.Format.XLSX),
                    Map.entry("ods", OfficeConvert.Format.ODS),
                    Map.entry("html", OfficeConvert.Format.HTML),
                    Map.entry("md", OfficeConvert.Format.MARKDOWN),
                    Map.entry("xml", OfficeConvert.Format.XML),
                    Map.entry("epub", OfficeConvert.Format.EPUB),
                    Map.entry("azw3", OfficeConvert.Format.AZW3));

    private final ApplicationProperties applicationProperties;
    private final EndpointConfiguration endpointConfiguration;
    private final CustomPDFDocumentFactory pdfDocumentFactory;
    private final TempFileManager tempFileManager;

    /** The response owns the output file; failed conversions release it before returning. */
    public ResponseEntity<Resource> convert(
            MultipartFile input, String format, MediaType type, OfficeConvert.Settings settings)
            throws IOException {
        TempFile out = tempFileManager.createManagedTempFile("." + format);
        try (PDDocument document = pdfDocumentFactory.load(input)) {
            convert(document, out.getPath(), format, settings);
        } catch (Exception e) {
            out.close();
            throw e;
        }
        return WebResponseUtils.fileToWebResponse(
                out,
                GeneralUtils.generateFilename(input.getOriginalFilename(), "." + format),
                type);
    }

    public static boolean supports(String format) {
        return FORMATS.containsKey(format) || "ppt".equals(format);
    }

    /** Whether the legacy converters (LibreOffice, Tabula, plain text) apply. */
    public boolean legacy() {
        return legacy(null);
    }

    /** {@code choice} is the caller's per-request pick; null follows the admin setting. */
    public boolean legacy(Boolean choice) {
        return choice != null
                ? !choice
                : !applicationProperties.getSystem().isStirlingOfficeConversion();
    }

    public boolean libreOfficeAvailable() {
        return endpointConfiguration.isGroupEnabled("LibreOffice");
    }

    /** Stirling Office Convert replaces LibreOffice only when the admin enables it. */
    public boolean replacesLibreOffice() {
        return !legacy();
    }

    public boolean replacesLibreOffice(Boolean choice) {
        return !legacy(choice);
    }

    public OfficeConvert.Settings settings() {
        long minutes =
                applicationProperties
                        .getProcessExecutor()
                        .getTimeoutMinutes()
                        .getLibreOfficeTimeoutMinutes();
        return OfficeConvert.Settings.defaults().timeout(Duration.ofMinutes(minutes));
    }

    /**
     * Writes {@code document} to {@code target} as {@code format}, one {@link #supports} accepts.
     */
    public void convert(
            PDDocument document, Path target, String format, OfficeConvert.Settings settings)
            throws IOException {
        if (!supports(format)) {
            throw new IllegalArgumentException("No PDF to Office conversion to " + format);
        }
        try (OutputStream out = Files.newOutputStream(target)) {
            if ("ppt".equals(format)) {
                convertToPpt(document, out, settings);
            } else {
                OfficeConvert.convert(document, out, FORMATS.get(format), settings);
            }
        }
    }

    /** A .ppt holds one slide per page; the legacy writer creates them up front. */
    static final int MAX_PPT_SLIDES = 5000;

    /**
     * Binary PowerPoint comes from the legacy module, which the shared {@link OfficeConvert} path
     * does not cover, so the page count is bounded and the work runs under {@code
     * settings.timeout()} like every other format.
     */
    private void convertToPpt(
            PDDocument document, OutputStream out, OfficeConvert.Settings settings)
            throws IOException {
        int total = document.getNumberOfPages();
        int first = settings.firstPage() > 0 ? settings.firstPage() : 1;
        int last = settings.lastPage() > 0 ? Math.min(settings.lastPage(), total) : total;
        if (last - first + 1 >= MAX_PPT_SLIDES) {
            throw ExceptionUtils.createIllegalArgumentException(
                    "error.pptTooManyPages",
                    "A .ppt holds at most {0} pages; convert to .pptx instead.",
                    MAX_PPT_SLIDES);
        }
        FutureTask<Void> task =
                new FutureTask<>(
                        () -> {
                            PdfToPpt.convert(document, out, slides(settings));
                            return null;
                        });
        Thread worker = Thread.ofPlatform().name("office-convert-ppt").daemon().unstarted(task);
        worker.start();
        awaitPptConversion(task, worker, settings.timeout());
    }

    static void awaitPptConversion(FutureTask<Void> task, Thread worker, Duration timeout)
            throws IOException {
        try {
            task.get(timeout.toNanos(), TimeUnit.NANOSECONDS);
        } catch (TimeoutException e) {
            task.cancel(true);
            awaitWorkerTermination(worker);
            throw new IOException(
                    "The conversion took longer than "
                            + timeout.toMillis()
                            + " ms and was stopped");
        } catch (InterruptedException e) {
            task.cancel(true);
            awaitWorkerTermination(worker);
            Thread.currentThread().interrupt();
            throw new IOException("Conversion interrupted", e);
        } catch (ExecutionException e) {
            task.cancel(true);
            Throwable cause = e.getCause();
            if (cause instanceof IOException io) {
                throw io;
            }
            if (cause instanceof RuntimeException re) {
                throw re;
            }
            throw new IOException("PDF to .ppt conversion failed", cause);
        }
    }

    /**
     * Waits for the cancelled worker to stop touching {@code out} and the document before the
     * caller closes them. The legacy writer's final POI write may ignore interruption, so even a
     * further interruption must not release resources that the worker still owns.
     */
    private static void awaitWorkerTermination(Thread worker) {
        boolean interrupted = false;
        while (worker.isAlive()) {
            try {
                worker.join();
            } catch (InterruptedException e) {
                interrupted = true;
            }
        }
        if (interrupted) {
            Thread.currentThread().interrupt();
        }
    }

    /**
     * Whether a workbook holds any cell. With no table found, a sheet-per-table workbook is a
     * single empty sheet.
     */
    public static boolean hasCells(Path xlsx) throws IOException {
        try (ZipFile zip = new ZipFile(xlsx.toFile())) {
            Enumeration<? extends ZipEntry> entries = zip.entries();
            while (entries.hasMoreElements()) {
                ZipEntry entry = entries.nextElement();
                if (!entry.getName().startsWith("xl/worksheets/")) {
                    continue;
                }
                try (InputStream in = zip.getInputStream(entry)) {
                    // A sheet's first cell follows its short header, well within the first
                    // megabyte.
                    if (new String(in.readNBytes(1 << 20), StandardCharsets.ISO_8859_1)
                            .contains("<c ")) {
                        return true;
                    }
                }
            }
        }
        return false;
    }

    private static PdfToPptx.Options slides(OfficeConvert.Settings s) {
        return new PdfToPptx.Options(
                s.firstPage(),
                s.lastPage(),
                s.tables(),
                s.figureDpi(),
                s.password(),
                s.pictureFallback(),
                s.pictures());
    }
}
