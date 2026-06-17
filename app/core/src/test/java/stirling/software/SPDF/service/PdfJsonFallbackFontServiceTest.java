package stirling.software.SPDF.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.io.IOException;
import java.lang.reflect.Method;
import java.util.Base64;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.font.PDFont;
import org.apache.pdfbox.pdmodel.font.PDType0Font;
import org.apache.pdfbox.pdmodel.font.PDType3Font;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.DefaultResourceLoader;
import org.springframework.core.io.ResourceLoader;
import org.springframework.test.util.ReflectionTestUtils;

import stirling.software.SPDF.model.json.PdfJsonFont;
import stirling.software.common.model.ApplicationProperties;

class PdfJsonFallbackFontServiceTest {

    private PdfJsonFallbackFontService service;
    private ApplicationProperties applicationProperties;

    // Parsing the real fallback TrueType fonts (the CJK font alone is ~17 MB) is the only expensive
    // work in this class. Build a default-config service and parse the CJK fallback once, then
    // reuse
    // them across every read-only test instead of re-parsing per @BeforeEach.
    private static PdfJsonFallbackFontService sharedService;
    private static PDDocument sharedCjkDocument;
    private static PDFont sharedCjkFont;

    @BeforeAll
    static void setUpShared() throws Exception {
        // Real ApplicationProperties already defaults pdfEditor.fallbackFont to the Noto Sans
        // location, so no mocking is needed for the default-config path.
        ResourceLoader resourceLoader = new DefaultResourceLoader();
        ApplicationProperties props = new ApplicationProperties();
        sharedService = new PdfJsonFallbackFontService(resourceLoader, props);
        ReflectionTestUtils.setField(
                sharedService,
                "legacyFallbackFontLocation",
                PdfJsonFallbackFontService.DEFAULT_FALLBACK_FONT_LOCATION);
        Method loadConfig = PdfJsonFallbackFontService.class.getDeclaredMethod("loadConfig");
        loadConfig.setAccessible(true);
        loadConfig.invoke(sharedService);

        // Parse the large CJK fallback exactly once; the CanEncode tests only read this font.
        sharedCjkDocument = new PDDocument();
        sharedCjkFont =
                sharedService.loadFallbackPdfFont(
                        sharedCjkDocument, PdfJsonFallbackFontService.FALLBACK_FONT_CJK_ID);
    }

    @AfterAll
    static void tearDownShared() throws IOException {
        if (sharedCjkDocument != null) {
            sharedCjkDocument.close();
        }
    }

    @BeforeEach
    void setUp() {
        // Real resource loader resolves the classpath:/static/fonts/*.ttf bundled in the module.
        ResourceLoader resourceLoader = new DefaultResourceLoader();

        // Mock the properties chain so loadConfig() resolves to the default Noto Sans location.
        applicationProperties = mock(ApplicationProperties.class);
        ApplicationProperties.PdfEditor pdfEditor = mock(ApplicationProperties.PdfEditor.class);
        lenient().when(applicationProperties.getPdfEditor()).thenReturn(pdfEditor);
        lenient()
                .when(pdfEditor.getFallbackFont())
                .thenReturn(PdfJsonFallbackFontService.DEFAULT_FALLBACK_FONT_LOCATION);

        service = new PdfJsonFallbackFontService(resourceLoader, applicationProperties);
        // The @Value field is normally injected by Spring; set it explicitly for the unit test.
        ReflectionTestUtils.setField(
                service,
                "legacyFallbackFontLocation",
                PdfJsonFallbackFontService.DEFAULT_FALLBACK_FONT_LOCATION);
    }

    /** Invoke the private @PostConstruct loadConfig() to populate fallbackFontLocation. */
    private void invokeLoadConfig() throws Exception {
        Method loadConfig = PdfJsonFallbackFontService.class.getDeclaredMethod("loadConfig");
        loadConfig.setAccessible(true);
        loadConfig.invoke(service);
    }

    @Nested
    @DisplayName("loadConfig (@PostConstruct)")
    class LoadConfig {

        @Test
        @DisplayName("uses the configured pdf-editor fallback font when set")
        void usesConfiguredFallbackFont() throws Exception {
            when(applicationProperties.getPdfEditor().getFallbackFont())
                    .thenReturn("classpath:/static/fonts/DejaVuSans.ttf");

            invokeLoadConfig();

            assertEquals(
                    "classpath:/static/fonts/DejaVuSans.ttf",
                    ReflectionTestUtils.getField(service, "fallbackFontLocation"));
        }

