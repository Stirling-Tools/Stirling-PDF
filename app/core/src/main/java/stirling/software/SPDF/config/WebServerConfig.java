package stirling.software.SPDF.config;

import org.springframework.boot.web.server.MimeMappings;
import org.springframework.boot.web.server.WebServerFactoryCustomizer;
import org.springframework.boot.web.server.servlet.ConfigurableServletWebServerFactory;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Registers the static-asset MIME types missing from Spring Boot's default table.
 *
 * <p>Boot replaces Jetty's built-in table with its own sparse default, so anything absent from both
 * Boot's table and {@code org.springframework.http.mime.types} is served as {@code
 * application/octet-stream}. Only single-extension mappings are registered: Jetty rejects
 * extensions containing '.' at startup.
 *
 * <p>The precompressed {@code .wasm.br}/{@code .wasm.gz} variants need no entry here; Spring's
 * encoded resource reports the identity filename, so the {@code wasm} mapping covers them and keeps
 * {@code WebAssembly.instantiateStreaming} working.
 */
@Configuration
public class WebServerConfig {

    @Bean
    public WebServerFactoryCustomizer<ConfigurableServletWebServerFactory>
            staticAssetMimeMappingsCustomizer() {
        return factory -> {
            MimeMappings mappings = new MimeMappings(MimeMappings.DEFAULT);
            mappings.add("wasm", "application/wasm");
            mappings.add("avif", "image/avif");
            mappings.add("webp", "image/webp");
            mappings.add("toml", "application/toml");
            mappings.add("zst", "application/zstd");
            factory.setMimeMappings(mappings);
        };
    }
}
