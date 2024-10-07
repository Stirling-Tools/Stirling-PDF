package stirling.software.SPDF.config.security.saml;

import java.security.cert.CertificateException;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.saml2.provider.service.registration.InMemoryRelyingPartyRegistrationRepository;
import org.springframework.security.saml2.provider.service.registration.RelyingPartyRegistration;
import org.springframework.security.saml2.provider.service.registration.RelyingPartyRegistrationRepository;
import org.springframework.security.saml2.provider.service.registration.RelyingPartyRegistrations;

import lombok.extern.slf4j.Slf4j;
import stirling.software.SPDF.model.ApplicationProperties;

@Configuration
@Slf4j
public class SamlConfig {

    @Autowired ApplicationProperties applicationProperties;

    @Bean
    @ConditionalOnProperty(
            value = "security.saml.enabled",
            havingValue = "true",
            matchIfMissing = false)
    public RelyingPartyRegistrationRepository relyingPartyRegistrationRepository()
            throws CertificateException {
        RelyingPartyRegistration registration =
                RelyingPartyRegistrations.fromMetadataLocation(
                                applicationProperties
                                        .getSecurity()
                                        .getSaml()
                                        .getIdpMetadataLocation())
                        .entityId(applicationProperties.getSecurity().getSaml().getEntityId())
                        .registrationId(
                                applicationProperties.getSecurity().getSaml().getRegistrationId())
                        .build();
        return new InMemoryRelyingPartyRegistrationRepository(registration);
    }
}