        @Test
        @DisplayName("falls back to the legacy @Value location when configured value is blank")
        void fallsBackToLegacyWhenBlank() throws Exception {
            when(applicationProperties.getPdfEditor().getFallbackFont()).thenReturn("   ");

            invokeLoadConfig();

            assertEquals(
                    PdfJsonFallbackFontService.DEFAULT_FALLBACK_FONT_LOCATION,
                    ReflectionTestUtils.getField(service, "fallbackFontLocation"));
        }

        @Test
        @DisplayName("falls back to the legacy @Value location when PdfEditor is null")
        void fallsBackToLegacyWhenPdfEditorNull() throws Exception {
            when(applicationProperties.getPdfEditor()).thenReturn(null);

            invokeLoadConfig();

            assertEquals(
                    PdfJsonFallbackFontService.DEFAULT_FALLBACK_FONT_LOCATION,
                    ReflectionTestUtils.getField(service, "fallbackFontLocation"));
        }
    }

    @Nested
    @DisplayName("resolveFallbackFontId(int codePoint)")
    class ResolveByCodePoint {

        @Test
        @DisplayName("Latin letters resolve to the generic Noto Sans fallback")
        void latinResolvesToNotoSans() {
            assertEquals(
                    PdfJsonFallbackFontService.FALLBACK_FONT_ID,
                    service.resolveFallbackFontId('A'));
        }

        @Test
        @DisplayName("CJK unified ideographs resolve to the CJK fallback")
        void cjkIdeographResolvesToCjk() {
            // U+4E2D (中) is a CJK Unified Ideograph.
            assertEquals(
                    PdfJsonFallbackFontService.FALLBACK_FONT_CJK_ID,
                    service.resolveFallbackFontId(0x4E2D));
        }

        @Test
        @DisplayName("Bopomofo resolves to the Traditional Chinese fallback")
        void bopomofoResolvesToTc() {
            // U+3105 (ㄅ) is in the Bopomofo block.
            assertEquals(
                    PdfJsonFallbackFontService.FALLBACK_FONT_TC_ID,
                    service.resolveFallbackFontId(0x3105));
        }

        @Test
        @DisplayName("CJK compatibility ideographs resolve to the Traditional Chinese fallback")
        void compatibilityIdeographResolvesToTc() {
            // U+F900 is in the CJK Compatibility Ideographs block.
            assertEquals(
                    PdfJsonFallbackFontService.FALLBACK_FONT_TC_ID,
                    service.resolveFallbackFontId(0xF900));
        }

        @Test
        @DisplayName("Hiragana resolves to the Japanese fallback")
        void hiraganaResolvesToJp() {
            // U+3042 (あ) is Hiragana.
            assertEquals(
                    PdfJsonFallbackFontService.FALLBACK_FONT_JP_ID,
                    service.resolveFallbackFontId(0x3042));
        }

        @Test
        @DisplayName("Hangul resolves to the Korean fallback")
        void hangulResolvesToKr() {
            // U+AC00 (가) is a Hangul syllable.
            assertEquals(
                    PdfJsonFallbackFontService.FALLBACK_FONT_KR_ID,
                    service.resolveFallbackFontId(0xAC00));
        }

        @Test
        @DisplayName("Arabic resolves to the Arabic fallback")
        void arabicResolvesToAr() {
            // U+0627 (ا) is Arabic.
            assertEquals(
                    PdfJsonFallbackFontService.FALLBACK_FONT_AR_ID,
                    service.resolveFallbackFontId(0x0627));
        }

        @Test
        @DisplayName("Thai resolves to the Thai fallback")
        void thaiResolvesToTh() {
            // U+0E01 (ก) is Thai.
            assertEquals(
                    PdfJsonFallbackFontService.FALLBACK_FONT_TH_ID,
                    service.resolveFallbackFontId(0x0E01));
        }

        @Test
        @DisplayName("Devanagari resolves to the Devanagari fallback")
        void devanagariResolves() {
            // U+0905 (अ) is Devanagari.
            assertEquals(
                    PdfJsonFallbackFontService.FALLBACK_FONT_DEVANAGARI_ID,
                    service.resolveFallbackFontId(0x0905));
        }

