package stirling.software.SPDF.service.ai;

import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;

import jakarta.servlet.http.HttpServletRequest;

import org.springframework.stereotype.Service;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.ApplicationProperties;

@Service
@Slf4j
public class AiProxyService {

    private static final String DEFAULT_AI_BASE_URL = "http://localhost:5000";

    private final ApplicationProperties applicationProperties;
    private final HttpClient httpClient;

    public AiProxyService(ApplicationProperties applicationProperties) {
        this.applicationProperties = applicationProperties;
        this.httpClient = HttpClient.newBuilder().build();
    }

    public HttpResponse<InputStream> forward(
            String method, String path, HttpServletRequest request, boolean acceptEventStream)
            throws IOException, InterruptedException {
        String targetUrl = buildTargetUrl(path, request.getQueryString());
        HttpRequest.Builder builder = HttpRequest.newBuilder(URI.create(targetUrl));

        String contentType = request.getContentType();
        if (contentType != null && !contentType.isBlank()) {
            builder.header("Content-Type", contentType);
        }

        String accept = request.getHeader("Accept");
        if (acceptEventStream) {
            builder.header("Accept", "text/event-stream");
        } else if (accept != null && !accept.isBlank()) {
            builder.header("Accept", accept);
        }

        builder.method(method, buildBodyPublisher(method, request));
        log.debug("Proxying AI request {} {}", method, targetUrl);
        return httpClient.send(builder.build(), HttpResponse.BodyHandlers.ofInputStream());
    }

    private String buildTargetUrl(String path, String queryString) {
        String baseUrl = applicationProperties.getSystem().getAiServiceBaseUrl();
        if (baseUrl == null || baseUrl.isBlank()) {
            baseUrl = DEFAULT_AI_BASE_URL;
        }
        baseUrl = baseUrl.trim();
        if (baseUrl.endsWith("/")) {
            baseUrl = baseUrl.substring(0, baseUrl.length() - 1);
        }
        if (!path.startsWith("/")) {
            path = "/" + path;
        }
        String url = baseUrl + path;
        if (queryString != null && !queryString.isBlank()) {
            url += "?" + queryString;
        }
        return url;
    }

    private HttpRequest.BodyPublisher buildBodyPublisher(String method, HttpServletRequest request) {
        if ("GET".equalsIgnoreCase(method) || "DELETE".equalsIgnoreCase(method)) {
            return HttpRequest.BodyPublishers.noBody();
        }
        return HttpRequest.BodyPublishers.ofInputStream(
                () -> {
                    try {
                        return request.getInputStream();
                    } catch (IOException exc) {
                        throw new UncheckedIOException(exc);
                    }
                });
    }
}
