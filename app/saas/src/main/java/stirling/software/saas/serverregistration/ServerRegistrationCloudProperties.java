package stirling.software.saas.serverregistration;

import java.util.Set;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

import lombok.Getter;
import lombok.Setter;

/**
 * Cloud trust configuration; product IDs and the Ed25519 public key must belong to the configured
 * account.
 */
@Getter
@Setter
@Component
@Profile("saas")
@ConfigurationProperties(prefix = "stirling.server-registration")
public class ServerRegistrationCloudProperties {
    private Set<String> serverProductIds = Set.of();
    private String licensePublicKey;
}
