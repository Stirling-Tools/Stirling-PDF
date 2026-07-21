package stirling.software.SPDF.service.pdfjson.type3.library;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.List;
import java.util.Map;

import org.apache.pdfbox.cos.COSDictionary;
import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.pdmodel.font.PDType3Font;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.mockito.MockedStatic;
import org.springframework.core.io.DefaultResourceLoader;
import org.springframework.core.io.Resource;
import org.springframework.core.io.ResourceLoader;

import stirling.software.SPDF.service.pdfjson.type3.Type3FontSignatureCalculator;
import stirling.software.common.model.ApplicationProperties;

import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.json.JsonMapper;

/**
 * Gap coverage for Type3FontLibrary - exercises initialise(), match() and the private payload /
 * resource / alias helpers via reflection and a real classpath resource loader.
 */
class Type3FontLibraryTest {

    private final ObjectMapper objectMapper = JsonMapper.builder().build();
    private final ResourceLoader resourceLoader = new DefaultResourceLoader();

    private Type3FontLibrary newLibrary(ResourceLoader loader, ApplicationProperties props) {
        return new Type3FontLibrary(objectMapper, loader, props);
    }

    private ApplicationProperties propsWithIndex(String indexLocation) {
        ApplicationProperties props = new ApplicationProperties();
        props.getPdfEditor().getType3().getLibrary().setIndex(indexLocation);
        return props;
    }

    private void invokeInitialise(Type3FontLibrary library) throws Exception {
        Method m = Type3FontLibrary.class.getDeclaredMethod("initialise");
        m.setAccessible(true);
        m.invoke(library);
    }

    private Object invoke(Type3FontLibrary library, String method, Class<?>[] sig, Object... args)
            throws Exception {
        Method m = Type3FontLibrary.class.getDeclaredMethod(method, sig);
        m.setAccessible(true);
        return m.invoke(library, args);
    }

    @Nested
    @DisplayName("initialise()")
    class Initialise {

        @Test
        @DisplayName("loads real classpath index.json and populates entries / indexes")
        void initialise_realIndex_loadsEntries() throws Exception {
            Type3FontLibrary library =
                    newLibrary(
                            new DefaultResourceLoader(),
                            propsWithIndex("classpath:/type3/library/index.json"));
            invokeInitialise(library);

            assertTrue(library.isLoaded());
        }

        @Test
        @DisplayName("missing index disables library")
        void initialise_missingIndex_disabled() throws Exception {
            Type3FontLibrary library =
                    newLibrary(
                            new DefaultResourceLoader(),
                            propsWithIndex("classpath:/type3/library/does-not-exist.json"));
            invokeInitialise(library);

            assertFalse(library.isLoaded());
        }

        @Test
        @DisplayName("null Type3 config disables library and logs warning")
        void initialise_nullConfig_disabled() throws Exception {
            ApplicationProperties props = mock(ApplicationProperties.class);
            ApplicationProperties.PdfEditor pdfEditor = mock(ApplicationProperties.PdfEditor.class);
            when(props.getPdfEditor()).thenReturn(pdfEditor);
            when(pdfEditor.getType3()).thenReturn(null);

            Type3FontLibrary library = newLibrary(new DefaultResourceLoader(), props);
            invokeInitialise(library);

            assertFalse(library.isLoaded());
        }

        @Test
        @DisplayName("null pdfEditor disables library")
        void initialise_nullPdfEditor_disabled() throws Exception {
            ApplicationProperties props = mock(ApplicationProperties.class);
            when(props.getPdfEditor()).thenReturn(null);

            Type3FontLibrary library = newLibrary(new DefaultResourceLoader(), props);
            invokeInitialise(library);

            assertFalse(library.isLoaded());
        }

