package stirling.software.SPDF.service;

import java.io.IOException;
import java.io.InputStream;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.URI;
import java.net.URISyntaxException;
import java.net.UnknownHostException;
import java.nio.charset.Charset;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;
import java.util.function.Predicate;

import org.apache.hc.client5.http.DnsResolver;
import org.apache.hc.client5.http.SystemDefaultDnsResolver;
import org.apache.hc.client5.http.classic.methods.HttpGet;
import org.apache.hc.client5.http.config.ConnectionConfig;
import org.apache.hc.client5.http.impl.classic.CloseableHttpClient;
import org.apache.hc.client5.http.impl.classic.CloseableHttpResponse;
import org.apache.hc.client5.http.impl.classic.HttpClients;
import org.apache.hc.client5.http.impl.io.PoolingHttpClientConnectionManagerBuilder;
import org.apache.hc.core5.http.ContentType;
import org.apache.hc.core5.http.Header;
import org.apache.hc.core5.http.HttpEntity;
import org.apache.hc.core5.http.HttpHeaders;
import org.apache.hc.core5.util.Timeout;
import org.springframework.stereotype.Service;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.util.GeneralUtils;

@Slf4j
@Service
public class RemoteHtmlFetcher {

    public static final long DEFAULT_MAX_BYTES = 20L * 1024 * 1024;
    static final int MAX_REDIRECTS = 5;
    static final long TOTAL_TIMEOUT_SECONDS = 60;
    private static final Timeout CONNECT_TIMEOUT = Timeout.ofSeconds(10);
    private static final Timeout SOCKET_TIMEOUT = Timeout.ofSeconds(20);
    private static final Set<Integer> REDIRECT_STATUSES = Set.of(301, 302, 303, 307, 308);
    private static final Set<String> ALLOWED_SCHEMES = Set.of("http", "https");

    @FunctionalInterface
    interface HostResolver {
        InetAddress[] resolve(String host) throws UnknownHostException;
    }

    public record RemoteHtml(String content, String url) {}

    private record Hop(String body, String location) {}

    private final Predicate<InetAddress> isBlockedAddress;
    private final HostResolver hostResolver;
    private final long maxBytes;

    public RemoteHtmlFetcher() {
        this(GeneralUtils::isSensitiveAddress, InetAddress::getAllByName, DEFAULT_MAX_BYTES);
    }

    RemoteHtmlFetcher(
            Predicate<InetAddress> isBlockedAddress, HostResolver hostResolver, long maxBytes) {
        this.isBlockedAddress = isBlockedAddress;
        this.hostResolver = hostResolver;
        this.maxBytes = maxBytes;
    }

    public RemoteHtml fetch(String url) throws IOException {
        URI current = requireAllowedUri(parse(url));
        try (CloseableHttpClient client = buildClient()) {
            for (int redirects = 0; ; redirects++) {
                Hop hop = fetchOnce(client, current);
                if (hop.location() == null) {
                    return new RemoteHtml(hop.body(), current.toString());
                }
                if (redirects >= MAX_REDIRECTS) {
                    throw new IOException("Remote HTML redirect limit exceeded");
                }
                current = requireAllowedUri(resolveLocation(current, hop.location()));
            }
        }
    }

    URI requireAllowedUri(URI uri) throws IOException {
        String scheme = uri.getScheme();
        if (scheme == null || !ALLOWED_SCHEMES.contains(scheme.toLowerCase(Locale.ROOT))) {
            throw new IOException("Only http and https URLs are allowed");
        }
        String host = uri.getHost();
        if (host == null || host.isBlank()) {
            throw new IOException("URL has no host");
        }
        resolveAllowed(host);
        return uri;
    }

    InetAddress[] resolveAllowed(String host) throws UnknownHostException {
        InetAddress[] addresses = hostResolver.resolve(host);
        if (addresses == null || addresses.length == 0) {
            throw new UnknownHostException("No addresses for " + host);
        }
        for (InetAddress address : addresses) {
            if (address == null || isBlockedAddress.test(address)) {
                log.warn("Blocked URL to PDF request to {} resolved to {}", host, address);
                throw new UnknownHostException("Host " + host + " is not allowed");
            }
        }
        return addresses;
    }

