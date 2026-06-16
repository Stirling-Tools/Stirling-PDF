package stirling.software.proprietary.security.saml2;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNotSame;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.verifyNoInteractions;

import java.io.OutputStreamWriter;
import java.math.BigInteger;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.Security;
import java.security.cert.X509Certificate;
import java.util.Date;

import org.bouncycastle.asn1.x500.X500Name;
import org.bouncycastle.cert.X509CertificateHolder;
import org.bouncycastle.cert.jcajce.JcaX509CertificateConverter;
import org.bouncycastle.cert.jcajce.JcaX509v3CertificateBuilder;
import org.bouncycastle.jce.provider.BouncyCastleProvider;
import org.bouncycastle.operator.ContentSigner;
import org.bouncycastle.operator.jcajce.JcaContentSignerBuilder;
import org.bouncycastle.util.io.pem.PemObject;
import org.bouncycastle.util.io.pem.PemWriter;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.security.saml2.provider.service.registration.RelyingPartyRegistration;
import org.springframework.security.saml2.provider.service.registration.RelyingPartyRegistrationRepository;
import org.springframework.security.saml2.provider.service.registration.Saml2MessageBinding;
import org.springframework.security.saml2.provider.service.web.authentication.OpenSaml5AuthenticationRequestResolver;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.model.ApplicationProperties.Security.SAML2;

@DisplayName("Saml2Configuration")
class Saml2ConfigurationTest {

    private static final String REGISTRATION_ID = "stirling";
    private static final String IDP_ISSUER = "https://idp.example.com/issuer";
    private static final String IDP_LOGIN = "https://idp.example.com/sso";
    private static final String IDP_LOGOUT = "https://idp.example.com/slo";
    private static final String BACKEND_URL = "https://api.example.com";

    // Generating an RSA keypair + self-signed cert is expensive; build once and reuse.
    private static X509Certificate cert;
    private static KeyPair keyPair;

    @TempDir Path tempDir;

    private Path certPem;
    private Path keyPem;
    private Path missingFile;

    @BeforeAll
    static void buildCryptoFixtures() throws Exception {
        if (Security.getProvider("BC") == null) {
            Security.addProvider(new BouncyCastleProvider());
        }
        KeyPairGenerator kpg = KeyPairGenerator.getInstance("RSA");
        kpg.initialize(2048);
        keyPair = kpg.generateKeyPair();
        cert = selfSignedCert(keyPair);
    }

    private static X509Certificate selfSignedCert(KeyPair kp) throws Exception {
        X500Name subject = new X500Name("CN=Saml2ConfigTest, O=Stirling, C=US");
        Date notBefore = new Date(System.currentTimeMillis() - 1000);
        Date notAfter = new Date(System.currentTimeMillis() + 86_400_000L);
        JcaX509v3CertificateBuilder builder =
                new JcaX509v3CertificateBuilder(
                        subject,
                        BigInteger.valueOf(System.currentTimeMillis()),
                        notBefore,
                        notAfter,
                        subject,
                        kp.getPublic());
        ContentSigner signer =
                new JcaContentSignerBuilder("SHA256WithRSA")
                        .setProvider("BC")
                        .build(kp.getPrivate());
        X509CertificateHolder holder = builder.build(signer);
        return new JcaX509CertificateConverter().setProvider("BC").getCertificate(holder);
    }

    // Writes a PEM block CertificateUtils can read (CERTIFICATE -> X509, PRIVATE KEY -> PKCS#8).
    private static void writePem(Path target, String type, byte[] der) throws Exception {
        try (PemWriter writer =
                new PemWriter(
                        new OutputStreamWriter(
                                Files.newOutputStream(target), StandardCharsets.UTF_8))) {
            writer.writeObject(new PemObject(type, der));
        }
    }

    @BeforeEach
    void setUp() throws Exception {
        certPem = tempDir.resolve("cert.pem");
        keyPem = tempDir.resolve("key.pem");
        missingFile = tempDir.resolve("does-not-exist.pem");
        writePem(certPem, "CERTIFICATE", cert.getEncoded());
        writePem(keyPem, "PRIVATE KEY", keyPair.getPrivate().getEncoded());
    }

