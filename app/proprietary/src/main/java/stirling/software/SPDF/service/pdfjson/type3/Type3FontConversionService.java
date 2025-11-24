package stirling.software.SPDF.service.pdfjson.type3;

import java.io.IOException;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

import org.springframework.stereotype.Service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.model.json.PdfJsonFontConversionCandidate;
import stirling.software.SPDF.model.json.PdfJsonFontConversionStatus;

@Slf4j
@Service
@RequiredArgsConstructor
public class Type3FontConversionService {

    private final List<Type3ConversionStrategy> strategies;
    private final Type3GlyphExtractor glyphExtractor;

    public List<PdfJsonFontConversionCandidate> synthesize(Type3ConversionRequest request) {
        if (request == null || request.getFont() == null) {
            return Collections.emptyList();
        }
        if (strategies == null || strategies.isEmpty()) {
            log.debug(
                    "[TYPE3] No conversion strategies registered for font {}", request.getFontId());
            return Collections.emptyList();
        }

        List<PdfJsonFontConversionCandidate> candidates = new ArrayList<>();
        Type3GlyphContext glyphContext = null;
        for (Type3ConversionStrategy strategy : strategies) {
            if (strategy == null) {
                continue;
            }
            PdfJsonFontConversionCandidate candidate =
                    runStrategy(
                            strategy,
                            request,
                            glyphContext == null
                                    ? (glyphContext =
                                            new Type3GlyphContext(request, glyphExtractor))
                                    : glyphContext);
            if (candidate != null) {
                candidates.add(candidate);
            }
        }
        return candidates;
    }

    private PdfJsonFontConversionCandidate runStrategy(
            Type3ConversionStrategy strategy,
            Type3ConversionRequest request,
            Type3GlyphContext glyphContext) {
        if (!strategy.isAvailable()) {
            return PdfJsonFontConversionCandidate.builder()
                    .strategyId(strategy.getId())
                    .strategyLabel(strategy.getLabel())
                    .status(PdfJsonFontConversionStatus.SKIPPED)
                    .message("Strategy unavailable on current host")
                    .build();
        }
        try {
            if (!strategy.supports(request, glyphContext)) {
                return PdfJsonFontConversionCandidate.builder()
                        .strategyId(strategy.getId())
                        .strategyLabel(strategy.getLabel())
                        .status(PdfJsonFontConversionStatus.UNSUPPORTED)
                        .message("Font not supported by strategy")
                        .build();
            }
        } catch (IOException supportCheckException) {
            log.warn(
                    "[TYPE3] Strategy {} support check failed for font {}: {}",
                    strategy.getId(),
                    request.getFontUid(),
                    supportCheckException.getMessage(),
                    supportCheckException);
            return PdfJsonFontConversionCandidate.builder()
                    .strategyId(strategy.getId())
                    .strategyLabel(strategy.getLabel())
                    .status(PdfJsonFontConversionStatus.UNSUPPORTED)
                    .message("Support check failed: " + supportCheckException.getMessage())
                    .build();
        }

        try {
            PdfJsonFontConversionCandidate result = strategy.convert(request, glyphContext);
            if (result == null) {
                log.info(
                        "[TYPE3] Strategy {} returned null result for font {}",
                        strategy.getId(),
                        request.getFontUid());
                return PdfJsonFontConversionCandidate.builder()
                        .strategyId(strategy.getId())
                        .strategyLabel(strategy.getLabel())
                        .status(PdfJsonFontConversionStatus.FAILURE)
                        .message("Strategy returned null result")
                        .build();
            }
            if (result.getStrategyId() == null) {
                result.setStrategyId(strategy.getId());
            }
            if (result.getStrategyLabel() == null) {
                result.setStrategyLabel(strategy.getLabel());
            }
            log.debug(
                    "[TYPE3] Strategy {} finished with status {} (message: {}) for font {}",
                    strategy.getId(),
                    result.getStatus(),
                    result.getMessage(),
                    request.getFontUid());
            return result;
        } catch (IOException ex) {
            log.warn(
                    "[TYPE3] Strategy {} failed for font {}: {}",
                    strategy.getId(),
                    request.getFontUid(),
                    ex.getMessage(),
                    ex);
            return PdfJsonFontConversionCandidate.builder()
                    .strategyId(strategy.getId())
                    .strategyLabel(strategy.getLabel())
                    .status(PdfJsonFontConversionStatus.FAILURE)
                    .message(ex.getMessage())
                    .build();
        }
    }
}
