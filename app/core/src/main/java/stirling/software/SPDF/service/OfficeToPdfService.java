package stirling.software.SPDF.service;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.stream.Collectors;

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
        OfficeToPdf.Result result = OfficeToPdf.convert(in, out, options);
        log.debug(
                "Converted {} to PDF in process: {} pages, {} warnings",
                in.getFileName(),
                result.pages(),
                result.warnings().size());
        if (result.pageLimitReached()) {
            throw ExceptionUtils.createIllegalArgumentException(
                    "error.conversionPageLimit",
                    "{0} would be longer than {1} pages, the most one conversion can produce."
                            + " Split it into smaller files and convert each one.",
                    in.getFileName(),
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
                    in.getFileName(),
                    reasons);
        }
    }
}
