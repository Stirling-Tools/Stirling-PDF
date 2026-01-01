package stirling.software.SPDF.config;

import org.springframework.boot.web.embedded.jetty.JettyServletWebServerFactory;
import org.springframework.boot.web.server.WebServerFactoryCustomizer;
import org.springframework.stereotype.Component;

import lombok.extern.slf4j.Slf4j;

/**
 * Configuration for Jetty to use our managed temp directory for multipart uploads. This ensures
 * that temporary files created by Jetty for handling multipart form uploads are stored in our
 * managed temp directory where they can be tracked and cleaned up.
 *
 * <p>Note: Jetty uses the java.io.tmpdir system property for temporary files, which we already
 * configure in SPDFApplication, so no additional configuration is needed here.
 */
@Slf4j
@Component
public class JettyConfig implements WebServerFactoryCustomizer<JettyServletWebServerFactory> {

    @Override
    public void customize(JettyServletWebServerFactory factory) {
        // Jetty will use the java.io.tmpdir system property for temp files,
        // which is already configured in SPDFApplication to point to our managed temp directory
        log.debug("Jetty will use system temp directory: {}", System.getProperty("java.io.tmpdir"));
    }
}