    // Builds an ApplicationProperties wired for a working SAML2 setup. Individual tests mutate it.
    private ApplicationProperties propsWithValidCredentials() {
        ApplicationProperties props = new ApplicationProperties();
        SAML2 saml2 = props.getSecurity().getSaml2();
        saml2.setRegistrationId(REGISTRATION_ID);
        saml2.setIdpIssuer(IDP_ISSUER);
        saml2.setIdpSingleLoginUrl(IDP_LOGIN);
        saml2.setIdpSingleLogoutUrl(IDP_LOGOUT);
        saml2.setIdpCert(certPem.toString());
        saml2.setSpCert(certPem.toString());
        saml2.setPrivateKey(keyPem.toString());
        props.getSystem().setBackendUrl(BACKEND_URL);
        return props;
    }

    private Saml2Configuration configFor(ApplicationProperties props) {
        return new Saml2Configuration(props);
    }

    @Nested
    @DisplayName("relyingPartyRegistrations - happy path")
    class HappyPath {

        @Test
        @DisplayName("returns a repository containing the configured registration id")
        void buildsRegistrationForConfiguredId() throws Exception {
            Saml2Configuration config = configFor(propsWithValidCredentials());

            RelyingPartyRegistrationRepository repo = config.relyingPartyRegistrations();

            assertNotNull(repo);
            RelyingPartyRegistration rp = repo.findByRegistrationId(REGISTRATION_ID);
            assertNotNull(rp);
            assertEquals(REGISTRATION_ID, rp.getRegistrationId());
        }

        @Test
        @DisplayName("entity id and ACS location are derived from the configured backend URL")
        void usesConfiguredBackendUrlForEndpoints() throws Exception {
            RelyingPartyRegistration rp =
                    configFor(propsWithValidCredentials())
                            .relyingPartyRegistrations()
                            .findByRegistrationId(REGISTRATION_ID);

            assertEquals(
                    BACKEND_URL + "/saml2/service-provider-metadata/" + REGISTRATION_ID,
                    rp.getEntityId());
            assertEquals(
                    BACKEND_URL + "/login/saml2/sso/{registrationId}",
                    rp.getAssertionConsumerServiceLocation());
            assertEquals(Saml2MessageBinding.POST, rp.getAssertionConsumerServiceBinding());
        }

        @Test
        @DisplayName("single logout response location points at the backend /login endpoint")
        void singleLogoutResponseLocationUsesBackendLogin() throws Exception {
            RelyingPartyRegistration rp =
                    configFor(propsWithValidCredentials())
                            .relyingPartyRegistrations()
                            .findByRegistrationId(REGISTRATION_ID);

            assertEquals(BACKEND_URL + "/login", rp.getSingleLogoutServiceResponseLocation());
            assertEquals(IDP_LOGOUT, rp.getSingleLogoutServiceLocation());
            assertEquals(Saml2MessageBinding.POST, rp.getSingleLogoutServiceBinding());
        }

        @Test
        @DisplayName("authn requests are configured as signed")
        void authnRequestsSigned() throws Exception {
            RelyingPartyRegistration rp =
                    configFor(propsWithValidCredentials())
                            .relyingPartyRegistrations()
                            .findByRegistrationId(REGISTRATION_ID);

            assertTrue(rp.isAuthnRequestsSigned());
        }

        @Test
        @DisplayName("asserting party metadata carries the IdP issuer and SSO location")
        void assertingPartyMetadataPopulated() throws Exception {
            RelyingPartyRegistration rp =
                    configFor(propsWithValidCredentials())
                            .relyingPartyRegistrations()
                            .findByRegistrationId(REGISTRATION_ID);

            assertEquals(IDP_ISSUER, rp.getAssertingPartyMetadata().getEntityId());
            assertEquals(
                    IDP_LOGIN, rp.getAssertingPartyMetadata().getSingleSignOnServiceLocation());
            assertEquals(
                    Saml2MessageBinding.POST,
                    rp.getAssertingPartyMetadata().getSingleSignOnServiceBinding());
            assertTrue(rp.getAssertingPartyMetadata().getWantAuthnRequestsSigned());
        }

