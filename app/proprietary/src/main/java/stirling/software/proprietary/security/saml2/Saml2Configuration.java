package stirling.software.proprietary.security.saml2;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.security.cert.CertificateException;
import java.security.cert.CertificateFactory;
import java.security.cert.X509Certificate;
import java.util.Base64;
import java.util.Collections;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.Consumer;

import javax.xml.XMLConstants;
import javax.xml.parsers.DocumentBuilder;
import javax.xml.parsers.DocumentBuilderFactory;
import javax.xml.parsers.ParserConfigurationException;

import org.opensaml.saml.saml2.core.AuthnRequest;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.io.Resource;
import org.springframework.security.saml2.core.Saml2X509Credential;
import org.springframework.security.saml2.core.Saml2X509Credential.Saml2X509CredentialType;
import org.springframework.security.saml2.provider.service.authentication.Saml2PostAuthenticationRequest;
import org.springframework.security.saml2.provider.service.registration.InMemoryRelyingPartyRegistrationRepository;
import org.springframework.security.saml2.provider.service.registration.RelyingPartyRegistration;
import org.springframework.security.saml2.provider.service.registration.RelyingPartyRegistrationRepository;
import org.springframework.security.saml2.provider.service.registration.Saml2MessageBinding;
import org.springframework.security.saml2.provider.service.web.Saml2AuthenticationRequestRepository;
import org.springframework.security.saml2.provider.service.web.authentication.OpenSaml4AuthenticationRequestResolver;
import org.w3c.dom.Document;
import org.w3c.dom.Element;
import org.w3c.dom.NodeList;
import org.xml.sax.SAXException;

import jakarta.servlet.http.HttpServletRequest;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.model.ApplicationProperties.Security.SAML2;
import stirling.software.common.util.GeneralUtils;
import stirling.software.proprietary.security.service.JwtServiceInterface;

@Configuration
@Slf4j
@ConditionalOnProperty(value = "security.saml2.enabled", havingValue = "true")
@RequiredArgsConstructor
public class Saml2Configuration {

    private static final String SAML_METADATA_NS = "urn:oasis:names:tc:SAML:2.0:metadata";
    private static final String XML_DSIG_NS = "http://www.w3.org/2000/09/xmldsig#";

    private final ApplicationProperties applicationProperties;