        @Test
        @DisplayName("Malayalam resolves to the Malayalam fallback")
        void malayalamResolves() {
            // U+0D05 (അ) is Malayalam.
            assertEquals(
                    PdfJsonFallbackFontService.FALLBACK_FONT_MALAYALAM_ID,
                    service.resolveFallbackFontId(0x0D05));
        }

        @Test
        @DisplayName("Tibetan resolves to the Tibetan fallback")
        void tibetanResolves() {
            // U+0F40 (ཀ) is Tibetan.
            assertEquals(
                    PdfJsonFallbackFontService.FALLBACK_FONT_TIBETAN_ID,
                    service.resolveFallbackFontId(0x0F40));
        }
    }

    @Nested
    @DisplayName("resolveFallbackFontId(String fontName, int codePoint)")
    class ResolveByNameAndCodePoint {

        @Test
        @DisplayName("Arial maps to Liberation Sans")
        void arialMapsToLiberationSans() {
            assertEquals("fallback-liberation-sans", service.resolveFallbackFontId("Arial", 'A'));
        }

        @Test
        @DisplayName("Times New Roman maps to Liberation Serif")
        void timesNewRomanMapsToLiberationSerif() {
            // Spaces are stripped: "Times New Roman" -> "timesnewroman".
            assertEquals(
                    "fallback-liberation-serif",
                    service.resolveFallbackFontId("Times New Roman", 'A'));
        }

        @Test
        @DisplayName("Courier New maps to Liberation Mono")
        void courierNewMapsToLiberationMono() {
            assertEquals(
                    "fallback-liberation-mono", service.resolveFallbackFontId("Courier New", 'A'));
        }

        @Test
        @DisplayName("Arial-Bold maps to bold Liberation Sans variant")
        void arialBoldMapsToBoldVariant() {
            assertEquals(
                    "fallback-liberation-sans-bold",
                    service.resolveFallbackFontId("Arial-Bold", 'A'));
        }

        @Test
        @DisplayName("Arial-Italic maps to italic Liberation Sans variant")
        void arialItalicMapsToItalicVariant() {
            assertEquals(
                    "fallback-liberation-sans-italic",
                    service.resolveFallbackFontId("Arial-Italic", 'A'));
        }

        @Test
        @DisplayName("Arial-BoldItalic maps to bold-italic Liberation Sans variant")
        void arialBoldItalicMapsToBoldItalicVariant() {
            assertEquals(
                    "fallback-liberation-sans-bolditalic",
                    service.resolveFallbackFontId("Arial-BoldItalic", 'A'));
        }

        @Test
        @DisplayName("numeric weight 700 is detected as bold")
        void numericWeightDetectedAsBold() {
            // "Arimo_700wght" -> base "arimo" -> liberation-sans, bold via 700 weight pattern.
            assertEquals(
                    "fallback-liberation-sans-bold",
                    service.resolveFallbackFontId("Arimo_700wght", 'A'));
        }

        @Test
        @DisplayName("subset prefix is stripped before alias matching")
        void subsetPrefixStripped() {
            // "ABCDEF+Arial" -> subset prefix removed -> "arial".
            assertEquals(
                    "fallback-liberation-sans", service.resolveFallbackFontId("ABCDEF+Arial", 'A'));
        }

        @Test
        @DisplayName("DejaVu Sans bold-italic uses the 'oblique' naming convention")
        void dejaVuUsesObliqueNaming() {
            assertEquals(
                    "fallback-dejavu-sans-boldoblique",
                    service.resolveFallbackFontId("DejaVuSans-BoldItalic", 'A'));
        }

        @Test
        @DisplayName("DejaVu Serif italic keeps the 'italic' naming convention")
        void dejaVuSerifKeepsItalicNaming() {
            assertEquals(
                    "fallback-dejavu-serif-italic",
                    service.resolveFallbackFontId("DejaVuSerif-Italic", 'A'));
        }

        @Test
        @DisplayName("Traditional Chinese aliased name ignores weight/style suffix (unsupported)")
        void tcAliasIgnoresWeightStyle() {
            // MingLiU maps to fallback-noto-tc, which has no bold variant registered.
            assertEquals(
                    PdfJsonFallbackFontService.FALLBACK_FONT_TC_ID,
                    service.resolveFallbackFontId("MingLiU-Bold", 'A'));
        }

