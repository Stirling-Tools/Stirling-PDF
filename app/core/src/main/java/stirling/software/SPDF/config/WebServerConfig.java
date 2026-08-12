package stirling.software.SPDF.config;

import org.springframework.boot.web.server.MimeMappings;
import org.springframework.boot.web.server.WebServerFactoryCustomizer;
import org.springframework.boot.web.server.servlet.ConfigurableServletWebServerFactory;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Registers {@code application/wasm} (plus the precompressed variants) so the {@code
 * EncodedResourceResolver} serves precompressed {@code pdfium.wasm} with the correct {@code
 * Content-Type}. Without this, the resolved {@code .wasm.br}/{@code .wasm.gz} filenames fall back
 * to {@code application/octet-stream} and {@code WebAssembly.instantiateStreaming} silently
 * degrades to ArrayBuffer instantiation.
 */
@Configuration
public class WebServerConfig {

    @Bean
    public WebServerFactoryCustomizer<ConfigurableServletWebServerFactory>
            wasmMimeMappingsCustomizer() {
        return factory -> {
            MimeMappings mappings = new MimeMappings(MimeMappings.DEFAULT);
            mappings.add("wasm", "application/wasm");
            mappings.add("wasm.br", "application/wasm");
            mappings.add("wasm.gz", "application/wasm");
            factory.setMimeMappings(mappings);
        };
    }
}
