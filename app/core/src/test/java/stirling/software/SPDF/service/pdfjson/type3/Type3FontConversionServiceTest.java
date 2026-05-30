package stirling.software.SPDF.service.pdfjson.type3;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import java.io.IOException;
import java.util.Collections;
import java.util.List;

import org.apache.pdfbox.pdmodel.font.PDType3Font;
import org.junit.jupiter.api.Test;

import stirling.software.SPDF.model.json.PdfJsonFontConversionCandidate;
import stirling.software.SPDF.model.json.PdfJsonFontConversionStatus;

class Type3FontConversionServiceTest {

    @Test
    void synthesize_nullRequest_returnsEmpty() {
        Type3GlyphExtractor extractor = mock(Type3GlyphExtractor.class);
        Type3FontConversionService service = new Type3FontConversionService(List.of(), extractor);
        List<PdfJsonFontConversionCandidate> result = service.synthesize(null);
        assertTrue(result.isEmpty());
    }

    @Test
    void synthesize_nullFont_returnsEmpty() {
        Type3GlyphExtractor extractor = mock(Type3GlyphExtractor.class);
        Type3FontConversionService service = new Type3FontConversionService(List.of(), extractor);
        Type3ConversionRequest request = Type3ConversionRequest.builder().font(null).build();
        List<PdfJsonFontConversionCandidate> result = service.synthesize(request);
        assertTrue(result.isEmpty());
    }

    @Test
    void synthesize_noStrategies_returnsEmpty() {
        Type3GlyphExtractor extractor = mock(Type3GlyphExtractor.class);
        Type3FontConversionService service =
                new Type3FontConversionService(Collections.emptyList(), extractor);
        PDType3Font font = mock(PDType3Font.class);
        Type3ConversionRequest request =
                Type3ConversionRequest.builder().font(font).fontId("F1").build();
        List<PdfJsonFontConversionCandidate> result = service.synthesize(request);
        assertTrue(result.isEmpty());
    }

    @Test
    void synthesize_nullStrategiesList_returnsEmpty() {
        Type3GlyphExtractor extractor = mock(Type3GlyphExtractor.class);
        Type3FontConversionService service = new Type3FontConversionService(null, extractor);
        PDType3Font font = mock(PDType3Font.class);
        Type3ConversionRequest request =
                Type3ConversionRequest.builder().font(font).fontId("F1").build();
        List<PdfJsonFontConversionCandidate> result = service.synthesize(request);
        assertTrue(result.isEmpty());
    }

    @Test
    void synthesize_unavailableStrategy_returnsSkipped() {
        Type3ConversionStrategy strategy = mock(Type3ConversionStrategy.class);
        when(strategy.isAvailable()).thenReturn(false);
        when(strategy.getId()).thenReturn("test-strategy");
        when(strategy.getLabel()).thenReturn("Test Strategy");

        Type3GlyphExtractor extractor = mock(Type3GlyphExtractor.class);
        Type3FontConversionService service =
                new Type3FontConversionService(List.of(strategy), extractor);
        PDType3Font font = mock(PDType3Font.class);
        Type3ConversionRequest request =
                Type3ConversionRequest.builder().font(font).fontId("F1").pageNumber(1).build();

        List<PdfJsonFontConversionCandidate> result = service.synthesize(request);
        assertEquals(1, result.size());
        assertEquals(PdfJsonFontConversionStatus.SKIPPED, result.get(0).getStatus());
    }

    @Test
    void synthesize_unsupportedFont_returnsUnsupported() throws IOException {
        Type3ConversionStrategy strategy = mock(Type3ConversionStrategy.class);
        when(strategy.isAvailable()).thenReturn(true);
        when(strategy.supports(any(), any())).thenReturn(false);
        when(strategy.getId()).thenReturn("test-strategy");
        when(strategy.getLabel()).thenReturn("Test Strategy");

        Type3GlyphExtractor extractor = mock(Type3GlyphExtractor.class);
        Type3FontConversionService service =
                new Type3FontConversionService(List.of(strategy), extractor);
        PDType3Font font = mock(PDType3Font.class);
        Type3ConversionRequest request =
                Type3ConversionRequest.builder().font(font).fontId("F1").pageNumber(1).build();

        List<PdfJsonFontConversionCandidate> result = service.synthesize(request);
        assertEquals(1, result.size());
        assertEquals(PdfJsonFontConversionStatus.UNSUPPORTED, result.get(0).getStatus());
    }

    @Test
    void synthesize_successfulConversion() throws IOException {
        PdfJsonFontConversionCandidate candidate =
                PdfJsonFontConversionCandidate.builder()
                        .status(PdfJsonFontConversionStatus.SUCCESS)
                        .message("OK")
                        .build();
        Type3ConversionStrategy strategy = mock(Type3ConversionStrategy.class);
        when(strategy.isAvailable()).thenReturn(true);
        when(strategy.supports(any(), any())).thenReturn(true);
        when(strategy.convert(any(), any())).thenReturn(candidate);
        when(strategy.getId()).thenReturn("test-strategy");
        when(strategy.getLabel()).thenReturn("Test Strategy");

        Type3GlyphExtractor extractor = mock(Type3GlyphExtractor.class);
        Type3FontConversionService service =
                new Type3FontConversionService(List.of(strategy), extractor);
        PDType3Font font = mock(PDType3Font.class);
        Type3ConversionRequest request =
                Type3ConversionRequest.builder().font(font).fontId("F1").pageNumber(1).build();

        List<PdfJsonFontConversionCandidate> result = service.synthesize(request);
        assertEquals(1, result.size());
        assertEquals(PdfJsonFontConversionStatus.SUCCESS, result.get(0).getStatus());
        assertEquals("test-strategy", result.get(0).getStrategyId());
    }

