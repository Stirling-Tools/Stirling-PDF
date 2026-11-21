package stirling.software.SPDF.service;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;

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
import stirling.software.officeconvert.memory.Admission;
import stirling.software.officeconvert.topdf.OfficeToPdf;
import stirling.software.officeconvert.topdf.io.PoiXml;

/** Office to PDF in process through Stirling Office Convert, with LibreOffice as the fallback. */
@Slf4j
@Service
@RequiredArgsConstructor
public class OfficeToPdfService {

    private final OfficeConversionService officeConversionService;
    private final ApplicationProperties applicationProperties;
    private final TempFileManager tempFileManager;

    /** Packages may use their own assets; local files and network resources remain inaccessible. */
    public byte[] convertHtml(byte[] html, boolean packaged) throws IOException {
        try (TempFile in = new TempFile(tempFileManager, packaged ? ".zip" : ".html");
                TempFile out = new TempFile(tempFileManager, ".pdf")) {
            Files.write(in.getPath(), html);
            convert(in.getPath(), out.getPath(), options().allowPackages(packaged));
            return Files.readAllBytes(out.getPath());
        }
    }

    /** POI needs the XML limits Java 24 lowered for deep or large slides. */
    @PostConstruct
    void raiseXmlLimits() {
        PoiXml.raiseProcessLimits();
    }

    /** Loads the converter and scans fonts off the request path, so a first conversion is fast. */
    @EventListener(ApplicationReadyEvent.class)
    public void warmUp() {
        if (officeConversionService.replacesLibreOffice()) {
            Thread.ofPlatform()
                    .name("office-to-pdf-warm-up")
                    .daemon()
                    .start(
                            () ->
                                    // PPTX is left out: POI logs errors for the warm-up deck.
                                    OfficeToPdf.warmUp(
                                            OfficeToPdf.Format.DOCX, OfficeToPdf.Format.XLSX));
        }
    }

    /** Whether files with this extension convert in process rather than with LibreOffice. */
    public boolean handles(String extension) {
        return handles(extension, null);
    }

    public boolean handles(String extension, Boolean choice) {
        return officeConversionService.replacesLibreOffice(choice)
                && OfficeToPdf.Format.recognises(Path.of("file." + extension));
    }

    /** Uses the server timeout and rejects incomplete output even without a fallback installed. */
    public void convert(Path in, Path out) throws IOException {
        convert(in, out, options());
    }

    /** Uses the server timeout; callers may add format-specific options. */
    public OfficeToPdf.Options options() {
        long minutes =
                applicationProperties
                        .getProcessExecutor()
                        .getTimeoutMinutes()
                        .getLibreOfficeTimeoutMinutes();
        return OfficeToPdf.Options.defaults().timeout(Duration.ofMinutes(minutes));
    }

    /** Rejects incomplete or page-limited output; callers may retry with another converter. */
    public void convert(Path in, Path out, OfficeToPdf.Options options) throws IOException {
        OfficeToPdf.Result result = OfficeToPdf.convert(in, out, options);
        log.debug(
                "Converted {} to PDF in process: {} pages, {} warnings",
                in.getFileName(),
                result.pages(),
                result.warnings().size());
        if (result.truncated() || result.pageLimitReached()) {
            throw ExceptionUtils.createConversionIncompleteException(
                    String.valueOf(in.getFileName()));
        }
    }

    /** A timeout or a memory stop would only repeat, more slowly, in LibreOffice. */
    public boolean canFallBack(Throwable failure) {
        if (!officeConversionService.libreOfficeAvailable()) {
            return false;
        }
        for (Throwable t = failure; t != null; t = t.getCause()) {
            if (t instanceof OfficeToPdf.TimedOut
                    || t instanceof Admission.Stopped
                    || t instanceof OutOfMemoryError) {
                return false;
            }
        }
        return true;
    }
}