        @Test
        @DisplayName("malformed JSON index surfaces a Jackson read exception")
        void initialise_malformedJson_throws() throws Exception {
            ResourceLoader loader = mock(ResourceLoader.class);
            Resource resource = mock(Resource.class);
            when(loader.getResource("classpath:/bad.json")).thenReturn(resource);
            when(resource.exists()).thenReturn(true);
            when(resource.getInputStream())
                    .thenReturn(
                            new ByteArrayInputStream("not json".getBytes(StandardCharsets.UTF_8)));

            Type3FontLibrary library = newLibrary(loader, propsWithIndex("classpath:/bad.json"));
            // Jackson 3 throws an unchecked StreamReadException which the IOException-only
            // catch in initialise() does not handle, so it propagates.
            java.lang.reflect.InvocationTargetException ex =
                    assertThrows(
                            java.lang.reflect.InvocationTargetException.class,
                            () -> invokeInitialise(library));
            assertNotNull(ex.getCause());
            assertFalse(library.isLoaded());
        }

        @Test
        @DisplayName("inline base64 program entry is loaded and indexed by signature + alias")
        void initialise_inlineBase64_loaded() throws Exception {
            String base64 = Base64.getEncoder().encodeToString(new byte[] {1, 2, 3, 4});
            String json =
                    "[{\"id\":\"e1\",\"label\":\"E1\","
                            + "\"signatures\":[\"sha256:ABCDEF\"],"
                            + "\"aliases\":[\"ABCDEF+MyFont\",\"  \",null],"
                            + "\"program\":{\"base64\":\""
                            + base64
                            + "\",\"format\":\"TTF\"},"
                            + "\"glyphCoverage\":[65,null,66]}]";
            ResourceLoader loader = mock(ResourceLoader.class);
            Resource resource = mock(Resource.class);
            when(loader.getResource("classpath:/inline.json")).thenReturn(resource);
            when(resource.exists()).thenReturn(true);
            when(resource.getInputStream())
                    .thenReturn(new ByteArrayInputStream(json.getBytes(StandardCharsets.UTF_8)));

            Type3FontLibrary library = newLibrary(loader, propsWithIndex("classpath:/inline.json"));
            invokeInitialise(library);

            assertTrue(library.isLoaded());
        }

        @Test
        @DisplayName("entry with no payload is filtered out")
        void initialise_noPayload_filtered() throws Exception {
            String json = "[{\"id\":\"empty\",\"label\":\"Empty\"}]";
            ResourceLoader loader = mock(ResourceLoader.class);
            Resource resource = mock(Resource.class);
            when(loader.getResource("classpath:/empty.json")).thenReturn(resource);
            when(resource.exists()).thenReturn(true);
            when(resource.getInputStream())
                    .thenReturn(new ByteArrayInputStream(json.getBytes(StandardCharsets.UTF_8)));

            Type3FontLibrary library = newLibrary(loader, propsWithIndex("classpath:/empty.json"));
            invokeInitialise(library);

            assertFalse(library.isLoaded());
        }

        @Test
        @DisplayName("entry with null id is skipped")
        void initialise_nullId_skipped() throws Exception {
            String base64 = Base64.getEncoder().encodeToString(new byte[] {9, 9, 9, 9});
            String json = "[{\"label\":\"NoId\",\"program\":{\"base64\":\"" + base64 + "\"}}]";
            ResourceLoader loader = mock(ResourceLoader.class);
            Resource resource = mock(Resource.class);
            when(loader.getResource("classpath:/noid.json")).thenReturn(resource);
            when(resource.exists()).thenReturn(true);
            when(resource.getInputStream())
                    .thenReturn(new ByteArrayInputStream(json.getBytes(StandardCharsets.UTF_8)));

            Type3FontLibrary library = newLibrary(loader, propsWithIndex("classpath:/noid.json"));
            invokeInitialise(library);

            assertFalse(library.isLoaded());
        }

        @Test
        @DisplayName("resource-based payload is read and re-encoded to base64")
        void initialise_resourcePayload_loaded() throws Exception {
            String json =
                    "[{\"id\":\"res\",\"label\":\"Res\","
                            + "\"program\":{\"resource\":\"type3/library/fonts/dejavu/DejaVuSans.ttf\","
                            + "\"format\":\"ttf\"}}]";
            ResourceLoader loader = new DefaultResourceLoader();
            Resource indexResource = mock(Resource.class);
            ResourceLoader spyLoader = spy(loader);
            when(spyLoader.getResource("classpath:/res.json")).thenReturn(indexResource);
            when(indexResource.exists()).thenReturn(true);
            when(indexResource.getInputStream())
                    .thenReturn(new ByteArrayInputStream(json.getBytes(StandardCharsets.UTF_8)));

            Type3FontLibrary library = newLibrary(spyLoader, propsWithIndex("classpath:/res.json"));
            invokeInitialise(library);

            assertTrue(library.isLoaded());
        }
    }

