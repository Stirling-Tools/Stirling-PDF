package stirling.software.SPDF.config;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.zip.GZIPInputStream;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpHeaders;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.web.servlet.resource.HttpResource;
import org.springframework.web.servlet.resource.ResourceResolverChain;

import jakarta.servlet.http.HttpServletRequest;

class LazyGzipResourceResolverTest {

    @TempDir Path tempDir;

    private LazyGzipResourceResolver resolver;
    private Path source;
    private byte[] original;

    @BeforeEach
    void setUp() throws IOException {
        resolver = new LazyGzipResourceResolver(tempDir.resolve("cache"));
        source = tempDir.resolve("app.js");
        original = "const value = 1;\n".repeat(200).getBytes(StandardCharsets.UTF_8);
        Files.write(source, original);
    }

    @AfterEach
    void tearDown() {
        resolver.close();
    }

    @Test
    void createsGzipOnFirstRequestThatAcceptsIt() throws IOException {
        Resource resolved = resolve("gzip, deflate");

        assertThat(resolved).isInstanceOf(HttpResource.class);
        assertThat(
                        ((HttpResource) resolved)
                                .getResponseHeaders()
                                .getFirst(HttpHeaders.CONTENT_ENCODING))
                .isEqualTo("gzip");
        assertThat(resolved.contentLength()).isLessThan(original.length);
        assertThat(decompress(resolved)).isEqualTo(original);
    }

    @Test
    void doesNotCreateGzipForBrotliOnlyClients() throws IOException {
        Resource resolved = resolve("br");

        assertThat(resolved).isInstanceOf(FileSystemResource.class);
        assertThat(((FileSystemResource) resolved).getPath()).isEqualTo(source.toString());
        assertThat(tempDir.resolve("cache")).doesNotExist();
    }

    @Test
    void doesNotCreateGzipWhenTheClientRefusesIt() throws IOException {
        Resource resolved = resolve("gzip;q=0, br");

        assertThat(resolved).isInstanceOf(FileSystemResource.class);
    }

    @Test
    void leavesIncompressibleFilesAlone() throws IOException {
        Path image = tempDir.resolve("image.png");
        Files.write(image, new byte[4096]);

        Resource resolved = resolve("gzip", image, "image.png");

        assertThat(resolved).isInstanceOf(FileSystemResource.class);
    }

    @Test
    void reusesTheCachedFile() throws IOException {
        Resource first = resolve("gzip");
        Resource second = resolve("gzip");

        assertThat(first.getFilePath()).isEqualTo(second.getFilePath());
    }

    @Test
    void rebuildsWhenTheSourceChanges() throws IOException {
        Path first = resolve("gzip").getFilePath();

        Files.write(source, "changed\n".repeat(300).getBytes(StandardCharsets.UTF_8));
        Path second = resolve("gzip").getFilePath();

        assertThat(second).isNotEqualTo(first);
    }

    private Resource resolve(String acceptEncoding) throws IOException {
        return resolve(acceptEncoding, source, "app.js");
    }

    private Resource resolve(String acceptEncoding, Path file, String path) {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.addHeader(HttpHeaders.ACCEPT_ENCODING, acceptEncoding);
        return resolver.resolveResource(
                request,
                path,
                List.of(new FileSystemResource(tempDir)),
                new ResourceResolverChain() {
                    @Override
                    public Resource resolveResource(
                            HttpServletRequest r,
                            String resourcePath,
                            List<? extends Resource> locations) {
                        return new FileSystemResource(file);
                    }

                    @Override
                    public String resolveUrlPath(
                            String resourceUrlPath, List<? extends Resource> locations) {
                        return resourceUrlPath;
                    }
                });
    }

    private static byte[] decompress(Resource resource) throws IOException {
        try (InputStream input = resource.getInputStream();
                GZIPInputStream gzip = new GZIPInputStream(input)) {
            return gzip.readAllBytes();
        }
    }
}
