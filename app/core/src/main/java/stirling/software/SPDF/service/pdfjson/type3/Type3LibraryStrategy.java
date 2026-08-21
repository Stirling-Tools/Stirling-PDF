package stirling.software.SPDF.service.pdfjson.type3;

import java.io.IOException;

import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.model.json.PdfJsonFontConversionCandidate;
import stirling.software.SPDF.model.json.PdfJsonFontConversionStatus;
import stirling.software.SPDF.service.pdfjson.type3.library.Type3FontLibrary;
import stirling.software.SPDF.service.pdfjson.type3.library.Type3FontLibraryEntry;
import stirling.software.SPDF.service.pdfjson.type3.library.Type3FontLibraryMatch;
import stirling.software.SPDF.service.pdfjson.type3.library.Type3FontLibraryPayload;

@Slf4j
@Component
@Order(0)
@RequiredArgsConstructor
public class Type3LibraryStrategy implements Type3ConversionStrategy {

    private final Type3FontLibrary fontLibrary;
    private final stirling.software.common.model.ApplicationProperties applicationProperties;

    private boolean enabled;

    @Override
    public String getId() {
        return "type3-library";
    }

    @Override
    public String getLabel() {
        return "Type3 Font Library";
    }

    @Override
    public boolean isAvailable() {
        return enabled && fontLibrary != null && fontLibrary.isLoaded();
    }

    @jakarta.annotation.PostConstruct
    private void loadConfiguration() {
        if (applicationProperties.getPdfEditor() != null
                && applicationProperties.getPdfEditor().getType3() != null
                && applicationProperties.getPdfEditor().getType3().getLibrary() != null) {
            var cfg = applicationProperties.getPdfEditor().getType3().getLibrary();
            this.enabled = cfg.isEnabled();
        } else {
            this.enabled = false;
            log.warn("PdfEditor Type3 library configuration not available, disabled");
        }
    }

    @Override
    public PdfJsonFontConversionCandidate convert(
            Type3ConversionRequest request, Type3GlyphContext context) throws IOException {
        if (request == null || request.getFont() == null) {
            return PdfJsonFontConversionCandidate.builder()
                    .strategyId(getId())
                    .strategyLabel(getLabel())
                    .status(PdfJsonFontConversionStatus.FAILURE)
                    .message("No font supplied")
                    .build();
        }
        if (!isAvailable()) {
            return PdfJsonFontConversionCandidate.builder()
                    .strategyId(getId())
                    .strategyLabel(getLabel())
                    .status(PdfJsonFontConversionStatus.SKIPPED)
                    .message("Library disabled")
                    .build();
        }

        Type3FontLibraryMatch match = fontLibrary.match(request.getFont(), request.getFontUid());
        if (match == null || match.getEntry() == null) {
            return PdfJsonFontConversionCandidate.builder()
                    .strategyId(getId())
                    .strategyLabel(getLabel())
                    .status(PdfJsonFontConversionStatus.UNSUPPORTED)
                    .message("No library entry found")
                    .build();
        }

        Type3FontLibraryEntry entry = match.getEntry();
        if (!entry.hasAnyPayload()) {
            return PdfJsonFontConversionCandidate.builder()
                    .strategyId(getId())
                    .strategyLabel(getLabel())
                    .status(PdfJsonFontConversionStatus.FAILURE)
                    .message("Library entry has no payloads")
                    .build();
        }

        String message =
                String.format(
                        "Matched %s via %s",
                        entry.getLabel(),
                        match.getMatchType() != null ? match.getMatchType() : "alias");

        return PdfJsonFontConversionCandidate.builder()
                .strategyId(getId())
                .strategyLabel(getLabel())
                .status(PdfJsonFontConversionStatus.SUCCESS)
                .program(toBase64(entry.getProgram()))
                .programFormat(toFormat(entry.getProgram()))
                .webProgram(toBase64(entry.getWebProgram()))
                .webProgramFormat(toFormat(entry.getWebProgram()))
                .pdfProgram(toBase64(entry.getPdfProgram()))
                .pdfProgramFormat(toFormat(entry.getPdfProgram()))
                .glyphCoverage(
                        entry.getGlyphCoverage() != null
                                ? entry.getGlyphCoverage().stream()
                                        .mapToInt(Integer::intValue)
                                        .toArray()
                                : null)
                .message(message)
                .build();
    }

    private String toBase64(Type3FontLibraryPayload payload) {
        return payload != null ? payload.getBase64() : null;
    }

    private String toFormat(Type3FontLibraryPayload payload) {
        return payload != null ? payload.getFormat() : null;
    }
}