    @Nested
    @DisplayName("match()")
    class Match {

        @Test
        @DisplayName("returns null when font is null")
        void match_nullFont_returnsNull() throws Exception {
            Type3FontLibrary library =
                    newLibrary(
                            new DefaultResourceLoader(),
                            propsWithIndex("classpath:/type3/library/index.json"));
            invokeInitialise(library);
            assertNull(library.match(null, "uid"));
        }

        @Test
        @DisplayName("returns null when no entries loaded")
        void match_emptyLibrary_returnsNull() throws Exception {
            Type3FontLibrary library =
                    newLibrary(
                            new DefaultResourceLoader(),
                            propsWithIndex("classpath:/type3/library/does-not-exist.json"));
            invokeInitialise(library);
            PDType3Font font = mock(PDType3Font.class);
            assertNull(library.match(font, "uid"));
        }

        @Test
        @DisplayName("matches by signature using mocked signature calculator")
        void match_bySignature_returnsSignatureMatch() throws Exception {
            String base64 = Base64.getEncoder().encodeToString(new byte[] {1, 2, 3, 4});
            String json =
                    "[{\"id\":\"sig-entry\",\"label\":\"SigEntry\","
                            + "\"signatures\":[\"sha256:DEADBEEF\"],"
                            + "\"program\":{\"base64\":\""
                            + base64
                            + "\"}}]";
            Type3FontLibrary library = libraryFromJson("classpath:/sig.json", json);

            PDType3Font font = mock(PDType3Font.class);
            try (MockedStatic<Type3FontSignatureCalculator> mocked =
                    mockStatic(Type3FontSignatureCalculator.class)) {
                mocked.when(() -> Type3FontSignatureCalculator.computeSignature(font))
                        .thenReturn("sha256:deadbeef");

                Type3FontLibraryMatch match = library.match(font, "uid-1");
                assertNotNull(match);
                assertEquals("signature", match.getMatchType());
                assertEquals("sig-entry", match.getEntry().getId());
                assertEquals("sha256:deadbeef", match.getSignature());
            }
        }

        @Test
        @DisplayName("falls back to alias match on BaseFont name")
        void match_byAlias_returnsAliasMatch() throws Exception {
            String base64 = Base64.getEncoder().encodeToString(new byte[] {1, 2, 3, 4});
            String json =
                    "[{\"id\":\"alias-entry\",\"label\":\"AliasEntry\","
                            + "\"aliases\":[\"ABCDEF+CoolFont\"],"
                            + "\"program\":{\"base64\":\""
                            + base64
                            + "\"}}]";
            Type3FontLibrary library = libraryFromJson("classpath:/alias.json", json);

            PDType3Font font = mock(PDType3Font.class);
            when(font.getName()).thenReturn("XYZXYZ+CoolFont");

            try (MockedStatic<Type3FontSignatureCalculator> mocked =
                    mockStatic(Type3FontSignatureCalculator.class)) {
                mocked.when(() -> Type3FontSignatureCalculator.computeSignature(font))
                        .thenReturn(null);

                Type3FontLibraryMatch match = library.match(font, "uid-2");
                assertNotNull(match);
                assertThat(match.getMatchType()).startsWith("alias:");
                assertEquals("alias-entry", match.getEntry().getId());
            }
        }

