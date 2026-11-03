package stirling.software.SPDF.config;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.List;
import java.util.Optional;
import java.util.zip.GZIPOutputStream;

import org.eclipse.jetty.compression.server.CompressionConfig;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.boot.jetty.servlet.JettyServletWebServerFactory;
import org.springframework.boot.web.server.Compression;
import org.springframework.boot.web.server.WebServer;

import jakarta.servlet.http.HttpServlet;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

/** Boots a real Jetty with {@code server.compression} on, as the application does. */
class JettyCompressionConfigTest {

    private static final int INFLATED_SIZE = 1024 * 1024;

    private final HttpClient client = HttpClient.newHttpClient();
    private WebServer server;

    @AfterEach
    void stopServer() {
        if (server != null) {
            server.stop();
        }
        client.close();
    }

    @Test
    void gzipRequestBodyReachesServletCompressed() throws Exception {
        start(true);
        byte[] body = gzip(new byte[INFLATED_SIZE]);

        assertThat(postGzip(body)).isEqualTo(String.valueOf(body.length));
    }

    @Test
    void withoutCustomizerJettyInflatesRequestBody() throws Exception {
        // Guards the test above against passing vacuously if Jetty stops inflating by default.
        start(false);

        assertThat(postGzip(gzip(new byte[INFLATED_SIZE])))
                .isEqualTo(String.valueOf(INFLATED_SIZE));
    }

    @Test
    void responsesAreStillCompressed() throws Exception {
        start(true);

        assertThat(getEncoding("text/plain")).hasValue("gzip");
    }

    @Test
    void responsesOutsideConfiguredMimeTypesStayUncompressed() throws Exception {
        start(true);

        assertThat(getEncoding("image/jpeg")).isEmpty();
    }

    @Test
    void rewrittenConfigKeepsResponseSettingsAndExcludesAllPathsFromDecompression() {
        CompressionConfig original =
                CompressionConfig.builder()
                        .compressIncludeMimeType("text/plain")
                        .compressExcludeMimeType("image/jpeg")
                        .compressIncludeMethod("GET")
                        .compressExcludePath("/skip/*")
                        .compressPreferredEncodings(List.of("gzip"))
                        .build();

        CompressionConfig rewritten = JettyCompressionConfig.withoutRequestDecompression(original);

        assertThat(rewritten.getCompressIncludeMimeTypes())
                .isEqualTo(original.getCompressIncludeMimeTypes());
        assertThat(rewritten.getCompressExcludeMimeTypes())
                .isEqualTo(original.getCompressExcludeMimeTypes());
        assertThat(rewritten.getCompressIncludeMethods())
                .isEqualTo(original.getCompressIncludeMethods());
        assertThat(rewritten.getCompressExcludePaths())
                .isEqualTo(original.getCompressExcludePaths());
        assertThat(rewritten.getCompressPreferredEncodings()).containsExactly("gzip");
        assertThat(rewritten.getDecompressExcludePaths()).containsExactly("/*");
    }

    private Optional<String> getEncoding(String contentType)
            throws IOException, InterruptedException {
        HttpResponse<byte[]> response =
                client.send(
                        HttpRequest.newBuilder(URI.create(uri() + "?type=" + contentType))
                                .header("Accept-Encoding", "gzip")
                                .GET()
                                .build(),
                        HttpResponse.BodyHandlers.ofByteArray());
        assertThat(response.statusCode()).isEqualTo(200);
        return response.headers().firstValue("Content-Encoding");
    }

    private void start(boolean withCustomizer) {
        JettyServletWebServerFactory factory = new JettyServletWebServerFactory(0);
        Compression compression = new Compression();
        compression.setEnabled(true);
        factory.setCompression(compression);
        if (withCustomizer) {
            factory.addServerCustomizers(
                    new JettyCompressionConfig().disableRequestDecompression());
        }
        server =
                factory.getWebServer(
                        context ->
                                context.addServlet("echo", new BodyLengthServlet())
                                        .addMapping("/*"));
        server.start();
    }

    private String postGzip(byte[] body) throws IOException, InterruptedException {
        HttpResponse<String> response =
                client.send(
                        HttpRequest.newBuilder(uri())
                                .header("Content-Type", "application/octet-stream")
                                .header("Content-Encoding", "gzip")
                                .POST(HttpRequest.BodyPublishers.ofByteArray(body))
                                .build(),
                        HttpResponse.BodyHandlers.ofString());
        assertThat(response.statusCode()).isEqualTo(200);
        return response.body();
    }

    private URI uri() {
        return URI.create("http://localhost:" + server.getPort() + "/echo");
    }

    private static byte[] gzip(byte[] data) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        try (GZIPOutputStream gzip = new GZIPOutputStream(out)) {
            gzip.write(data);
        }
        return out.toByteArray();
    }

    /** POST answers with the number of body bytes read; GET answers 8 KB of {@code ?type}. */
    private static class BodyLengthServlet extends HttpServlet {
        @Override
        protected void doPost(HttpServletRequest req, HttpServletResponse resp) throws IOException {
            long length = req.getInputStream().transferTo(OutputStream.nullOutputStream());
            resp.setContentType("text/plain");
            resp.getWriter().write(String.valueOf(length));
        }

        @Override
        protected void doGet(HttpServletRequest req, HttpServletResponse resp) throws IOException {
            resp.setContentType(req.getParameter("type"));
            resp.getWriter().write("a".repeat(8192));
        }
    }
}
