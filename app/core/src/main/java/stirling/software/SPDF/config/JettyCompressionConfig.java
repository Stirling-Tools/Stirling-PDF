package stirling.software.SPDF.config;

import java.util.List;

import org.eclipse.jetty.compression.server.CompressionConfig;
import org.eclipse.jetty.compression.server.CompressionHandler;
import org.eclipse.jetty.http.pathmap.PathMappings;
import org.eclipse.jetty.http.pathmap.PathSpec;
import org.springframework.boot.jetty.JettyServerCustomizer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Keeps {@code server.compression} to response compression only.
 *
 * <p>On Jetty, Spring Boot's {@link CompressionHandler} leaves its request-decompression rules
 * empty, so every compressed request body is inflated before any size limit sees it: a few MB on
 * the wire can become gigabytes. No Stirling-PDF client compresses request bodies.
 */
@Configuration
public class JettyCompressionConfig {

    @Bean
    public JettyServerCustomizer disableRequestDecompression() {
        return server -> server.getDescendants(CompressionHandler.class).forEach(this::apply);
    }

    @SuppressWarnings("unchecked")
    private void apply(CompressionHandler handler) {
        PathMappings<CompressionConfig> mappings = handler.getBean(PathMappings.class);
        if (mappings == null) {
            // Fail closed: without the mappings the configs cannot all be found and rewritten.
            throw new IllegalStateException(
                    "Cannot disable request decompression: CompressionHandler no longer exposes"
                            + " its path mappings");
        }
        if (mappings.isEmpty()) {
            // An empty handler installs Jetty's defaults on start, which decompress POST bodies.
            handler.putConfiguration(
                    "/",
                    CompressionConfig.builder().defaults().decompressExcludePath("/*").build());
            return;
        }
        for (PathSpec pathSpec : List.copyOf(mappings.keySet())) {
            handler.putConfiguration(
                    pathSpec, withoutRequestDecompression(handler.getConfiguration(pathSpec)));
        }
    }

    // CompressionConfig is immutable, so the response-side settings are copied into a new one.
    static CompressionConfig withoutRequestDecompression(CompressionConfig config) {
        CompressionConfig.Builder builder = CompressionConfig.builder();
        config.getCompressIncludeEncodings().forEach(builder::compressIncludeEncoding);
        config.getCompressExcludeEncodings().forEach(builder::compressExcludeEncoding);
        config.getCompressIncludeMethods().forEach(builder::compressIncludeMethod);
        config.getCompressExcludeMethods().forEach(builder::compressExcludeMethod);
        config.getCompressIncludeMimeTypes().forEach(builder::compressIncludeMimeType);
        config.getCompressExcludeMimeTypes().forEach(builder::compressExcludeMimeType);
        config.getCompressIncludePaths().forEach(builder::compressIncludePath);
        config.getCompressExcludePaths().forEach(builder::compressExcludePath);
        builder.compressPreferredEncodings(config.getCompressPreferredEncodings());
        return builder.decompressExcludePath("/*").build();
    }
}
