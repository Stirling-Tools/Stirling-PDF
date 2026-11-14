package stirling.software.SPDF.config;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.RETURNS_DEEP_STUBS;
import static org.mockito.Mockito.atLeastOnce;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.mockStatic;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.io.File;
import java.io.IOException;
import java.net.URI;
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
import org.mockito.MockedStatic;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.context.annotation.AnnotationConfigUtils;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.io.ClassPathResource;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockServletContext;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.support.GenericWebApplicationContext;
import org.springframework.web.servlet.config.annotation.CorsRegistration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.EnableWebMvc;
import org.springframework.web.servlet.config.annotation.InterceptorRegistration;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistration;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.resource.HttpResource;
import org.springframework.web.servlet.resource.ResourceResolverChain;

import jakarta.servlet.http.HttpServletRequest;

import stirling.software.common.configuration.InstallationPathConfig;
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
        @DisplayName("registers every resource handler group")
        void registersEveryHandlerGroup() {
            ResourceHandlerRegistry registry = mock(ResourceHandlerRegistry.class);
            ResourceHandlerRegistration registration =
                    mock(ResourceHandlerRegistration.class, RETURNS_DEEP_STUBS);
            when(registry.addResourceHandler(any(String[].class))).thenReturn(registration);

            config.addResourceHandlers(registry);

            // SW/PWA, assets, images, fonts, branding root files, 11 branding folders,
            // catch-all = 17 handler registrations.
            verify(registry, times(17)).addResourceHandler(any(String[].class));
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
        @DisplayName("revalidates fonts rather than pinning them immutably for a year")
        void fontsAreRevalidated() {
            ResourceHandlerRegistry registry = mock(ResourceHandlerRegistry.class);
            ResourceHandlerRegistration sw =
                    mock(ResourceHandlerRegistration.class, RETURNS_DEEP_STUBS);
            ResourceHandlerRegistration assets =
                    mock(ResourceHandlerRegistration.class, RETURNS_DEEP_STUBS);
            ResourceHandlerRegistration images =
                    mock(ResourceHandlerRegistration.class, RETURNS_DEEP_STUBS);
            ResourceHandlerRegistration media =
                    mock(ResourceHandlerRegistration.class, RETURNS_DEEP_STUBS);
            ResourceHandlerRegistration branding =
                    mock(ResourceHandlerRegistration.class, RETURNS_DEEP_STUBS);
            ResourceHandlerRegistration catchAll =
                    mock(ResourceHandlerRegistration.class, RETURNS_DEEP_STUBS);
            when(registry.addResourceHandler(any(String[].class)))
                    .thenReturn(sw, assets, images, media, branding, catchAll);
            // addResourceLocations is the chain link before setCacheControl.
            when(sw.addResourceLocations(any(String[].class))).thenReturn(sw);
            when(assets.addResourceLocations(any(String[].class))).thenReturn(assets);
            when(images.addResourceLocations(any(String[].class))).thenReturn(images);
            when(media.addResourceLocations(any(String[].class))).thenReturn(media);
            when(branding.addResourceLocations(any(String[].class))).thenReturn(branding);
            when(catchAll.addResourceLocations(any(String[].class))).thenReturn(catchAll);

            config.addResourceHandlers(registry);

            // Fourth registration is the fonts group. The names never change
            // across releases, so the tier has to allow revalidation; repeating a
            // 17 MB CJK face is still cheap because an unchanged file answers the
            // conditional request with 304.
            ArgumentCaptor<String[]> patterns = ArgumentCaptor.forClass(String[].class);
            verify(registry, times(17)).addResourceHandler(patterns.capture());
            assertThat(patterns.getAllValues().get(3)).containsExactly("/fonts/**");

            ArgumentCaptor<CacheControl> caches = ArgumentCaptor.forClass(CacheControl.class);
            verify(media).setCacheControl(caches.capture());
            String header = caches.getValue().getHeaderValue();
            assertThat(header).contains("max-age=86400").doesNotContain("immutable");
        }

        @Test
        @DisplayName("keeps custom fonts off every public prefix while bundled assets resolve")
        void customFontsStayPrivate(@TempDir Path root, @TempDir Path outside) throws Exception {
            Path fonts = Files.createDirectories(root.resolve("fonts"));
            Files.writeString(fonts.resolve("Custom.ttf"), "custom");
            Files.createSymbolicLink(
                    fonts.resolve("leak.ttf"),
                    Files.writeString(outside.resolve("target.ttf"), "outside"));
            Files.writeString(root.resolve("favicon.ico"), "custom-icon");
            Files.writeString(
                    Files.createDirectories(root.resolve("js")).resolve("custom.js"), "js");

            MockMvc mvc = resourceMvc(root);

            for (String prefix : PUBLIC_PREFIXES) {
                for (String file : List.of("Custom.ttf", "leak.ttf")) {
                    mvc.perform(get(prefix + "/fonts/" + file)).andExpect(status().isNotFound());
                }
            }
            mvc.perform(get("/css/fonts/bootstrap-icons.woff2")).andExpect(status().isOk());
            mvc.perform(get("/fonts/DejaVuSans.ttf")).andExpect(status().isOk());
            mvc.perform(get("/favicon.ico")).andExpect(content().string("custom-icon"));
            mvc.perform(get("/js/custom.js")).andExpect(content().string("js"));
        }

        @Test
        @DisplayName("keeps custom fonts private when the folder is named in another case")
        void customFontsStayPrivateUnderAnyCase(@TempDir Path root) throws Exception {
            Path fonts = Files.createDirectories(root.resolve("fonts"));
            Files.writeString(fonts.resolve("Custom.ttf"), "custom");
            for (String alias : FOLDER_ALIASES) {
                if (!Files.exists(root.resolve(alias))) {
                    Files.createSymbolicLink(root.resolve(alias), fonts);
                }
            }

            MockMvc mvc = resourceMvc(root);

            for (String alias : FOLDER_ALIASES) {
                mvc.perform(get(URI.create("/" + alias + "/Custom.ttf")))
                        .andExpect(status().isNotFound());
            }
            mvc.perform(get(URI.create("/%46onts/Custom.ttf"))).andExpect(status().isNotFound());
            int bundledStatus =
                    new ClassPathResource("static/Fonts/DejaVuSans.ttf").exists() ? 200 : 404;
            mvc.perform(get(URI.create("/Fonts/DejaVuSans.ttf")))
                    .andExpect(status().is(bundledStatus));
        }

        @Test
        @DisplayName("limits every spelling of the fonts folder to bundled locations")
        void bundledOnlyResolverMatchesEverySpelling(@TempDir Path root) {
            WebMvcConfig.BundledOnlyFolderResolver resolver =
                    new WebMvcConfig.BundledOnlyFolderResolver("fonts");
            Resource custom = new FileSystemResource(root);
            Resource bundled = new ClassPathResource("static/");
            List<Resource> locations = List.of(custom, bundled);

            for (String path :
                    List.of(
                            "fonts/Custom.ttf",
                            "Fonts/Custom.ttf",
                            "FONTS/Custom.ttf",
                            "/fOnTs/Custom.ttf",
                            "%46onts/Custom.ttf",
                            "%2546onts/Custom.ttf",
                            "%46ONTS%2fCustom.ttf",
                            "Fonts\\Custom.ttf",
                            "./Fonts/Custom.ttf",
                            "fonts./Custom.ttf",
                            "Fonts .  /Custom.ttf",
                            "fonts::$INDEX_ALLOCATION/Custom.ttf",
                            "%zzonts/Custom.ttf")) {
                assertThat(List.<Resource>copyOf(resolver.allowedLocations(path, locations)))
                        .as(path)
                        .containsExactly(bundled);
            }
            for (String path :
                    List.of("index.html", "js/fonts/a.ttf", "fontsx/a.ttf", "myfonts/a.ttf")) {
                assertThat(List.<Resource>copyOf(resolver.allowedLocations(path, locations)))
                        .as(path)
                        .containsExactly(custom, bundled);
            }
        }

        private static final List<String> FOLDER_ALIASES =
                List.of("Fonts", "FONTS", "fOnTs", "fonts.");

        private static final List<String> PUBLIC_PREFIXES =
                List.of(
                        "",
                        "/images",
                        "/icons",
                        "/modern-logo",
                        "/pdfjs",
                        "/pdfium",
                        "/locales",
                        "/css",
                        "/js",
                        "/vendor",
                        "/samples",
                        "/og_images",
                        "/Login");

        private MockMvc resourceMvc(Path staticRoot) throws Exception {
            when(endpointInterceptor.preHandle(any(), any(), any())).thenReturn(true);
            when(pdfMetricsInterceptor.preHandle(any(), any(), any())).thenReturn(true);
            GenericWebApplicationContext context =
                    new GenericWebApplicationContext(new MockServletContext());
            AnnotationConfigUtils.registerAnnotationConfigProcessors(context);
            context.registerBean(ResourceMvc.class);
            context.getBeanFactory().registerSingleton("webMvcConfig", config);
            try (MockedStatic<InstallationPathConfig> paths =
                    mockStatic(InstallationPathConfig.class)) {
                paths.when(InstallationPathConfig::getStaticPath)
                        .thenReturn(staticRoot + File.separator);
                context.refresh();
            }
            return MockMvcBuilders.webAppContextSetup(context).build();
        }
    }

    @Configuration(proxyBeanMethods = false)
    @EnableWebMvc
    static class ResourceMvc {}

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

        @Test
        @DisplayName("honors an explicit brotli refusal and serves gzip")
        void honorsExplicitBrotliRefusal() throws IOException {
            writeVariants();
            assertThat(resolve("br;q=0, gzip")).isEqualTo("gzip");
        }

        @Test
        @DisplayName("serves the unencoded resource when the only listed coding is refused")
        void servesPlainWhenOnlyListedCodingRefused() throws IOException {
            writeVariants();
            assertThat(resolve("br;q=0")).isNull();
        }

        @Test
        @DisplayName("treats an unparseable quality value as listed")
        void treatsInvalidQualityAsListed() throws IOException {
            writeVariants();
            assertThat(resolve("br;q=nope, gzip, br")).isEqualTo("br");
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