        @Test
        @DisplayName("signing and verification credentials are present")
        void credentialsPresent() throws Exception {
            RelyingPartyRegistration rp =
                    configFor(propsWithValidCredentials())
                            .relyingPartyRegistrations()
                            .findByRegistrationId(REGISTRATION_ID);

            assertFalse(rp.getSigningX509Credentials().isEmpty());
            assertFalse(rp.getAssertingPartyMetadata().getVerificationX509Credentials().isEmpty());
        }

        @Test
        @DisplayName("honors a custom registration id")
        void honorsCustomRegistrationId() throws Exception {
            ApplicationProperties props = propsWithValidCredentials();
            props.getSecurity().getSaml2().setRegistrationId("acme-okta");

            RelyingPartyRegistrationRepository repo = configFor(props).relyingPartyRegistrations();

            assertNotNull(repo.findByRegistrationId("acme-okta"));
            assertEquals(
                    BACKEND_URL + "/saml2/service-provider-metadata/acme-okta",
                    repo.findByRegistrationId("acme-okta").getEntityId());
        }
    }

    @Nested
    @DisplayName("relyingPartyRegistrations - backend URL fallback")
    class BackendUrlFallback {

        @Test
        @DisplayName("falls back to {baseUrl} placeholder when backend URL is null")
        void nullBackendUrlFallsBackToPlaceholder() throws Exception {
            ApplicationProperties props = propsWithValidCredentials();
            props.getSystem().setBackendUrl(null);

            RelyingPartyRegistration rp =
                    configFor(props)
                            .relyingPartyRegistrations()
                            .findByRegistrationId(REGISTRATION_ID);

            assertEquals(
                    "{baseUrl}/saml2/service-provider-metadata/" + REGISTRATION_ID,
                    rp.getEntityId());
        }

        @Test
        @DisplayName("falls back to {baseUrl} placeholder when backend URL is blank")
        void blankBackendUrlFallsBackToPlaceholder() throws Exception {
            ApplicationProperties props = propsWithValidCredentials();
            props.getSystem().setBackendUrl("   ");

            RelyingPartyRegistration rp =
                    configFor(props)
                            .relyingPartyRegistrations()
                            .findByRegistrationId(REGISTRATION_ID);

            assertTrue(rp.getEntityId().startsWith("{baseUrl}/saml2/service-provider-metadata/"));
            assertEquals("{baseUrl}/login", rp.getSingleLogoutServiceResponseLocation());
        }
    }

    @Nested
    @DisplayName("relyingPartyRegistrations - error branches")
    class ErrorBranches {

        @Test
        @DisplayName("missing IdP certificate file is wrapped in IllegalStateException")
        void missingIdpCertFails() {
            ApplicationProperties props = propsWithValidCredentials();
            props.getSecurity().getSaml2().setIdpCert(missingFile.toString());

            Saml2Configuration config = configFor(props);

            IllegalStateException ex =
                    assertThrows(IllegalStateException.class, config::relyingPartyRegistrations);
            // Inner "file does not exist" check is rethrown wrapped by the IdP cert catch block.
            assertEquals("Failed to load SAML2 IdP certificate", ex.getMessage());
        }

        @Test
        @DisplayName("unreadable IdP certificate content is wrapped in IllegalStateException")
        void unreadableIdpCertFails() throws Exception {
            ApplicationProperties props = propsWithValidCredentials();
            Path garbage = tempDir.resolve("garbage-cert.pem");
            Files.write(garbage, "not a real certificate".getBytes(StandardCharsets.UTF_8));
            props.getSecurity().getSaml2().setIdpCert(garbage.toString());

            Saml2Configuration config = configFor(props);

            IllegalStateException ex =
                    assertThrows(IllegalStateException.class, config::relyingPartyRegistrations);
            assertEquals("Failed to load SAML2 IdP certificate", ex.getMessage());
        }

