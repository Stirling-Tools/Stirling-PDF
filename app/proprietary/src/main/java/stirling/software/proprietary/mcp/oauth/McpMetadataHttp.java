package stirling.software.proprietary.mcp.oauth;

import java.io.FilterInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.InetAddress;
import java.net.URI;
import java.net.UnknownHostException;
import java.net.http.HttpHeaders;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.apache.hc.client5.http.DnsResolver;
import org.apache.hc.client5.http.classic.methods.HttpGet;
import org.apache.hc.client5.http.config.ConnectionConfig;
import org.apache.hc.client5.http.config.RequestConfig;
import org.apache.hc.client5.http.impl.classic.HttpClients;
import org.apache.hc.client5.http.impl.io.PoolingHttpClientConnectionManagerBuilder;
import org.apache.hc.core5.util.Timeout;

import stirling.software.common.util.GeneralUtils;

/** HTTPS metadata transport whose connection uses the same public IPs checked by its resolver. */
final class McpMetadataHttp {
    record Response(int statusCode, HttpHeaders headers, InputStream body) {}

    static InetAddress[] requirePublicAddresses(InetAddress[] addresses)
            throws UnknownHostException {
        if (addresses.length == 0 || addresses.length > 10)
            throw new UnknownHostException("Unsafe metadata host");
        for (InetAddress address : addresses) {
            if (address == null
                    || GeneralUtils.isDisallowedNetworkLocation(address.getHostAddress())) {
                throw new UnknownHostException("Metadata host resolves to a private address");
            }
        }
        return addresses;
    }

    static Response get(URI uri) throws IOException {
        if (!"https".equalsIgnoreCase(uri.getScheme())
                || uri.getHost() == null
                || uri.getRawUserInfo() != null) throw new IOException("Invalid metadata URL");
        DnsResolver resolver =
                new DnsResolver() {
                    @Override
                    public InetAddress[] resolve(String host) throws UnknownHostException {
                        return requirePublicAddresses(InetAddress.getAllByName(host));
                    }

                    @Override
                    public String resolveCanonicalHostname(String host) {
                        return host;
                    }
                };
        // Literal-address routes can bypass the DNS resolver in HTTP transports.
        resolver.resolve(uri.getHost());
        var manager =
                PoolingHttpClientConnectionManagerBuilder.create()
                        .setDnsResolver(resolver)
                        .setDefaultConnectionConfig(
                                ConnectionConfig.custom()
                                        .setConnectTimeout(Timeout.ofSeconds(5))
                                        .setSocketTimeout(Timeout.ofSeconds(10))
                                        .build())
                        .build();
        var client =
                HttpClients.custom()
                        .setConnectionManager(manager)
                        .disableRedirectHandling()
                        .disableAutomaticRetries()
                        .disableCookieManagement()
                        .setDefaultRequestConfig(
                                RequestConfig.custom()
                                        .setConnectionRequestTimeout(Timeout.ofSeconds(5))
                                        .setResponseTimeout(Timeout.ofSeconds(10))
                                        .build())
                        .build();
        try {
            HttpGet request = new HttpGet(uri);
            request.setHeader("Accept", "application/json");
            var response = client.executeOpen(null, request, null);
            Map<String, List<String>> headers = new LinkedHashMap<>();
            for (var header : response.getHeaders()) {
                headers.computeIfAbsent(header.getName(), key -> new ArrayList<>())
                        .add(header.getValue());
            }
            InputStream body =
                    response.getEntity() == null
                            ? InputStream.nullInputStream()
                            : response.getEntity().getContent();
            return new Response(
                    response.getCode(),
                    HttpHeaders.of(headers, (name, value) -> true),
                    new FilterInputStream(body) {
                        @Override
                        public void close() throws IOException {
                            try {
                                response.close();
                            } finally {
                                client.close();
                            }
                        }
                    });
        } catch (IOException | RuntimeException e) {
            client.close();
            throw e;
        }
    }
}
