package stirling.software.saas.sso;

import java.net.URI;
import java.time.Duration;
import java.util.Map;
import java.util.UUID;

import org.springframework.context.annotation.Profile;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

import lombok.RequiredArgsConstructor;

import stirling.software.saas.config.SupabaseConfigurationProperties;

/**
 * Server-only Supabase SAML administration. Credentials and upstream errors never reach clients.
 */
@Component
@Profile("saas")
@RequiredArgsConstructor
public class SupabaseSamlAdmin {
    private final CompanySsoProperties properties;
    private final SupabaseConfigurationProperties supabase;

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Provider(UUID id) {}

    /** Saves metadata on a draft provider; active connections must not call this operation. */
    public UUID save(UUID provider, String metadataXml) {
        if (metadataXml == null || metadataXml.isBlank() || metadataXml.length() > 131072) {
            throw new CompanySsoException(
                    "INVALID_METADATA", "Upload a SAML metadata XML file smaller than 128 KB.");
        }
        String issuer = supabase.getIssuer();
        if (issuer == null
                || !"https".equals(URI.create(issuer).getScheme())
                || properties.getServiceRoleKey().isBlank()) {
            throw new CompanySsoException(
                    "SSO_UNAVAILABLE", "Company SSO has not been configured on this server.");
        }
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(Duration.ofSeconds(10));
        factory.setReadTimeout(Duration.ofSeconds(30));
        RestClient client =
                RestClient.builder()
                        .baseUrl(issuer)
                        .requestFactory(factory)
                        .defaultHeader(
                                HttpHeaders.AUTHORIZATION,
                                "Bearer " + properties.getServiceRoleKey())
                        .defaultHeader("apikey", properties.getServiceRoleKey())
                        .build();
        try {
            Provider result =
                    (provider == null
                                    ? client.post().uri("/admin/sso/providers")
                                    : client.put().uri("/admin/sso/providers/{id}", provider))
                            .contentType(MediaType.APPLICATION_JSON)
                            .body(Map.of("type", "saml", "metadata_xml", metadataXml))
                            .retrieve()
                            .body(Provider.class);
            if (result == null || result.id() == null)
                throw new RestClientException("Missing provider ID");
            return result.id();
        } catch (RestClientException e) {
            throw new CompanySsoException(
                    "PROVIDER_SAVE_FAILED",
                    "The SAML connection could not be saved. Check the metadata or contact support.");
        }
    }
}
