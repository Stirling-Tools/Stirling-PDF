package stirling.software.SPDF.service;

import java.io.EOFException;
import java.io.IOException;
import java.io.InterruptedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.stream.Collectors;
import java.util.zip.ZipException;

import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Service;

import jakarta.annotation.PostConstruct;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.util.ExceptionUtils;
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;
import stirling.software.officeconvert.UnsupportedFormatException;
import stirling.software.officeconvert.memory.Admission;
import stirling.software.officeconvert.topdf.OfficeToPdf;
import stirling.software.officeconvert.topdf.io.PoiXml;

/** Office to PDF in process through Stirling Office Convert. */
@Slf4j
@Service
@RequiredArgsConstructor
public class OfficeToPdfService {

    private final ApplicationProperties applicationProperties;
    private final TempFileManager tempFileManager;

    /** Packages may use their own assets; local files and network resources remain inaccessible. */
    public byte[] convertHtml(byte[] html, boolean packaged) throws IOException {
        return convertHtml(html, packaged, 1f);
    }

    public byte[] convertHtml(byte[] html, boolean packaged, float zoom) throws IOException {
        try (TempFile in = new TempFile(tempFileManager, packaged ? ".zip" : ".html");
                TempFile out = new TempFile(tempFileManager, ".pdf")) {
            Files.write(in.getPath(), html);
            convert(
                    in.getPath(),
                    out.getPath(),
                    options().allowPackages(packaged).zoom(zoom),
                    "the document");
            return Files.readAllBytes(out.getPath());
        }
    }

    /** POI needs the XML limits Java 24 lowered for deep or large slides. */
    @PostConstruct
    void raiseXmlLimits() {
        PoiXml.raiseProcessLimits();
    }

    /**
     * Office Convert's single queue serves every conversion module, so one setting caps them all.
     */
    @PostConstruct
    void applySessionLimit() {
        int limit =
                Math.max(
                        0,
                        applicationProperties
                                .getProcessExecutor()
                                .getSessionLimit()
                                .getOfficeConvertSessionLimit());
        Admission.Limits defaults = Admission.Limits.defaults();
        Admission.configure(
                new Admission.Limits(
                        defaults.memoryBudgetPercent(),
                        limit,
                        defaults.maxWait(),
                        defaults.refuseOversize(),
                        defaults.readmitStopped()));
    }

    /** Loads the converter and scans fonts off the request path, so a first conversion is fast. */
    @EventListener(ApplicationReadyEvent.class)
    public void warmUp() {
        Thread.ofPlatform()
                .name("office-to-pdf-warm-up")
                .daemon()
                .start(
                        () ->
                                // PPTX is left out: POI logs errors for the warm-up deck.
                                OfficeToPdf.warmUp(
                                        OfficeToPdf.Format.DOCX, OfficeToPdf.Format.XLSX));
    }

    /** Whether Stirling Office Convert reads files with this extension. */
    public static boolean handles(String extension) {
        return OfficeToPdf.Format.recognises(Path.of("file." + extension));
    }

    /** Uses the server timeout and rejects incomplete output. */
    public void convert(Path in, Path out) throws IOException {
        convert(in, out, options());
    }

    /** Uses the server timeout; callers may add format-specific options. */
    public OfficeToPdf.Options options() {
        long minutes =
                applicationProperties
                        .getProcessExecutor()
                        .getTimeoutMinutes()
                        .getOfficeConvertTimeoutMinutes();
        return OfficeToPdf.Options.defaults().timeout(Duration.ofMinutes(minutes));
    }

    /** Rejects incomplete or page-limited output. */
    public void convert(Path in, Path out, OfficeToPdf.Options options) throws IOException {
        convert(in, out, options, in.getFileName().toString());
    }

    private void convert(Path in, Path out, OfficeToPdf.Options options, String name)
            throws IOException {
        OfficeToPdf.Result result;
        try {
            result = OfficeToPdf.convert(in, out, options);
        } catch (IOException e) {
            rejectUnreadable(e);
            throw e;
        }
        log.debug(
                "Converted {} to PDF in process: {} pages, {} warnings",
                in.getFileName(),
                result.pages(),
                result.warnings().size());
        if (result.pageLimitReached()) {
            throw ExceptionUtils.createIllegalArgumentException(
                    "error.conversionPageLimit",
                    "Converting {0} would produce more than {1} pages, the most one conversion"
                            + " can produce. Split it into smaller files and convert each one.",
                    name,
                    options.maxPages());
        }
        if (result.truncated()) {
            String reasons =
                    result.warnings().stream()
                            .filter(warning -> warning.contains("converted"))
                            .map(warning -> warning.endsWith(".") ? warning : warning + ".")
                            .collect(Collectors.joining(" "));
            throw ExceptionUtils.createIllegalArgumentException(
                    "error.conversionIncomplete",
                    "Only part of {0} could be converted. {1}",
                    name,
                    reasons);
        }
    }

    public static void rejectUnreadable(IOException e) {
        if (unreadableInput(e)) {
            String reason =
                    e instanceof EOFException || e instanceof ZipException
                            ? "it is damaged or incomplete"
                            : e.getMessage();
            throw ExceptionUtils.createIllegalArgumentException(
                    "error.conversionUnreadable", "The file could not be read: {0}", reason);
        }
    }

    static boolean unreadableInput(IOException e) {
        if (e instanceof InterruptedIOException) {
            return false;
        }
        String message = e.getMessage();
        return e instanceof UnsupportedFormatException
                || e instanceof ZipException
                || e instanceof EOFException
                || message != null && message.startsWith("The file is not");
    }
}