    @Bean
    @ConditionalOnProperty(name = "security.saml2.enabled", havingValue = "true")
    public RelyingPartyRegistrationRepository relyingPartyRegistrations() {
        SAML2 samlConf = applicationProperties.getSecurity().getSaml2();
        Optional<IdpMetadataInfo> metadataInfo = loadIdpMetadata(samlConf);

        log.info(
                "Initializing SAML2 configuration with registration ID: {}",
                samlConf.getRegistrationId());

        // Load IdP certificate either from metadata or fallback resource
        X509Certificate idpCert =
                metadataInfo
                        .map(IdpMetadataInfo::signingCertificate)
                        .orElseGet(() -> loadIdpCertificateFromResource(samlConf));

        Saml2X509Credential verificationCredential = Saml2X509Credential.verification(idpCert);

        // Load SP private key and certificate
        Resource privateKeyResource = samlConf.getSp().getPrivateKeyResource();
        Resource certificateResource = samlConf.getSp().getCertResource();

        log.debug("Loading SP private key from: {}", privateKeyResource.getDescription());
        if (!privateKeyResource.exists()) {
            log.error("SAML2 SP private key not found at: {}", privateKeyResource.getDescription());
            throw new IllegalStateException(
                    "SAML2 SP private key file does not exist: "
                            + privateKeyResource.getDescription());
        }

        log.debug("Loading SP certificate from: {}", certificateResource.getDescription());
        if (!certificateResource.exists()) {
            log.error(
                    "SAML2 SP certificate not found at: {}", certificateResource.getDescription());
            throw new IllegalStateException(
                    "SAML2 SP certificate file does not exist: "
                            + certificateResource.getDescription());
        }

        Saml2X509Credential signingCredential;
        try {
            signingCredential =
                    new Saml2X509Credential(
                            CertificateUtils.readPrivateKey(privateKeyResource),
                            CertificateUtils.readCertificate(certificateResource),
                            Saml2X509CredentialType.SIGNING);
            log.info("Successfully loaded SP credentials");
        } catch (Exception e) {
            log.error("Failed to load SAML2 SP credentials: {}", e.getMessage(), e);
            throw new IllegalStateException("Failed to load SAML2 SP credentials", e);
        }
        // Apply metadata overrides - metadata takes precedence over manual config
        metadataInfo.ifPresent(info -> applyMetadataOverrides(samlConf, info));

        // Get IdP configuration - prefer values from metadata, fall back to manual config
        String idpEntityId =
                metadataInfo
                        .map(IdpMetadataInfo::entityId)
                        .filter(id -> id != null && !id.isBlank())
                        .orElseGet(() -> samlConf.getProvider().getEntityId());

        String idpSingleLoginUrl =
                metadataInfo
                        .map(IdpMetadataInfo::singleSignOnServiceUrl)
                        .filter(url -> url != null && !url.isBlank())
                        .orElseGet(() -> samlConf.getProvider().getSingleLoginUrl());

        String idpSingleLogoutUrl =
                metadataInfo
                        .map(IdpMetadataInfo::singleLogoutServiceUrl)
                        .filter(url -> url != null && !url.isBlank())
                        .orElseGet(() -> samlConf.getProvider().getSingleLogoutUrl());

        // Validate required IdP configuration
        if (idpEntityId == null || idpEntityId.isBlank()) {
            throw new IllegalStateException(
                    "SAML2 IdP Entity ID is required. Set security.saml2.entityId or provide security.saml2.metadataUri");
        }
        if (idpSingleLoginUrl == null || idpSingleLoginUrl.isBlank()) {
            throw new IllegalStateException(
                    "SAML2 IdP Single Sign-On URL is required. Set security.saml2.provider.singleLoginUrl or provide security.saml2.metadataUri");
        }

        log.info(
                "SAML2 IdP configuration: entityId={}, ssoUrl={}, sloUrl={}",
                idpEntityId,
                idpSingleLoginUrl,
                idpSingleLogoutUrl);

        // Get backend URL from configuration (for SAML endpoints)
        String backendUrl = applicationProperties.getSystem().getBackendUrl();
        if (backendUrl == null || backendUrl.isBlank()) {
            backendUrl = "{baseUrl}"; // Fallback to Spring's auto-resolution
            log.warn(
                    "system.backendUrl not configured - SAML metadata will use request-based URLs. Set system.backendUrl for production use.");
        } else {
            log.info("Using configured backend URL for SAML: {}", backendUrl);
        }

        String entityId =
                backendUrl + "/saml2/service-provider-metadata/" + samlConf.getRegistrationId();
        String acsLocation = backendUrl + "/login/saml2/sso/{registrationId}";
        // SP's Single Logout Service endpoint (where SP receives logout requests/responses from
        // IdP)
        String spSloLocation = backendUrl + "/logout/saml2/slo";

        RelyingPartyRegistration rp =
                RelyingPartyRegistration.withRegistrationId(samlConf.getRegistrationId())
                        .signingX509Credentials(c -> c.add(signingCredential))
                        .entityId(entityId)
                        .singleLogoutServiceBinding(Saml2MessageBinding.POST)
                        .singleLogoutServiceLocation(spSloLocation)
                        .singleLogoutServiceResponseLocation(spSloLocation)
                        .assertionConsumerServiceBinding(Saml2MessageBinding.POST)
                        .assertionConsumerServiceLocation(acsLocation)
                        .authnRequestsSigned(true)
                        .assertingPartyMetadata(
                                metadata ->
                                        metadata.entityId(idpEntityId)
                                                .verificationX509Credentials(
                                                        c -> c.add(verificationCredential))
                                                .singleSignOnServiceBinding(
                                                        Saml2MessageBinding.POST)
                                                .singleSignOnServiceLocation(idpSingleLoginUrl)
                                                .singleLogoutServiceBinding(
                                                        Saml2MessageBinding.POST)
                                                .singleLogoutServiceLocation(idpSingleLogoutUrl)
                                                .wantAuthnRequestsSigned(true))
                        .build();

        log.info(
                "SAML2 configuration initialized successfully. Registration ID: {}, IdP: {}",
                samlConf.getRegistrationId(),
                idpEntityId);
        return new InMemoryRelyingPartyRegistrationRepository(rp);
    }

