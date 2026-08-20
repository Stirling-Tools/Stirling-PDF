package stirling.software.saas.config;

import java.net.http.HttpClient;
import java.time.Duration;

import io.quarkus.arc.profile.IfBuildProfile;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.enterprise.inject.Produces;
import jakarta.inject.Singleton;

/** HTTP client for talking to Supabase Edge Functions, with a bounded connect timeout. */
@ApplicationScoped
@IfBuildProfile("saas")
public class SaasRestTemplateConfig {

    @Produces
    @Singleton
    public HttpClient saasRestTemplate() {
        return HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build();
    }
}
