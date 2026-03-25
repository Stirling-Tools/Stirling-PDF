package stirling.software.proprietary.workflow.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.math.BigInteger;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.KeyStore;
import java.security.SecureRandom;
import java.security.cert.Certificate;
import java.security.cert.X509Certificate;
import java.util.Date;
import java.util.Optional;

import org.bouncycastle.cert.jcajce.JcaX509CertificateConverter;
import org.bouncycastle.cert.jcajce.JcaX509v3CertificateBuilder;
import org.bouncycastle.jce.provider.BouncyCastleProvider;
import org.bouncycastle.operator.ContentSigner;
import org.bouncycastle.operator.jcajce.JcaContentSignerBuilder;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.model.ApplicationProperties.AutomaticallyGenerated;
import stirling.software.proprietary.security.database.repository.UserRepository;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.workflow.model.UserServerCertificateEntity;
import stirling.software.proprietary.workflow.repository.UserServerCertificateRepository;

@ExtendWith(MockitoExtension.class)
class UserServerCertificateServiceTest {

    @Mock private UserServerCertificateRepository certificateRepository;
    @Mock private UserRepository userRepository;

    private MetadataEncryptionService encryptionService;
    private UserServerCertificateService service;

    @BeforeEach
    void setUp() {
        AutomaticallyGenerated generated = new AutomaticallyGenerated();
        generated.setKey("test-key-for-unit-tests-only");
        ApplicationProperties props = new ApplicationProperties();
        props.setAutomaticallyGenerated(generated);

        encryptionService = new MetadataEncryptionService(props);
        service =
                new UserServerCertificateService(
                        certificateRepository, userRepository, encryptionService);
    }

    private User user(long id) {
        User u = new User();
        u.setId(id);
        u.setUsername("user" + id);
        return u;
    }

    // -------------------------------------------------------------------------
    // generateUserCertificate — password must be stored encrypted
    // -------------------------------------------------------------------------

    @Test
    void generateUserCertificate_keystorePasswordStoredEncrypted() throws Exception {
        User user = user(1L);
        when(certificateRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        service.generateUserCertificate(user);

        ArgumentCaptor<UserServerCertificateEntity> captor =
                ArgumentCaptor.forClass(UserServerCertificateEntity.class);
        verify(certificateRepository).save(captor.capture());

        String stored = captor.getValue().getKeystorePassword();
        assertThat(stored).startsWith(MetadataEncryptionService.ENC_PREFIX);
        // The raw predictable prefix must not appear in the stored value
        assertThat(stored).doesNotContain("stirling-user-cert-");
    }

    // -------------------------------------------------------------------------
    // uploadUserCertificate — password must be stored encrypted
    // -------------------------------------------------------------------------

    @Test
    void uploadUserCertificate_keystorePasswordStoredEncrypted() throws Exception {
        User user = user(2L);
        String uploadPassword = "my-upload-password";
        byte[] p12Bytes = buildP12(uploadPassword);

        when(certificateRepository.findByUserId(2L)).thenReturn(Optional.empty());
        when(certificateRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        service.uploadUserCertificate(user, new ByteArrayInputStream(p12Bytes), uploadPassword);

        ArgumentCaptor<UserServerCertificateEntity> captor =
                ArgumentCaptor.forClass(UserServerCertificateEntity.class);
        verify(certificateRepository).save(captor.capture());

        String stored = captor.getValue().getKeystorePassword();
        assertThat(stored).startsWith(MetadataEncryptionService.ENC_PREFIX);
        assertThat(stored).doesNotContain(uploadPassword);
    }

    // -------------------------------------------------------------------------
    // getUserKeystorePassword — must decrypt before returning
    // -------------------------------------------------------------------------

    @Test
    void getUserKeystorePassword_returnsDecryptedPlaintext() {
        String original = "plain-password";
        String encrypted = encryptionService.encrypt(original);

        UserServerCertificateEntity entity = new UserServerCertificateEntity();
        entity.setKeystorePassword(encrypted);
        when(certificateRepository.findByUserId(1L)).thenReturn(Optional.of(entity));

        assertThat(service.getUserKeystorePassword(1L)).isEqualTo(original);
    }

    @Test
    void getUserKeystorePassword_legacyPlaintext_returnedUnchanged() {
        // Backwards-compatibility: values without enc: prefix pass through unchanged
        UserServerCertificateEntity entity = new UserServerCertificateEntity();
        entity.setKeystorePassword("legacy-plain");
        when(certificateRepository.findByUserId(1L)).thenReturn(Optional.of(entity));

        assertThat(service.getUserKeystorePassword(1L)).isEqualTo("legacy-plain");
    }

    // -------------------------------------------------------------------------
    // getUserKeyStore — decrypted password must successfully open the keystore
    // -------------------------------------------------------------------------

    @Test
    void getUserKeyStore_decryptsPasswordToLoadKeystore() throws Exception {
        String keystorePassword = "keystore-pass";
        byte[] p12Bytes = buildP12(keystorePassword);
        String encryptedPassword = encryptionService.encrypt(keystorePassword);

        UserServerCertificateEntity entity = new UserServerCertificateEntity();
        entity.setKeystoreData(p12Bytes);
        entity.setKeystorePassword(encryptedPassword);
        when(certificateRepository.findByUserId(1L)).thenReturn(Optional.of(entity));

        KeyStore ks = service.getUserKeyStore(1L);

        assertThat(ks).isNotNull();
        assertThat(ks.aliases().hasMoreElements()).isTrue();
    }

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    /**
     * Builds a minimal PKCS12 keystore containing a self-signed RSA certificate, using the same
     * BouncyCastle provider that is already on the classpath.
     */
    private static byte[] buildP12(String password) throws Exception {
        KeyPairGenerator kpg = KeyPairGenerator.getInstance("RSA", "BC");
        kpg.initialize(2048, new SecureRandom());
        KeyPair kp = kpg.generateKeyPair();

        org.bouncycastle.asn1.x500.X500Name subject =
                new org.bouncycastle.asn1.x500.X500Name("CN=test");
        BigInteger serial = BigInteger.valueOf(System.currentTimeMillis());
        Date notBefore = new Date();
        Date notAfter = new Date(notBefore.getTime() + 365L * 24 * 60 * 60 * 1000);

        JcaX509v3CertificateBuilder builder =
                new JcaX509v3CertificateBuilder(
                        subject, serial, notBefore, notAfter, subject, kp.getPublic());

        ContentSigner signer =
                new JcaContentSignerBuilder("SHA256WithRSA")
                        .setProvider("BC")
                        .build(kp.getPrivate());

        X509Certificate cert =
                new JcaX509CertificateConverter()
                        .setProvider(new BouncyCastleProvider())
                        .getCertificate(builder.build(signer));

        KeyStore ks = KeyStore.getInstance("PKCS12");
        ks.load(null, null);
        ks.setKeyEntry("alias", kp.getPrivate(), password.toCharArray(), new Certificate[] {cert});

        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        ks.store(baos, password.toCharArray());
        return baos.toByteArray();
    }
}
