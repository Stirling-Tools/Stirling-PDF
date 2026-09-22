package stirling.software.SPDF.config;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.RETURNS_DEEP_STUBS;
import static org.mockito.Mockito.atLeastOnce;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.web.servlet.config.annotation.CorsRegistration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.InterceptorRegistration;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistration;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.resource.HttpResource;
import org.springframework.web.servlet.resource.ResourceResolverChain;

import jakarta.servlet.http.HttpServletRequest;

import stirling.software.common.model.ApplicationProperties;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
@DisplayName("WebMvcConfig")
class WebMvcConfigTest {

    private static final String TAURI_PROP = "STIRLING_PDF_TAURI_MODE";

    @Mock private EndpointInterceptor endpointInterceptor;
    @Mock private PdfMetricsInterceptor pdfMetricsInterceptor;
    @Mock private ApplicationProperties applicationProperties;
    @Mock private ApplicationProperties.System system;

    private WebMvcConfig config;
    private String originalTauriProp;

    @BeforeEach
    void setUp() {
        originalTauriProp = System.getProperty(TAURI_PROP);
        System.clearProperty(TAURI_PROP);
        config =
                new WebMvcConfig(endpointInterceptor, pdfMetricsInterceptor, applicationProperties);
    }

    @AfterEach
    void tearDown() {
        if (originalTauriProp == null) {
            System.clearProperty(TAURI_PROP);
        } else {
            System.setProperty(TAURI_PROP, originalTauriProp);
        }
    }

    @Nested
    @DisplayName("addInterceptors")
    class AddInterceptors {

        @Test
        @DisplayName("registers both interceptors in order")
        void registersBothInterceptors() {
            InterceptorRegistry registry = mock(InterceptorRegistry.class);
            InterceptorRegistration registration = mock(InterceptorRegistration.class);
            when(registry.addInterceptor(any())).thenReturn(registration);

            config.addInterceptors(registry);

            verify(registry).addInterceptor(endpointInterceptor);
            verify(registry).addInterceptor(pdfMetricsInterceptor);
        }
    }

    @Nested
    @DisplayName("addResourceHandlers")
    class AddResourceHandlers {

        @Test
        @DisplayName("registers all five resource handler groups")
        void registersFiveHandlerGroups() {
            ResourceHandlerRegistry registry = mock(ResourceHandlerRegistry.class);
            ResourceHandlerRegistration registration =
                    mock(ResourceHandlerRegistration.class, RETURNS_DEEP_STUBS);
            when(registry.addResourceHandler(any(String[].class))).thenReturn(registration);

            config.addResourceHandlers(registry);

            // SW/PWA, assets, media+fonts, branding, catch-all = 5 handler registrations.
            verify(registry, times(5)).addResourceHandler(any(String[].class));
        }

        @Test
        @DisplayName("includes the SPA catch-all and assets patterns")
        void includesKnownPatterns() {
            ResourceHandlerRegistry registry = mock(ResourceHandlerRegistry.class);
            ResourceHandlerRegistration registration =
                    mock(ResourceHandlerRegistration.class, RETURNS_DEEP_STUBS);
            when(registry.addResourceHandler(any(String[].class))).thenReturn(registration);

            config.addResourceHandlers(registry);

            ArgumentCaptor<String[]> captor = ArgumentCaptor.forClass(String[].class);
            verify(registry, atLeastOnce()).addResourceHandler(captor.capture());
            List<String> allPatterns =
                    captor.getAllValues().stream().flatMap(java.util.Arrays::stream).toList();
            assertThat(allPatterns).contains("/**", "/assets/**", "/sw.js");
        }

        @Test
        @DisplayName("serves fonts as immutable for a year so fallback faces cache")
        void fontsAreImmutable() {
            ResourceHandlerRegistry registry = mock(ResourceHandlerRegistry.class);
            ResourceHandlerRegistration sw =
                    mock(ResourceHandlerRegistration.class, RETURNS_DEEP_STUBS);
            ResourceHandlerRegistration assets =
                    mock(ResourceHandlerRegistration.class, RETURNS_DEEP_STUBS);
            ResourceHandlerRegistration media =
                    mock(ResourceHandlerRegistration.class, RETURNS_DEEP_STUBS);
            ResourceHandlerRegistration branding =
                    mock(ResourceHandlerRegistration.class, RETURNS_DEEP_STUBS);
            ResourceHandlerRegistration catchAll =
                    mock(ResourceHandlerRegistration.class, RETURNS_DEEP_STUBS);
            when(registry.addResourceHandler(any(String[].class)))
                    .thenReturn(sw, assets, media, branding, catchAll);
            // addResourceLocations is the chain link before setCacheControl.
            when(sw.addResourceLocations(any(String[].class))).thenReturn(sw);
            when(assets.addResourceLocations(any(String[].class))).thenReturn(assets);
            when(media.addResourceLocations(any(String[].class))).thenReturn(media);
            when(branding.addResourceLocations(any(String[].class))).thenReturn(branding);
            when(catchAll.addResourceLocations(any(String[].class))).thenReturn(catchAll);

            config.addResourceHandlers(registry);

            // Third registration is the media/fonts group; its cache tier is what
            // keeps a 17 MB CJK fallback face from being re-fetched on every
            // viewer open.
            ArgumentCaptor<String[]> patterns = ArgumentCaptor.forClass(String[].class);
            verify(registry, times(5)).addResourceHandler(patterns.capture());
            assertThat(patterns.getAllValues().get(2)).contains("/fonts/**");

            ArgumentCaptor<CacheControl> caches = ArgumentCaptor.forClass(CacheControl.class);
            verify(media).setCacheControl(caches.capture());
            String header = caches.getValue().getHeaderValue();
            assertThat(header).contains("max-age=31536000").contains("immutable");
        }
    }