    @Bean
    @ConditionalOnProperty(name = "security.saml2.enabled", havingValue = "true")
    public Saml2AuthenticationRequestRepository<Saml2PostAuthenticationRequest>
            saml2AuthenticationRequestRepository(
                    JwtServiceInterface jwtService,
                    RelyingPartyRegistrationRepository relyingPartyRegistrationRepository) {
        return new JwtSaml2AuthenticationRequestRepository(
                new ConcurrentHashMap<>(), jwtService, relyingPartyRegistrationRepository);
    }

    @Bean
    @ConditionalOnProperty(name = "security.saml2.enabled", havingValue = "true")
    public OpenSaml4AuthenticationRequestResolver authenticationRequestResolver(
            RelyingPartyRegistrationRepository relyingPartyRegistrationRepository,
            Saml2AuthenticationRequestRepository<Saml2PostAuthenticationRequest>
                    saml2AuthenticationRequestRepository) {
        OpenSaml4AuthenticationRequestResolver resolver =
                new OpenSaml4AuthenticationRequestResolver(relyingPartyRegistrationRepository);

        resolver.setAuthnRequestCustomizer(
                customizer -> {
                    HttpServletRequest request = customizer.getRequest();
                    AuthnRequest authnRequest = customizer.getAuthnRequest();
                    Saml2PostAuthenticationRequest saml2AuthenticationRequest =
                            saml2AuthenticationRequestRepository.loadAuthenticationRequest(request);

                    if (saml2AuthenticationRequest != null) {
                        String sessionId = request.getSession(false).getId();

                        log.debug(
                                "Retrieving SAML 2 authentication request ID from the current HTTP session {}",
                                sessionId);

                        String authenticationRequestId = saml2AuthenticationRequest.getId();

                        if (!authenticationRequestId.isBlank()) {
                            authnRequest.setID(authenticationRequestId);
                        } else {
                            log.warn(
                                    "No authentication request found for HTTP session {}. Generating new ID",
                                    sessionId);
                            authnRequest.setID("ARQ" + UUID.randomUUID().toString().substring(1));
                        }
                    } else {
                        log.debug("Generating new authentication request ID");
                        authnRequest.setID("ARQ" + UUID.randomUUID().toString().substring(1));
                    }
                    logAuthnRequestDetails(authnRequest);
                    logHttpRequestDetails(request);
                });
        return resolver;
    }

    private X509Certificate loadIdpCertificateFromResource(SAML2 samlConf) {
        try {
            Resource idpCertResource = samlConf.getProvider().getCertResource();
            if (idpCertResource == null) {
                throw new IllegalStateException("SAML2 IdP certificate resource is not defined");
            }
            log.info("Loading IdP certificate from: {}", idpCertResource.getDescription());
            if (!idpCertResource.exists()) {
                throw new IllegalStateException(
                        "SAML2 IdP certificate file does not exist: "
                                + idpCertResource.getDescription());
            }
            X509Certificate certificate = CertificateUtils.readCertificate(idpCertResource);
            log.info(
                    "Successfully loaded IdP certificate. Subject: {}",
                    certificate.getSubjectX500Principal().getName());
            return certificate;
        } catch (Exception e) {
            log.error("Failed to load SAML2 IdP certificate: {}", e.getMessage(), e);
            throw new IllegalStateException("Failed to load SAML2 IdP certificate", e);
        }
    }

    private void applyMetadataOverrides(SAML2 samlConf, IdpMetadataInfo metadataInfo) {
        log.info(
                "Applying IdP metadata overrides for registration: {}",
                samlConf.getRegistrationId());
        SAML2.Provider provider = samlConf.getProvider();
        overrideIfPresent(metadataInfo.entityId(), provider::setEntityId);
        overrideIfPresent(metadataInfo.singleSignOnServiceUrl(), provider::setSingleLoginUrl);
        overrideIfPresent(metadataInfo.singleLogoutServiceUrl(), provider::setSingleLogoutUrl);

        // Persist discovered metadata values to settings.yml
        persistMetadataToSettings(metadataInfo);
    }