        @Test
        @DisplayName("no signature and no alias match returns null")
        void match_noMatch_returnsNull() throws Exception {
            String base64 = Base64.getEncoder().encodeToString(new byte[] {1, 2, 3, 4});
            String json =
                    "[{\"id\":\"only\",\"label\":\"Only\","
                            + "\"signatures\":[\"sha256:1111\"],"
                            + "\"program\":{\"base64\":\""
                            + base64
                            + "\"}}]";
            Type3FontLibrary library = libraryFromJson("classpath:/nomatch.json", json);

            PDType3Font font = mock(PDType3Font.class);
            when(font.getName()).thenReturn("Unrelated");

            try (MockedStatic<Type3FontSignatureCalculator> mocked =
                    mockStatic(Type3FontSignatureCalculator.class)) {
                mocked.when(() -> Type3FontSignatureCalculator.computeSignature(font))
                        .thenReturn("sha256:9999");

                assertNull(library.match(font, "uid-3"));
            }
        }

        @Test
        @DisplayName("alias resolution falls back to COS BASE_FONT when getName throws")
        void match_baseFontFromCos_whenGetNameThrows() throws Exception {
            String base64 = Base64.getEncoder().encodeToString(new byte[] {1, 2, 3, 4});
            String json =
                    "[{\"id\":\"cos-entry\",\"label\":\"CosEntry\","
                            + "\"aliases\":[\"CosFont\"],"
                            + "\"program\":{\"base64\":\""
                            + base64
                            + "\"}}]";
            Type3FontLibrary library = libraryFromJson("classpath:/cos.json", json);

            PDType3Font font = mock(PDType3Font.class);
            when(font.getName()).thenThrow(new RuntimeException("boom"));
            COSDictionary cos = new COSDictionary();
            cos.setName(COSName.BASE_FONT, "CosFont");
            when(font.getCOSObject()).thenReturn(cos);

            try (MockedStatic<Type3FontSignatureCalculator> mocked =
                    mockStatic(Type3FontSignatureCalculator.class)) {
                mocked.when(() -> Type3FontSignatureCalculator.computeSignature(font))
                        .thenReturn(null);

                Type3FontLibraryMatch match = library.match(font, "uid-4");
                assertNotNull(match);
                assertEquals("cos-entry", match.getEntry().getId());
            }
        }
    }

    @Nested
    @DisplayName("private helpers")
    class Helpers {

        private Type3FontLibrary library() {
            return newLibrary(new DefaultResourceLoader(), new ApplicationProperties());
        }

        @Test
        @DisplayName("normalizeAlias strips subset prefix and lowercases")
        void normalizeAlias_stripsPrefix() throws Exception {
            Type3FontLibrary lib = library();
            assertEquals(
                    "myfont",
                    invoke(lib, "normalizeAlias", new Class<?>[] {String.class}, "ABCDEF+MyFont"));
            assertEquals(
                    "plainname",
                    invoke(lib, "normalizeAlias", new Class<?>[] {String.class}, " PlainName "));
            assertNull(invoke(lib, "normalizeAlias", new Class<?>[] {String.class}, (Object) null));
            assertNull(invoke(lib, "normalizeAlias", new Class<?>[] {String.class}, "   "));
            // Trailing plus keeps original since plus is at end
            assertEquals(
                    "name+", invoke(lib, "normalizeAlias", new Class<?>[] {String.class}, "Name+"));
        }

        @Test
        @DisplayName("normalizeFormat trims and lowercases, null stays null")
        void normalizeFormat() throws Exception {
            Type3FontLibrary lib = library();
            assertEquals(
                    "ttf", invoke(lib, "normalizeFormat", new Class<?>[] {String.class}, "  TTF "));
            assertNull(
                    invoke(lib, "normalizeFormat", new Class<?>[] {String.class}, (Object) null));
        }

        @Test
        @DisplayName("resolveLocation adds classpath prefix appropriately")
        void resolveLocation() throws Exception {
            Type3FontLibrary lib = library();
            assertEquals(
                    "classpath:/a/b.ttf",
                    invoke(lib, "resolveLocation", new Class<?>[] {String.class}, "a/b.ttf"));
            assertEquals(
                    "classpath:/abs.ttf",
                    invoke(lib, "resolveLocation", new Class<?>[] {String.class}, "/abs.ttf"));
            assertEquals(
                    "file:/x.ttf",
                    invoke(lib, "resolveLocation", new Class<?>[] {String.class}, "file:/x.ttf"));
            assertNull(
                    invoke(lib, "resolveLocation", new Class<?>[] {String.class}, (Object) null));
        }