        @Test
        @DisplayName("Simplified Chinese aliased name maps to the CJK fallback")
        void simsunMapsToCjk() {
            assertEquals(
                    PdfJsonFallbackFontService.FALLBACK_FONT_CJK_ID,
                    service.resolveFallbackFontId("SimSun", 'A'));
        }

        @Test
        @DisplayName("null font name falls through to Unicode-based resolution")
        void nullNameFallsThroughToUnicode() {
            assertEquals(
                    PdfJsonFallbackFontService.FALLBACK_FONT_ID,
                    service.resolveFallbackFontId(null, 'A'));
        }

        @Test
        @DisplayName("empty font name falls through to Unicode-based resolution")
        void emptyNameFallsThroughToUnicode() {
            assertEquals(
                    PdfJsonFallbackFontService.FALLBACK_FONT_CJK_ID,
                    service.resolveFallbackFontId("", 0x4E2D));
        }

        @Test
        @DisplayName("unknown font name falls through to Unicode-based resolution")
        void unknownNameFallsThroughToUnicode() {
            assertEquals(
                    PdfJsonFallbackFontService.FALLBACK_FONT_JP_ID,
                    service.resolveFallbackFontId("SomeCustomFont", 0x3042));
        }
    }

    @Nested
    @DisplayName("mapUnsupportedGlyph(int codePoint)")
    class MapUnsupportedGlyph {

        @Test
        @DisplayName("U+276E maps to '<'")
        void heavyLeftAngleMapsToLessThan() {
            assertEquals("<", service.mapUnsupportedGlyph(0x276E));
        }

        @Test
        @DisplayName("U+276F maps to '>'")
        void heavyRightAngleMapsToGreaterThan() {
            assertEquals(">", service.mapUnsupportedGlyph(0x276F));
        }

        @Test
        @DisplayName("unmapped code point returns null")
        void unmappedReturnsNull() {
            assertNull(service.mapUnsupportedGlyph('A'));
        }
    }

    @Nested
    @DisplayName("canEncode / canEncodeFully")
    class CanEncode {

        @Test
        @DisplayName("null font returns false")
        void nullFontReturnsFalse() {
            assertFalse(service.canEncode((PDFont) null, "A"));
        }

        @Test
        @DisplayName("null text returns false")
        void nullTextReturnsFalse() {
            // Reuse the once-parsed CJK fallback; canEncode only reads the font.
            assertFalse(sharedService.canEncode(sharedCjkFont, (String) null));
        }

        @Test
        @DisplayName("empty text returns false")
        void emptyTextReturnsFalse() {
            assertFalse(sharedService.canEncode(sharedCjkFont, ""));
        }

        @Test
        @DisplayName("PDType3Font always returns false")
        void type3FontReturnsFalse() {
            PDType3Font type3 = mock(PDType3Font.class);
            assertFalse(service.canEncode(type3, "A"));
        }

        @Test
        @DisplayName("loaded TrueType fallback can encode basic Latin")
        void loadedFontEncodesLatin() {
            assertTrue(sharedService.canEncode(sharedCjkFont, "Hello"));
        }

        @Test
        @DisplayName("canEncodeFully delegates to canEncode for text")
        void canEncodeFullyDelegates() {
            assertTrue(sharedService.canEncodeFully(sharedCjkFont, "abc"));
            assertFalse(sharedService.canEncodeFully(null, "abc"));
        }

        @Test
        @DisplayName("canEncode(font, codePoint) returns true for an encodable code point")
        void canEncodeCodePointTrue() {
            assertTrue(sharedService.canEncode(sharedCjkFont, (int) 'A'));
        }

        @Test
        @DisplayName("canEncode(font, codePoint) returns false for a null font")
        void canEncodeCodePointNullFont() {
            assertFalse(service.canEncode((PDFont) null, (int) 'A'));
        }
    }

    @Nested
    @DisplayName("buildFallbackFontModel")
    class BuildFallbackFontModel {