    @Test
    void synthesize_strategyReturnsNull_resultsInFailure() throws IOException {
        Type3ConversionStrategy strategy = mock(Type3ConversionStrategy.class);
        when(strategy.isAvailable()).thenReturn(true);
        when(strategy.supports(any(), any())).thenReturn(true);
        when(strategy.convert(any(), any())).thenReturn(null);
        when(strategy.getId()).thenReturn("test-strategy");
        when(strategy.getLabel()).thenReturn("Test Strategy");

        Type3GlyphExtractor extractor = mock(Type3GlyphExtractor.class);
        Type3FontConversionService service =
                new Type3FontConversionService(List.of(strategy), extractor);
        PDType3Font font = mock(PDType3Font.class);
        Type3ConversionRequest request =
                Type3ConversionRequest.builder()
                        .font(font)
                        .fontId("F1")
                        .fontUid("uid1")
                        .pageNumber(1)
                        .build();

        List<PdfJsonFontConversionCandidate> result = service.synthesize(request);
        assertEquals(1, result.size());
        assertEquals(PdfJsonFontConversionStatus.FAILURE, result.get(0).getStatus());
    }

    @Test
    void synthesize_strategyThrowsIOException_resultsInFailure() throws IOException {
        Type3ConversionStrategy strategy = mock(Type3ConversionStrategy.class);
        when(strategy.isAvailable()).thenReturn(true);
        when(strategy.supports(any(), any())).thenReturn(true);
        when(strategy.convert(any(), any())).thenThrow(new IOException("broken"));
        when(strategy.getId()).thenReturn("test-strategy");
        when(strategy.getLabel()).thenReturn("Test Strategy");

        Type3GlyphExtractor extractor = mock(Type3GlyphExtractor.class);
        Type3FontConversionService service =
                new Type3FontConversionService(List.of(strategy), extractor);
        PDType3Font font = mock(PDType3Font.class);
        Type3ConversionRequest request =
                Type3ConversionRequest.builder()
                        .font(font)
                        .fontId("F1")
                        .fontUid("uid1")
                        .pageNumber(1)
                        .build();

        List<PdfJsonFontConversionCandidate> result = service.synthesize(request);
        assertEquals(1, result.size());
        assertEquals(PdfJsonFontConversionStatus.FAILURE, result.get(0).getStatus());
        assertEquals("broken", result.get(0).getMessage());
    }

    @Test
    void synthesize_supportCheckThrowsIOException_returnsUnsupported() throws IOException {
        Type3ConversionStrategy strategy = mock(Type3ConversionStrategy.class);
        when(strategy.isAvailable()).thenReturn(true);
        when(strategy.supports(any(), any())).thenThrow(new IOException("check failed"));
        when(strategy.getId()).thenReturn("test-strategy");
        when(strategy.getLabel()).thenReturn("Test Strategy");

        Type3GlyphExtractor extractor = mock(Type3GlyphExtractor.class);
        Type3FontConversionService service =
                new Type3FontConversionService(List.of(strategy), extractor);
        PDType3Font font = mock(PDType3Font.class);
        Type3ConversionRequest request =
                Type3ConversionRequest.builder()
                        .font(font)
                        .fontId("F1")
                        .fontUid("uid1")
                        .pageNumber(1)
                        .build();

        List<PdfJsonFontConversionCandidate> result = service.synthesize(request);
        assertEquals(1, result.size());
        assertEquals(PdfJsonFontConversionStatus.UNSUPPORTED, result.get(0).getStatus());
        assertTrue(result.get(0).getMessage().contains("check failed"));
    }

    @Test
    void synthesize_nullStrategyInList_isSkipped() throws IOException {
        PdfJsonFontConversionCandidate candidate =
                PdfJsonFontConversionCandidate.builder()
                        .status(PdfJsonFontConversionStatus.SUCCESS)
                        .message("OK")
                        .build();
        Type3ConversionStrategy goodStrategy = mock(Type3ConversionStrategy.class);
        when(goodStrategy.isAvailable()).thenReturn(true);
        when(goodStrategy.supports(any(), any())).thenReturn(true);
        when(goodStrategy.convert(any(), any())).thenReturn(candidate);
        when(goodStrategy.getId()).thenReturn("good");
        when(goodStrategy.getLabel()).thenReturn("Good");

        List<Type3ConversionStrategy> strategies = new java.util.ArrayList<>();
        strategies.add(null);
        strategies.add(goodStrategy);

        Type3GlyphExtractor extractor = mock(Type3GlyphExtractor.class);
        Type3FontConversionService service = new Type3FontConversionService(strategies, extractor);
        PDType3Font font = mock(PDType3Font.class);
        Type3ConversionRequest request =
                Type3ConversionRequest.builder().font(font).fontId("F1").pageNumber(1).build();

        List<PdfJsonFontConversionCandidate> result = service.synthesize(request);
        assertEquals(1, result.size());
        assertEquals(PdfJsonFontConversionStatus.SUCCESS, result.get(0).getStatus());
    }
}