    private Hop fetchOnce(CloseableHttpClient client, URI uri) throws IOException {
        HttpGet request = new HttpGet(uri);
        CompletableFuture.delayedExecutor(TOTAL_TIMEOUT_SECONDS, TimeUnit.SECONDS)
                .execute(request::cancel);
        CloseableHttpResponse response = client.execute(request);
        boolean drained = false;
        try {
            int status = response.getCode();
            if (REDIRECT_STATUSES.contains(status)) {
                Header location = response.getFirstHeader(HttpHeaders.LOCATION);
                if (location == null || location.getValue().isBlank()) {
                    throw new IOException("Remote HTML redirect is missing a location");
                }
                return new Hop(null, location.getValue());
            }
            HttpEntity entity = response.getEntity();
            if (status < 200 || status >= 300 || entity == null) {
                throw new IOException("Failed to retrieve remote HTML. Status: " + status);
            }
            if (entity.getContentLength() > maxBytes) {
                throw new IOException("Remote HTML exceeds the size limit");
            }
            String body = readLimited(entity);
            drained = true;
            return new Hop(body, null);
        } finally {
            if (!drained) {
                request.cancel();
            }
            closeQuietly(response);
        }
    }

    private String readLimited(HttpEntity entity) throws IOException {
        byte[] bytes;
        try (InputStream in = entity.getContent()) {
            bytes = in.readNBytes(Math.toIntExact(maxBytes) + 1);
            if (bytes.length > maxBytes) {
                throw new IOException("Remote HTML exceeds the size limit");
            }
        }
        Charset charset =
                ContentType.getCharset(
                        ContentType.parseLenient(entity.getContentType()), StandardCharsets.UTF_8);
        return new String(bytes, charset);
    }

    private CloseableHttpClient buildClient() {
        return HttpClients.custom()
                .setConnectionManager(
                        PoolingHttpClientConnectionManagerBuilder.create()
                                .setDnsResolver(new ValidatingDnsResolver())
                                .setDefaultConnectionConfig(
                                        ConnectionConfig.custom()
                                                .setConnectTimeout(CONNECT_TIMEOUT)
                                                .setSocketTimeout(SOCKET_TIMEOUT)
                                                .build())
                                .build())
                .disableRedirectHandling()
                .disableAutomaticRetries()
                .disableCookieManagement()
                .disableAuthCaching()
                .setUserAgent("Stirling-PDF/URL-to-PDF")
                .build();
    }

    private static URI parse(String url) throws IOException {
        try {
            return new URI(url);
        } catch (URISyntaxException e) {
            throw new IOException("Invalid URL", e);
        }
    }

    private static URI resolveLocation(URI base, String location) throws IOException {
        try {
            return base.resolve(new URI(location));
        } catch (URISyntaxException | IllegalArgumentException e) {
            throw new IOException("Invalid remote HTML redirect location", e);
        }
    }

    private static void closeQuietly(CloseableHttpResponse response) {
        try {
            response.close();
        } catch (IOException e) {
            log.debug("Error closing remote HTML response: {}", e.getMessage());
        }
    }

    private final class ValidatingDnsResolver implements DnsResolver {

        @Override
        public InetAddress[] resolve(String host) throws UnknownHostException {
            return resolveAllowed(host);
        }

        @Override
        public List<InetSocketAddress> resolve(String host, int port) throws UnknownHostException {
            List<InetSocketAddress> result = new ArrayList<>();
            for (InetAddress address : resolveAllowed(host)) {
                result.add(new InetSocketAddress(address, port));
            }
            return result;
        }

        @Override
        public String resolveCanonicalHostname(String host) throws UnknownHostException {
            return SystemDefaultDnsResolver.INSTANCE.resolveCanonicalHostname(host);
        }
    }
}
