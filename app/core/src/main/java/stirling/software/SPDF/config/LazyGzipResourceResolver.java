package stirling.software.SPDF.config;

import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.io.UncheckedIOException;
import java.net.URI;
import java.net.URL;
import java.nio.channels.ReadableByteChannel;
import java.nio.charset.Charset;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;
import java.util.zip.Deflater;
import java.util.zip.GZIPOutputStream;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.io.AbstractResource;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpHeaders;
import org.springframework.web.servlet.resource.HttpResource;
import org.springframework.web.servlet.resource.ResourceResolver;
import org.springframework.web.servlet.resource.ResourceResolverChain;

import jakarta.servlet.http.HttpServletRequest;

/**
 * Serves a gzip variant of a static resource, creating it on the first request that accepts gzip
 * but cannot take brotli. The compressed file is cached for the life of the process, so a
 * brotli-only deployment never pays to build gzip and a gzip client pays once per resource.
 *
 * <p>This resolver never builds a gzip file ahead of time; it sits behind {@link
 * WebMvcConfig.PreferredEncodingResourceResolver}, which serves existing {@code .br} siblings
 * first.
 */
final class LazyGzipResourceResolver implements ResourceResolver {

    private static final Logger logger = LoggerFactory.getLogger(LazyGzipResourceResolver.class);
    private static final long MIN_SIZE = 1024;
    private static final int BUFFER_SIZE = 64 * 1024;
    private static final Set<String> COMPRESSIBLE_EXTENSIONS =
            Set.of(
                    "html",
                    "htm",
                    "css",
                    "js",
                    "mjs",
                    "json",
                    "toml",
                    "xml",
                    "svg",
                    "txt",
                    "map",
                    "wasm",
                    "ttf",
                    "otf",
                    "woff",
                    "eot",
                    "csv",
                    "md",
                    "yaml",
                    "yml",
                    "webmanifest");

    private record CacheKey(String description, long lastModified, long length) {}

    private volatile Path cacheDir;
    private final ConcurrentMap<CacheKey, Path> cache = new ConcurrentHashMap<>();

    LazyGzipResourceResolver() {
        Runtime.getRuntime().addShutdownHook(new Thread(this::close, "gzip-cache-cleanup"));
    }

    LazyGzipResourceResolver(Path cacheDir) {
        this.cacheDir = cacheDir;
    }

    @Override
    public Resource resolveResource(
            HttpServletRequest request,
            String requestPath,
            List<? extends Resource> locations,
            ResourceResolverChain chain) {
        Resource resource = chain.resolveResource(request, requestPath, locations);
        if (resource == null
                || request == null
                || !acceptsGzip(request)
                || !isCompressible(requestPath)
                || isAlreadyEncoded(resource)
                || hasBrotliSibling(resource)) {
            return resource;
        }

        try {
            if (!resource.exists() || resource.contentLength() < MIN_SIZE) {
                return resource;
            }
            CacheKey key =
                    new CacheKey(
                            resource.getDescription(),
                            resource.lastModified(),
                            resource.contentLength());
            Path compressed =
                    cache.computeIfAbsent(
                            key,
                            ignored -> {
                                try {
                                    return compress(resource);
                                } catch (IOException e) {
                                    throw new UncheckedIOException(e);
                                }
                            });
            return new GzipResource(resource, compressed);
        } catch (IOException | UncheckedIOException e) {
            logger.warn("Could not gzip static resource {}", requestPath, e);
            return resource;
        }
    }

    @Override
    public String resolveUrlPath(
            String resourcePath, List<? extends Resource> locations, ResourceResolverChain chain) {
        return chain.resolveUrlPath(resourcePath, locations);
    }

    private Path compress(Resource resource) throws IOException {
        Path directory = cacheDirectory();
        Path target = Files.createTempFile(directory, "gzip-", ".tmp");
        try (InputStream input = resource.getInputStream();
                OutputStream file = Files.newOutputStream(target);
                GZIPOutputStream gzip = new BestGzipOutputStream(file)) {
            input.transferTo(gzip);
        } catch (IOException e) {
            Files.deleteIfExists(target);
            throw e;
        }
        Path complete = Files.createTempFile(directory, "gzip-", ".gz");
        Files.move(target, complete, StandardCopyOption.REPLACE_EXISTING);
        return complete;
    }

    private Path cacheDirectory() throws IOException {
        Path directory = cacheDir;
        if (directory == null) {
            synchronized (this) {
                directory = cacheDir;
                if (directory == null) {
                    directory = Files.createTempDirectory("stirling-gzip-");
                    cacheDir = directory;
                }
            }
        } else {
            Files.createDirectories(directory);
        }
        return directory;
    }