    /**
     * Persists IdP metadata discovered values to settings.yml. This ensures the discovered
     * configuration is saved for future reference and survives restarts even if the metadata
     * endpoint becomes unavailable.
     */
    private void persistMetadataToSettings(IdpMetadataInfo metadataInfo) {
        log.info(
                "Migrating discovered IdP metadata to SAML configuration. Existing configuration will be overridden.");

        try {
            boolean anyPersisted = false;

            if (hasText(metadataInfo.entityId())) {
                GeneralUtils.saveKeyToSettings(
                        "security.saml2.provider.entityId", metadataInfo.entityId());
                log.info("  -> Persisted provider.entityId: {}", metadataInfo.entityId());
                anyPersisted = true;
            }

            if (hasText(metadataInfo.singleSignOnServiceUrl())) {
                GeneralUtils.saveKeyToSettings(
                        "security.saml2.provider.singleLoginUrl",
                        metadataInfo.singleSignOnServiceUrl());
                log.info(
                        "  -> Persisted provider.singleLoginUrl: {}",
                        metadataInfo.singleSignOnServiceUrl());
                anyPersisted = true;
            }

            if (hasText(metadataInfo.singleLogoutServiceUrl())) {
                GeneralUtils.saveKeyToSettings(
                        "security.saml2.provider.singleLogoutUrl",
                        metadataInfo.singleLogoutServiceUrl());
                log.info(
                        "  -> Persisted provider.singleLogoutUrl: {}",
                        metadataInfo.singleLogoutServiceUrl());
                anyPersisted = true;
            }

            if (anyPersisted) {
                log.info(
                        "IdP metadata successfully persisted to settings.yml. These values will be used as fallback if metadataUri becomes unavailable.");
            }
        } catch (Exception e) {
            log.warn(
                    "Failed to persist IdP metadata to settings.yml: {}. SAML will still work but discovered values won't be saved.",
                    e.getMessage());
        }
    }

