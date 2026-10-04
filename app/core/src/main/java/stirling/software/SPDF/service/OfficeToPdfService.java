package stirling.software.SPDF.service;

import java.io.IOException;
import java.nio.file.Path;
import java.time.Duration;

import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Service;

import jakarta.annotation.PostConstruct;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.ApplicationProperties;
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
        return officeConversionService.replacesLibreOffice()
                && OfficeToPdf.Format.recognises(Path.of("file." + extension));
    }

    public void convert(Path in, Path out) throws IOException {
        long minutes =
                applicationProperties
                        .getProcessExecutor()
                        .getTimeoutMinutes()
                        .getLibreOfficeTimeoutMinutes();
        OfficeToPdf.Result result =
                OfficeToPdf.convert(
                        in,
                        out,
                        OfficeToPdf.Options.defaults().timeout(Duration.ofMinutes(minutes)));
        log.debug(
                "Converted {} to PDF in process: {} pages, {} warnings",
                in.getFileName(),
                result.pages(),
                result.warnings().size());
        if (result.truncated() && officeConversionService.libreOfficeAvailable()) {
            // Lost content is worth a LibreOffice retry; without it, partial output beats none.
            throw new IOException("Only part of " + in.getFileName() + " could be converted");
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