        @SuppressWarnings("unchecked")
        @Test
        @DisplayName("normalizeList trims, drops null/blank entries")
        void normalizeList() throws Exception {
            Type3FontLibrary lib = library();
            List<String> in = java.util.Arrays.asList(" a ", null, "", "b");
            List<String> out =
                    (List<String>) invoke(lib, "normalizeList", new Class<?>[] {List.class}, in);
            assertEquals(List.of("a", "b"), out);

            List<String> empty =
                    (List<String>)
                            invoke(
                                    lib,
                                    "normalizeList",
                                    new Class<?>[] {List.class},
                                    (Object) null);
            assertTrue(empty.isEmpty());
        }

        @Test
        @DisplayName("loadResourceBytes throws for null / missing resource")
        void loadResourceBytes_errors() throws Exception {
            Type3FontLibrary lib = library();
            Method m = Type3FontLibrary.class.getDeclaredMethod("loadResourceBytes", String.class);
            m.setAccessible(true);

            java.lang.reflect.InvocationTargetException ex1 =
                    assertThrows(
                            java.lang.reflect.InvocationTargetException.class,
                            () -> m.invoke(lib, (Object) null));
            assertInstanceOf(IOException.class, ex1.getCause());

            java.lang.reflect.InvocationTargetException ex2 =
                    assertThrows(
                            java.lang.reflect.InvocationTargetException.class,
                            () -> m.invoke(lib, "type3/library/missing-font.ttf"));
            assertInstanceOf(IOException.class, ex2.getCause());
        }
    }

    private Type3FontLibrary libraryFromJson(String location, String json) throws Exception {
        ResourceLoader loader = mock(ResourceLoader.class);
        Resource resource = mock(Resource.class);
        when(loader.getResource(location)).thenReturn(resource);
        when(resource.exists()).thenReturn(true);
        when(resource.getInputStream())
                .thenReturn(new ByteArrayInputStream(json.getBytes(StandardCharsets.UTF_8)));
        Type3FontLibrary library = newLibrary(loader, propsWithIndex(location));
        invokeInitialise(library);
        return library;
    }

    @BeforeEach
    void resetState() {
        // no shared state
    }

    @Nested
    @DisplayName("payload edge cases")
    class PayloadEdges {

        @SuppressWarnings("unused")
        @Test
        @DisplayName("invalid base64 payload yields null payload (entry filtered)")
        void invalidBase64_filtered() throws Exception {
            // '@' is not valid base64 in the 4-char probe prefix
            String json =
                    "[{\"id\":\"badb64\",\"label\":\"Bad\","
                            + "\"program\":{\"base64\":\"@@@@invalid\"}}]";
            Type3FontLibrary library = libraryFromJson("classpath:/badb64.json", json);
            assertFalse(library.isLoaded());
        }

        @Test
        @DisplayName("internal index maps are populated for loaded entry")
        void internalMaps_populated() throws Exception {
            String base64 = Base64.getEncoder().encodeToString(new byte[] {1, 2, 3, 4});
            String json =
                    "[{\"id\":\"mapcheck\",\"label\":\"MapCheck\","
                            + "\"signatures\":[\"sha256:CAFE\"],"
                            + "\"aliases\":[\"MapAlias\"],"
                            + "\"program\":{\"base64\":\""
                            + base64
                            + "\"}}]";
            Type3FontLibrary library = libraryFromJson("classpath:/mapcheck.json", json);

            Field sigIndex = Type3FontLibrary.class.getDeclaredField("signatureIndex");
            sigIndex.setAccessible(true);
            Field aliasIndex = Type3FontLibrary.class.getDeclaredField("aliasIndex");
            aliasIndex.setAccessible(true);

            @SuppressWarnings("unchecked")
            Map<String, ?> sigs = (Map<String, ?>) sigIndex.get(library);
            @SuppressWarnings("unchecked")
            Map<String, ?> aliases = (Map<String, ?>) aliasIndex.get(library);
            assertThat(sigs).containsKey("sha256:cafe");
            assertThat(aliases).containsKey("mapalias");
        }
    }
}