    private Optional<IdpMetadataInfo> loadIdpMetadata(SAML2 samlConf) {
        String metadataLocation = samlConf.getEffectiveMetadataUri();
        if (metadataLocation == null || metadataLocation.isBlank()) {
            return Optional.empty();
        }

        try (InputStream metadataStream = samlConf.getMetadataUriAsStream()) {
            DocumentBuilderFactory factory = DocumentBuilderFactory.newInstance();
            factory.setNamespaceAware(true);

            // XXE prevention - disable all external entities and DTD processing
            factory.setFeature(XMLConstants.FEATURE_SECURE_PROCESSING, true);
            factory.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);
            factory.setFeature("http://xml.org/sax/features/external-general-entities", false);
            factory.setFeature("http://xml.org/sax/features/external-parameter-entities", false);
            factory.setFeature(
                    "http://apache.org/xml/features/nonvalidating/load-external-dtd", false);
            factory.setXIncludeAware(false);
            factory.setExpandEntityReferences(false);
            factory.setAttribute(XMLConstants.ACCESS_EXTERNAL_DTD, "");
            factory.setAttribute(XMLConstants.ACCESS_EXTERNAL_SCHEMA, "");

            DocumentBuilder builder = factory.newDocumentBuilder();
            Document doc = builder.parse(metadataStream);

            Element entityDescriptor = doc.getDocumentElement();
            if (entityDescriptor == null) {
                log.warn("No EntityDescriptor found in SAML metadata: {}", metadataLocation);
                return Optional.empty();
            }

            String entityId = entityDescriptor.getAttribute("entityID");
            NodeList idpDescriptors =
                    entityDescriptor.getElementsByTagNameNS(SAML_METADATA_NS, "IDPSSODescriptor");
            if (idpDescriptors.getLength() == 0) {
                log.warn("No IDPSSODescriptor found in SAML metadata: {}", metadataLocation);
                return Optional.empty();
            }

            Element idpDescriptor = (Element) idpDescriptors.item(0);
            String ssoUrl = extractServiceLocation(idpDescriptor, "SingleSignOnService");
            String sloUrl = extractServiceLocation(idpDescriptor, "SingleLogoutService");
            X509Certificate signingCert = extractSigningCertificate(idpDescriptor);

            log.info("Loaded IdP metadata from: {}", metadataLocation);
            return Optional.of(new IdpMetadataInfo(entityId, ssoUrl, sloUrl, signingCert));
        } catch (IOException
                | ParserConfigurationException
                | SAXException
                | CertificateException e) {
            log.warn("Failed to parse SAML metadata from {}: {}", metadataLocation, e.getMessage());
            return Optional.empty();
        }
    }

    private String extractServiceLocation(Element descriptor, String tagName) {
        NodeList services = descriptor.getElementsByTagNameNS(SAML_METADATA_NS, tagName);
        String fallback = null;
        for (int i = 0; i < services.getLength(); i++) {
            Element service = (Element) services.item(i);
            String location = service.getAttribute("Location");
            String binding = service.getAttribute("Binding");
            if (!hasText(location)) {
                continue;
            }
            if (Saml2MessageBinding.POST.getUrn().equals(binding)) {
                return location;
            }
            if (fallback == null) {
                fallback = location;
            }
        }
        return fallback;
    }

    private X509Certificate extractSigningCertificate(Element descriptor)
            throws CertificateException {
        NodeList keyDescriptors =
                descriptor.getElementsByTagNameNS(SAML_METADATA_NS, "KeyDescriptor");
        for (int i = 0; i < keyDescriptors.getLength(); i++) {
            Element keyDescriptor = (Element) keyDescriptors.item(i);
            String use = keyDescriptor.getAttribute("use");
            if (hasText(use) && !"signing".equalsIgnoreCase(use)) {
                continue;
            }

            NodeList certificateNodes =
                    keyDescriptor.getElementsByTagNameNS(XML_DSIG_NS, "X509Certificate");
            if (certificateNodes.getLength() == 0) {
                continue;
            }
            String certificateValue = certificateNodes.item(0).getTextContent();
            if (!hasText(certificateValue)) {
                continue;
            }
            byte[] decoded =
                    Base64.getMimeDecoder().decode(certificateValue.replaceAll("\\s+", ""));
            CertificateFactory certificateFactory = CertificateFactory.getInstance("X.509");
            return (X509Certificate)
                    certificateFactory.generateCertificate(new ByteArrayInputStream(decoded));
        }
        return null;
    }

    private boolean hasText(String value) {
        return value != null && !value.trim().isEmpty();
    }

    private void overrideIfPresent(String value, Consumer<String> setter) {
        if (hasText(value)) {
            setter.accept(value.trim());
        }
    }

    private record IdpMetadataInfo(
            String entityId,
            String singleSignOnServiceUrl,
            String singleLogoutServiceUrl,
            X509Certificate signingCertificate) {}

    private static void logAuthnRequestDetails(AuthnRequest authnRequest) {
        String message =
                """
                        AuthnRequest:

                        ID: {}
                        Issuer: {}
                        IssueInstant: {}
                        AssertionConsumerService (ACS) URL: {}
                        """;
        log.debug(
                message,
                authnRequest.getID(),
                authnRequest.getIssuer() != null ? authnRequest.getIssuer().getValue() : null,
                authnRequest.getIssueInstant(),
                authnRequest.getAssertionConsumerServiceURL());

        if (authnRequest.getNameIDPolicy() != null) {
            log.debug("NameIDPolicy Format: {}", authnRequest.getNameIDPolicy().getFormat());
        }
    }

    private static void logHttpRequestDetails(HttpServletRequest request) {
        log.debug("HTTP Headers: ");
        Collections.list(request.getHeaderNames())
                .forEach(
                        headerName ->
                                log.debug("{}: {}", headerName, request.getHeader(headerName)));
        String message =
                """
                        HTTP Request Method: {}
                        Session ID: {}
                        Request Path: {}
                        Query String: {}
                        Remote Address: {}

                        SAML Request Parameters:

                        SAMLRequest: {}
                        RelayState: {}
                        """;
        log.debug(
                message,
                request.getMethod(),
                request.getSession().getId(),
                request.getRequestURI(),
                request.getQueryString(),
                request.getRemoteAddr(),
                request.getParameter("SAMLRequest"),
                request.getParameter("RelayState"));
    }
}