        @Test
        @DisplayName("builds a model for a built-in CJK font with base64 program bytes")
        void buildsCjkModel() throws IOException {
            PdfJsonFont model =
                    service.buildFallbackFontModel(PdfJsonFallbackFontService.FALLBACK_FONT_CJK_ID);

            assertNotNull(model);
            assertEquals(PdfJsonFallbackFontService.FALLBACK_FONT_CJK_ID, model.getId());
            assertEquals(PdfJsonFallbackFontService.FALLBACK_FONT_CJK_ID, model.getUid());
            assertEquals("NotoSansSC-Regular", model.getBaseName());
            assertEquals("TrueType", model.getSubtype());
            assertEquals(Boolean.TRUE, model.getEmbedded());
            assertEquals("ttf", model.getProgramFormat());
            assertNotNull(model.getProgram());
            // The program must be valid, non-empty base64.
            byte[] decoded = Base64.getDecoder().decode(model.getProgram());
            assertTrue(decoded.length > 0);
        }

        @Test
        @DisplayName("no-arg overload builds the default Noto Sans model")
        void noArgBuildsDefaultModel() throws Exception {
            invokeLoadConfig(); // populate fallbackFontLocation for the default font id
            PdfJsonFont model = service.buildFallbackFontModel();

            assertNotNull(model);
            assertEquals(PdfJsonFallbackFontService.FALLBACK_FONT_ID, model.getId());
            assertEquals("NotoSans-Regular", model.getBaseName());
            assertEquals("ttf", model.getProgramFormat());
            assertNotNull(model.getProgram());
        }

        @Test
        @DisplayName("unknown fallback id throws IOException")
        void unknownIdThrows() {
            IOException ex =
                    assertThrows(
                            IOException.class,
                            () -> service.buildFallbackFontModel("does-not-exist"));
            assertTrue(ex.getMessage().contains("Unknown fallback font id"));
        }

        @Test
        @DisplayName("font bytes are cached and reused across calls")
        void fontBytesAreCached() throws IOException {
            PdfJsonFont first =
                    service.buildFallbackFontModel(PdfJsonFallbackFontService.FALLBACK_FONT_TH_ID);
            PdfJsonFont second =
                    service.buildFallbackFontModel(PdfJsonFallbackFontService.FALLBACK_FONT_TH_ID);
            // Same cached bytes -> identical base64 program payload.
            assertEquals(first.getProgram(), second.getProgram());
        }
    }

    @Nested
    @DisplayName("loadFallbackPdfFont")
    class LoadFallbackPdfFont {

        @Test
        @DisplayName("loads a Type0 PDFont for a built-in fallback id")
        void loadsType0Font() throws IOException {
            try (PDDocument document = new PDDocument()) {
                PDFont font =
                        service.loadFallbackPdfFont(
                                document, PdfJsonFallbackFontService.FALLBACK_FONT_AR_ID);
                assertNotNull(font);
                assertTrue(font instanceof PDType0Font);
            }
        }

        @Test
        @DisplayName("no-arg overload loads the default Noto Sans font")
        void noArgLoadsDefaultFont() throws Exception {
            invokeLoadConfig();
            try (PDDocument document = new PDDocument()) {
                PDFont font = service.loadFallbackPdfFont(document);
                assertNotNull(font);
                assertTrue(font instanceof PDType0Font);
            }
        }

        @Test
        @DisplayName("unknown fallback id throws IOException")
        void unknownIdThrows() throws IOException {
            try (PDDocument document = new PDDocument()) {
                IOException ex =
                        assertThrows(
                                IOException.class,
                                () -> service.loadFallbackPdfFont(document, "nope"));
                assertTrue(ex.getMessage().contains("Unknown fallback font id"));
            }
        }

        @Test
        @DisplayName("loaded font produces fresh instances per call but identical type")
        void distinctInstancesPerCall() throws IOException {
            // Instance-identity contract holds for any built-in font; use the tiny Thai fallback
            // (~22 KB) instead of the multi-MB Korean font to keep two loads cheap.
            try (PDDocument document = new PDDocument()) {
                PDFont a =
                        service.loadFallbackPdfFont(
                                document, PdfJsonFallbackFontService.FALLBACK_FONT_TH_ID);
                PDFont b =
                        service.loadFallbackPdfFont(
                                document, PdfJsonFallbackFontService.FALLBACK_FONT_TH_ID);
                assertNotNull(a);
                assertNotNull(b);
                // Two independent PDType0Font wrappers loaded into the same document.
                assertFalse(a == b);
                assertSame(a.getClass(), b.getClass());
            }
        }
    }
}
