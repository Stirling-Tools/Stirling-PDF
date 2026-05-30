package stirling.software.SPDF.service.pdfjson.type3;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import java.io.IOException;

import org.apache.pdfbox.pdmodel.font.PDType3Font;
import org.junit.jupiter.api.Test;

import stirling.software.SPDF.model.json.PdfJsonFontConversionCandidate;
import stirling.software.SPDF.model.json.PdfJsonFontConversionStatus;
import stirling.software.SPDF.service.pdfjson.type3.library.Type3FontLibrary;
import stirling.software.SPDF.service.pdfjson.type3.library.Type3FontLibraryEntry;
import stirling.software.SPDF.service.pdfjson.type3.library.Type3FontLibraryMatch;
import stirling.software.SPDF.service.pdfjson.type3.library.Type3FontLibraryPayload;
import stirling.software.common.model.ApplicationProperties;

class Type3LibraryStrategyTest {

    @Test
    void getId_returnsExpected() {
        Type3FontLibrary lib = mock(Type3FontLibrary.class);
        ApplicationProperties props = mock(ApplicationProperties.class);
        Type3LibraryStrategy strategy = new Type3LibraryStrategy(lib, props);
        assertEquals("type3-library", strategy.getId());
    }

    @Test
    void getLabel_returnsExpected() {
        Type3FontLibrary lib = mock(Type3FontLibrary.class);
        ApplicationProperties props = mock(ApplicationProperties.class);
        Type3LibraryStrategy strategy = new Type3LibraryStrategy(lib, props);
        assertEquals("Type3 Font Library", strategy.getLabel());
    }

    @Test
    void isAvailable_notEnabled_returnsFalse() {
        Type3FontLibrary lib = mock(Type3FontLibrary.class);
        ApplicationProperties props = mock(ApplicationProperties.class);
        Type3LibraryStrategy strategy = new Type3LibraryStrategy(lib, props);
        // enabled defaults to false since PostConstruct hasn't run
        assertFalse(strategy.isAvailable());
    }

    @Test
    void convert_nullRequest_returnsFailure() throws IOException {
        Type3FontLibrary lib = mock(Type3FontLibrary.class);
        ApplicationProperties props = mock(ApplicationProperties.class);
        Type3LibraryStrategy strategy = new Type3LibraryStrategy(lib, props);

        PdfJsonFontConversionCandidate result = strategy.convert(null, null);
        assertEquals(PdfJsonFontConversionStatus.FAILURE, result.getStatus());
        assertEquals("No font supplied", result.getMessage());
    }

    @Test
    void convert_nullFont_returnsFailure() throws IOException {
        Type3FontLibrary lib = mock(Type3FontLibrary.class);
        ApplicationProperties props = mock(ApplicationProperties.class);
        Type3LibraryStrategy strategy = new Type3LibraryStrategy(lib, props);
        Type3ConversionRequest request = Type3ConversionRequest.builder().font(null).build();

        PdfJsonFontConversionCandidate result = strategy.convert(request, null);
        assertEquals(PdfJsonFontConversionStatus.FAILURE, result.getStatus());
    }

    @Test
    void convert_notAvailable_returnsSkipped() throws IOException {
        Type3FontLibrary lib = mock(Type3FontLibrary.class);
        ApplicationProperties props = mock(ApplicationProperties.class);
        Type3LibraryStrategy strategy = new Type3LibraryStrategy(lib, props);
        PDType3Font font = mock(PDType3Font.class);
        Type3ConversionRequest request =
                Type3ConversionRequest.builder().font(font).fontId("F1").fontUid("uid1").build();

        PdfJsonFontConversionCandidate result = strategy.convert(request, null);
        assertEquals(PdfJsonFontConversionStatus.SKIPPED, result.getStatus());
        assertEquals("Library disabled", result.getMessage());
    }

    @Test
    void convert_noMatch_returnsUnsupported() throws Exception {
        Type3FontLibrary lib = mock(Type3FontLibrary.class);
        when(lib.isLoaded()).thenReturn(true);
        when(lib.match(any(), any())).thenReturn(null);

        ApplicationProperties props = mockEnabledProps();
        Type3LibraryStrategy strategy = new Type3LibraryStrategy(lib, props);
        // Manually enable by calling loadConfiguration via PostConstruct
        invokePostConstruct(strategy);

        PDType3Font font = mock(PDType3Font.class);
        Type3ConversionRequest request =
                Type3ConversionRequest.builder().font(font).fontId("F1").fontUid("uid1").build();

        PdfJsonFontConversionCandidate result = strategy.convert(request, null);
        assertEquals(PdfJsonFontConversionStatus.UNSUPPORTED, result.getStatus());
    }

