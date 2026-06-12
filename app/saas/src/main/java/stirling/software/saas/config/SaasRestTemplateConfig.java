package stirling.software.saas.config;

import java.net.http.HttpClient;
import java.time.Duration;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.enterprise.inject.Produces;
import jakarta.inject.Singleton;

import io.quarkus.arc.profile.IfBuildProfile;

/**
 * HTTP client for talking to Supabase Edge Functions, with a bounded connect timeout.
 *
 * <p>TODO: Migration required - replaced Spring RestTemplate with java.net.http.HttpClient. Consider
 * a typed {@code @RegisterRestClient} client instead. Note: the per-request read timeout previously
 * set on RestTemplate must now be applied per HttpRequest via {@code HttpRequest.Builder#timeout}.
 */
@ApplicationScoped
@IfBuildProfile("saas")
public class SaasRestTemplateConfig {

    @Produces
    @Singleton
    public HttpClient saasRestTemplate() {
        return HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build();
    }
}