        @Test
        @DisplayName("missing SP private key file fails before building the registration")
        void missingPrivateKeyFails() {
            ApplicationProperties props = propsWithValidCredentials();
            props.getSecurity().getSaml2().setPrivateKey(missingFile.toString());

            Saml2Configuration config = configFor(props);

            IllegalStateException ex =
                    assertThrows(IllegalStateException.class, config::relyingPartyRegistrations);
            assertTrue(
                    ex.getMessage().startsWith("SAML2 SP private key file does not exist:"),
                    "Unexpected message: " + ex.getMessage());
        }

        @Test
        @DisplayName("missing SP certificate file fails before building the registration")
        void missingSpCertFails() {
            ApplicationProperties props = propsWithValidCredentials();
            props.getSecurity().getSaml2().setSpCert(missingFile.toString());

            Saml2Configuration config = configFor(props);

            IllegalStateException ex =
                    assertThrows(IllegalStateException.class, config::relyingPartyRegistrations);
            assertTrue(
                    ex.getMessage().startsWith("SAML2 SP certificate file does not exist:"),
                    "Unexpected message: " + ex.getMessage());
        }

        @Test
        @DisplayName("unreadable SP private key content is wrapped in IllegalStateException")
        void unreadablePrivateKeyFails() throws Exception {
            ApplicationProperties props = propsWithValidCredentials();
            Path garbageKey = tempDir.resolve("garbage-key.pem");
            Files.write(garbageKey, "not a real key".getBytes(StandardCharsets.UTF_8));
            props.getSecurity().getSaml2().setPrivateKey(garbageKey.toString());

            Saml2Configuration config = configFor(props);

            IllegalStateException ex =
                    assertThrows(IllegalStateException.class, config::relyingPartyRegistrations);
            assertEquals("Failed to load SAML2 SP credentials", ex.getMessage());
        }
    }

    @Nested
    @DisplayName("authenticationRequestResolver")
    class AuthenticationRequestResolver {

        @Test
        @DisplayName("returns a non-null resolver for the given repository")
        void returnsResolver() {
            Saml2Configuration config = configFor(propsWithValidCredentials());
            RelyingPartyRegistrationRepository repo =
                    org.mockito.Mockito.mock(RelyingPartyRegistrationRepository.class);

            OpenSaml5AuthenticationRequestResolver resolver =
                    config.authenticationRequestResolver(repo);

            assertNotNull(resolver);
        }

        @Test
        @DisplayName("does not touch the repository at construction time (lazy resolution)")
        void doesNotTouchRepositoryOnConstruction() {
            Saml2Configuration config = configFor(propsWithValidCredentials());
            RelyingPartyRegistrationRepository repo =
                    org.mockito.Mockito.mock(RelyingPartyRegistrationRepository.class);

            config.authenticationRequestResolver(repo);

            verifyNoInteractions(repo);
        }

        @Test
        @DisplayName("produces a fresh resolver instance on each invocation")
        void freshInstancePerCall() {
            Saml2Configuration config = configFor(propsWithValidCredentials());
            RelyingPartyRegistrationRepository repo =
                    org.mockito.Mockito.mock(RelyingPartyRegistrationRepository.class);

            OpenSaml5AuthenticationRequestResolver first =
                    config.authenticationRequestResolver(repo);
            OpenSaml5AuthenticationRequestResolver second =
                    config.authenticationRequestResolver(repo);

            assertNotSame(first, second);
        }
    }

    @Nested
    @DisplayName("bean wiring")
    class BeanWiring {

        @Test
        @DisplayName("repository bean is rebuilt on each call (not cached on the config object)")
        void repositoryRebuiltEachCall() throws Exception {
            Saml2Configuration config = configFor(propsWithValidCredentials());

            RelyingPartyRegistrationRepository first = config.relyingPartyRegistrations();
            RelyingPartyRegistrationRepository second = config.relyingPartyRegistrations();

            assertNotSame(first, second);
            assertEquals(
                    first.findByRegistrationId(REGISTRATION_ID).getRegistrationId(),
                    second.findByRegistrationId(REGISTRATION_ID).getRegistrationId());
        }
    }
}