    private static boolean acceptsGzip(HttpServletRequest request) {
        String header = request.getHeader(HttpHeaders.ACCEPT_ENCODING);
        if (header == null) {
            return false;
        }
        for (String token : header.toLowerCase(Locale.ROOT).split(",")) {
            String[] parts = token.split(";");
            if (!parts[0].trim().equals("gzip")) {
                continue;
            }
            boolean refused = false;
            for (int i = 1; i < parts.length; i++) {
                String param = parts[i].trim();
                if (param.startsWith("q=")) {
                    try {
                        refused = Double.parseDouble(param.substring(2).trim()) == 0;
                    } catch (NumberFormatException ignored) {
                        // Invalid qvalue is not a refusal; stay lenient.
                    }
                    break;
                }
            }
            if (!refused) {
                return true;
            }
        }
        return false;
    }

    private static boolean isCompressible(String path) {
        int dot = path.lastIndexOf('.');
        if (dot < 0 || dot == path.length() - 1) {
            return false;
        }
        return COMPRESSIBLE_EXTENSIONS.contains(path.substring(dot + 1).toLowerCase(Locale.ROOT));
    }

    private static boolean isAlreadyEncoded(Resource resource) {
        return resource instanceof HttpResource httpResource
                && httpResource.getResponseHeaders().containsHeader(HttpHeaders.CONTENT_ENCODING);
    }

    /**
     * EncodedResourceResolver asks this resolver for the base path before it looks for the {@code
     * .br} sibling. Wrapping the base in gzip makes that lookup fail, so a client that accepts
     * brotli would be served gzip. Leave the base untouched whenever the sibling exists.
     */
    private static boolean hasBrotliSibling(Resource resource) {
        String filename = resource.getFilename();
        if (filename == null) {
            return false;
        }
        try {
            return resource.createRelative(filename + ".br").exists();
        } catch (IOException e) {
            return false;
        }
    }

    void close() {
        cache.clear();
        Path directory = cacheDir;
        if (directory != null) {
            deleteRecursively(directory);
        }
    }

    private static void deleteRecursively(Path path) {
        try (var entries = Files.walk(path)) {
            entries.sorted((a, b) -> b.getNameCount() - a.getNameCount())
                    .forEach(
                            entry -> {
                                try {
                                    Files.deleteIfExists(entry);
                                } catch (IOException ignored) {
                                    // Best effort: the temp directory is disposable.
                                }
                            });
        } catch (IOException ignored) {
            // Best effort: the temp directory is disposable.
        }
    }

    private static final class BestGzipOutputStream extends GZIPOutputStream {

        private BestGzipOutputStream(OutputStream out) throws IOException {
            super(out, BUFFER_SIZE);
            this.def.setLevel(Deflater.BEST_COMPRESSION);
        }
    }

    private static final class GzipResource extends AbstractResource implements HttpResource {

        private final Resource original;
        private final Path compressed;

        private GzipResource(Resource original, Path compressed) {
            this.original = original;
            this.compressed = compressed;
        }

        @Override
        public boolean exists() {
            return Files.exists(compressed);
        }

        @Override
        public boolean isReadable() {
            return Files.isReadable(compressed);
        }

        @Override
        public boolean isOpen() {
            return false;
        }

        @Override
        public boolean isFile() {
            return true;
        }

        @Override
        public URL getURL() throws IOException {
            return compressed.toUri().toURL();
        }

        @Override
        public URI getURI() throws IOException {
            return compressed.toUri();
        }

        @Override
        public File getFile() throws IOException {
            return compressed.toFile();
        }

        @Override
        public Path getFilePath() throws IOException {
            return compressed;
        }

        @Override
        public InputStream getInputStream() throws IOException {
            return Files.newInputStream(compressed);
        }

        @Override
        public ReadableByteChannel readableChannel() throws IOException {
            return Files.newByteChannel(compressed);
        }

        @Override
        public byte[] getContentAsByteArray() throws IOException {
            return Files.readAllBytes(compressed);
        }

        @Override
        public String getContentAsString(Charset charset) throws IOException {
            return Files.readString(compressed, charset);
        }

        @Override
        public long contentLength() throws IOException {
            return Files.size(compressed);
        }

        @Override
        public long lastModified() throws IOException {
            return original.lastModified();
        }

        @Override
        public Resource createRelative(String relativePath) throws IOException {
            return original.createRelative(relativePath);
        }

        @Override
        public String getFilename() {
            return original.getFilename();
        }

        @Override
        public String getDescription() {
            return "gzip " + compressed;
        }

        @Override
        public HttpHeaders getResponseHeaders() {
            HttpHeaders headers =
                    original instanceof HttpResource httpResource
                            ? httpResource.getResponseHeaders()
                            : new HttpHeaders();
            headers.add(HttpHeaders.CONTENT_ENCODING, "gzip");
            headers.add(HttpHeaders.VARY, HttpHeaders.ACCEPT_ENCODING);
            return headers;
        }
    }
}