    @Test
    void convert_matchWithPayload_returnsSuccess() throws Exception {
        Type3FontLibraryPayload payload = new Type3FontLibraryPayload("AQID", "ttf");
        Type3FontLibraryEntry entry =
                Type3FontLibraryEntry.builder()
                        .id("entry1")
                        .label("Test Entry")
                        .program(payload)
                        .glyphCode(65)
                        .glyphCode(66)
                        .build();
        Type3FontLibraryMatch match =
                Type3FontLibraryMatch.builder()
                        .entry(entry)
                        .matchType("signature")
                        .signature("sha256:abc")
                        .build();

        Type3FontLibrary lib = mock(Type3FontLibrary.class);
        when(lib.isLoaded()).thenReturn(true);
        when(lib.match(any(), any())).thenReturn(match);

        ApplicationProperties props = mockEnabledProps();
        Type3LibraryStrategy strategy = new Type3LibraryStrategy(lib, props);
        invokePostConstruct(strategy);

        PDType3Font font = mock(PDType3Font.class);
        Type3ConversionRequest request =
                Type3ConversionRequest.builder().font(font).fontId("F1").fontUid("uid1").build();

        PdfJsonFontConversionCandidate result = strategy.convert(request, null);
        assertEquals(PdfJsonFontConversionStatus.SUCCESS, result.getStatus());
        assertEquals("AQID", result.getProgram());
        assertEquals("ttf", result.getProgramFormat());
        assertNotNull(result.getGlyphCoverage());
        assertEquals(2, result.getGlyphCoverage().length);
        assertTrue(result.getMessage().contains("Test Entry"));
    }

    @Test
    void convert_matchNoPayload_returnsFailure() throws Exception {
        Type3FontLibraryEntry entry =
                Type3FontLibraryEntry.builder().id("entry1").label("No Payload").build();
        Type3FontLibraryMatch match =
                Type3FontLibraryMatch.builder()
                        .entry(entry)
                        .matchType("alias:test")
                        .signature("sha256:def")
                        .build();

        Type3FontLibrary lib = mock(Type3FontLibrary.class);
        when(lib.isLoaded()).thenReturn(true);
        when(lib.match(any(), any())).thenReturn(match);

        ApplicationProperties props = mockEnabledProps();
        Type3LibraryStrategy strategy = new Type3LibraryStrategy(lib, props);
        invokePostConstruct(strategy);

        PDType3Font font = mock(PDType3Font.class);
        Type3ConversionRequest request =
                Type3ConversionRequest.builder().font(font).fontId("F1").fontUid("uid1").build();

        PdfJsonFontConversionCandidate result = strategy.convert(request, null);
        assertEquals(PdfJsonFontConversionStatus.FAILURE, result.getStatus());
        assertEquals("Library entry has no payloads", result.getMessage());
    }

    private ApplicationProperties mockEnabledProps() {
        ApplicationProperties props = mock(ApplicationProperties.class);
        ApplicationProperties.PdfEditor pdfEditor = mock(ApplicationProperties.PdfEditor.class);
        ApplicationProperties.PdfEditor.Type3 type3 =
                mock(ApplicationProperties.PdfEditor.Type3.class);
        ApplicationProperties.PdfEditor.Type3.Library library =
                mock(ApplicationProperties.PdfEditor.Type3.Library.class);
        when(props.getPdfEditor()).thenReturn(pdfEditor);
        when(pdfEditor.getType3()).thenReturn(type3);
        when(type3.getLibrary()).thenReturn(library);
        when(library.isEnabled()).thenReturn(true);
        return props;
    }

    private void invokePostConstruct(Type3LibraryStrategy strategy) throws Exception {
        java.lang.reflect.Method method =
                Type3LibraryStrategy.class.getDeclaredMethod("loadConfiguration");
        method.setAccessible(true);
        method.invoke(strategy);
    }
}