    @Nested
    @DisplayName("addCorsMappings")
    class AddCorsMappings {

        private CorsRegistry registry;
        private CorsRegistration registration;

        @BeforeEach
        void initRegistry() {
            registry = mock(CorsRegistry.class);
            registration = mock(CorsRegistration.class, RETURNS_DEEP_STUBS);
            when(registry.addMapping(anyString())).thenReturn(registration);
        }

        @Test
        @DisplayName("Tauri mode adds a mapping with Tauri origin patterns")
        void tauriModeBranch() {
            System.setProperty(TAURI_PROP, "true");
            // hasConfiguredOrigins is evaluated before the Tauri check, so getSystem() is
            // consulted.
            when(applicationProperties.getSystem()).thenReturn(system);
            when(system.getCorsAllowedOrigins()).thenReturn(List.of());

            config.addCorsMappings(registry);

            verify(registry).addMapping("/**");
        }

        @Test
        @DisplayName("uses configured origins and appends Tauri origins when present")
        void configuredOriginsBranch() {
            when(applicationProperties.getSystem()).thenReturn(system);
            when(system.getCorsAllowedOrigins())
                    .thenReturn(new java.util.ArrayList<>(List.of("https://app.example.com")));

            config.addCorsMappings(registry);

            verify(registry).addMapping("/**");
            // origins consulted twice (presence check + value use)
            verify(system, atLeastOnce()).getCorsAllowedOrigins();
        }

        @Test
        @DisplayName("configured origins keep an already-present Tauri origin unduplicated")
        void configuredOriginsAlreadyContainTauri() {
            when(applicationProperties.getSystem()).thenReturn(system);
            when(system.getCorsAllowedOrigins())
                    .thenReturn(
                            new java.util.ArrayList<>(
                                    List.of(
                                            "tauri://localhost",
                                            "http://tauri.localhost",
                                            "https://tauri.localhost")));

            config.addCorsMappings(registry);

            verify(registry).addMapping("/**");
        }

        @Test
        @DisplayName("default branch allows all origins when nothing configured")
        void defaultBranchAllowsAll() {
            when(applicationProperties.getSystem()).thenReturn(system);
            when(system.getCorsAllowedOrigins()).thenReturn(List.of());

            config.addCorsMappings(registry);

            verify(registry).addMapping("/**");
        }

        @Test
        @DisplayName("default branch also triggers when system is null")
        void defaultBranchWhenSystemNull() {
            lenient().when(applicationProperties.getSystem()).thenReturn(null);

            config.addCorsMappings(registry);

            verify(registry).addMapping("/**");
        }
    }

    @Nested
    @DisplayName("PreferredEncodingResourceResolver")
    class PreferredEncodingResourceResolverTest {

        @TempDir Path tempDir;

        private WebMvcConfig.PreferredEncodingResourceResolver resolver;

        @BeforeEach
        void setUp() throws Exception {
            resolver = new WebMvcConfig.PreferredEncodingResourceResolver();
            Files.writeString(tempDir.resolve("app.js"), "plain");
        }

        @Test
        @DisplayName("prefers brotli when the client lists gzip first")
        void prefersBrotli() throws IOException {
            writeVariants();
            assertThat(resolve("gzip, deflate, br")).isEqualTo("br");
        }

        @Test
        @DisplayName("serves gzip when brotli is not accepted")
        void servesGzipWhenBrotliNotAccepted() throws IOException {
            writeVariants();
            assertThat(resolve("gzip, deflate")).isEqualTo("gzip");
        }

        @Test
        @DisplayName("falls back to gzip when the brotli sibling is missing")
        void fallsBackWhenBrotliSiblingMissing() throws IOException {
            Files.writeString(tempDir.resolve("app.js.gz"), "gz");
            assertThat(resolve("gzip, deflate, br")).isEqualTo("gzip");
        }

        @Test
        @DisplayName("serves the unencoded resource when no coding is accepted")
        void servesPlainWhenNoCodingAccepted() {
            assertThat(resolve("identity")).isNull();
        }

        private void writeVariants() throws IOException {
            Files.writeString(tempDir.resolve("app.js.br"), "br");
            Files.writeString(tempDir.resolve("app.js.gz"), "gz");
        }

        /** Content-Encoding of the resolved resource, or null when it is unencoded. */
        private String resolve(String acceptEncoding) {
            MockHttpServletRequest request = new MockHttpServletRequest();
            request.addHeader(HttpHeaders.ACCEPT_ENCODING, acceptEncoding);
            Resource resource =
                    resolver.resolveResource(
                            request,
                            "app.js",
                            List.of(new FileSystemResource(tempDir)),
                            new ResourceResolverChain() {
                                @Override
                                public Resource resolveResource(
                                        HttpServletRequest r,
                                        String path,
                                        List<? extends Resource> locations) {
                                    return new FileSystemResource(tempDir.resolve(path));
                                }

                                @Override
                                public String resolveUrlPath(
                                        String resourceUrlPath,
                                        List<? extends Resource> locations) {
                                    return resourceUrlPath;
                                }
                            });
            assertThat(resource).isNotNull();
            if (resource instanceof HttpResource httpResource) {
                return httpResource.getResponseHeaders().getFirst(HttpHeaders.CONTENT_ENCODING);
            }
            return null;
        }
    }
}
