package stirling.software.proprietary.service;

import java.io.*;
import java.math.BigInteger;
import java.security.*;
import java.security.cert.Certificate;
import java.security.cert.X509Certificate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.Date;
import java.util.Optional;

import org.bouncycastle.asn1.x500.X500Name;
import org.bouncycastle.asn1.x509.BasicConstraints;
import org.bouncycastle.asn1.x509.ExtendedKeyUsage;
import org.bouncycastle.asn1.x509.Extension;
import org.bouncycastle.asn1.x509.KeyPurposeId;
import org.bouncycastle.asn1.x509.KeyUsage;
import org.bouncycastle.cert.X509CertificateHolder;
import org.bouncycastle.cert.jcajce.JcaX509CertificateConverter;
import org.bouncycastle.cert.jcajce.JcaX509ExtensionUtils;
import org.bouncycastle.cert.jcajce.JcaX509v3CertificateBuilder;
import org.bouncycastle.jce.provider.BouncyCastleProvider;
import org.bouncycastle.operator.ContentSigner;
import org.bouncycastle.operator.jcajce.JcaContentSignerBuilder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.proprietary.model.CertificateType;
import stirling.software.proprietary.model.UserServerCertificateEntity;
import stirling.software.proprietary.security.database.repository.UserRepository;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.security.repository.UserServerCertificateRepository;

@Service
@Slf4j
@RequiredArgsConstructor
public class UserServerCertificateService {

    private static final String KEYSTORE_ALIAS = "stirling-pdf-user-cert";
    private static final String DEFAULT_PASSWORD_PREFIX = "stirling-user-cert-";
    private static final int VALIDITY_DAYS = 365;

    private final UserServerCertificateRepository certificateRepository;
    private final UserRepository userRepository;

    static {
        Security.addProvider(new BouncyCastleProvider());
    }

    /** Get or create user certificate (auto-generate if not exists) */
    @Transactional
    public UserServerCertificateEntity getOrCreateUserCertificate(Long userId) throws Exception {
        Optional<UserServerCertificateEntity> existing = certificateRepository.findByUserId(userId);
        if (existing.isPresent()) {
            return existing.get();
        }

        User user =
                userRepository
                        .findById(userId)
                        .orElseThrow(() -> new IllegalArgumentException("User not found"));
        return generateUserCertificate(user);
    }

    /** Generate new certificate for user */
    @Transactional
    public UserServerCertificateEntity generateUserCertificate(User user) throws Exception {
        log.info("Generating server certificate for user: {}", user.getUsername());

        // Generate key pair
        KeyPairGenerator keyPairGenerator = KeyPairGenerator.getInstance("RSA", "BC");
        keyPairGenerator.initialize(2048, new SecureRandom());
        KeyPair keyPair = keyPairGenerator.generateKeyPair();

        // Certificate details with username
        String username = user.getUsername();
        X500Name subject = new X500Name("CN=" + username + ", O=Stirling-PDF User, C=US");
        BigInteger serialNumber = BigInteger.valueOf(System.currentTimeMillis());
        Date notBefore = new Date();
        Date notAfter =
                new Date(notBefore.getTime() + ((long) VALIDITY_DAYS * 24 * 60 * 60 * 1000));

        // Build certificate
        JcaX509v3CertificateBuilder certBuilder =
                new JcaX509v3CertificateBuilder(
                        subject, serialNumber, notBefore, notAfter, subject, keyPair.getPublic());

        // Add PDF-specific certificate extensions
        JcaX509ExtensionUtils extUtils = new JcaX509ExtensionUtils();

        // End-entity certificate, not a CA
        certBuilder.addExtension(Extension.basicConstraints, true, new BasicConstraints(false));

        // Key usage for PDF digital signatures
        certBuilder.addExtension(
                Extension.keyUsage,
                true,
                new KeyUsage(KeyUsage.digitalSignature | KeyUsage.nonRepudiation));

        // Extended key usage for document signing
        certBuilder.addExtension(
                Extension.extendedKeyUsage,
                false,
                new ExtendedKeyUsage(KeyPurposeId.id_kp_codeSigning));

        // Subject Key Identifier
        certBuilder.addExtension(
                Extension.subjectKeyIdentifier,
                false,
                extUtils.createSubjectKeyIdentifier(keyPair.getPublic()));

        // Authority Key Identifier for self-signed cert
        certBuilder.addExtension(
                Extension.authorityKeyIdentifier,
                false,
                extUtils.createAuthorityKeyIdentifier(keyPair.getPublic()));

        // Sign certificate
        ContentSigner signer =
                new JcaContentSignerBuilder("SHA256WithRSA")
                        .setProvider("BC")
                        .build(keyPair.getPrivate());

        X509CertificateHolder certHolder = certBuilder.build(signer);
        X509Certificate cert =
                new JcaX509CertificateConverter().setProvider("BC").getCertificate(certHolder);

        // Create keystore
        KeyStore keyStore = KeyStore.getInstance("PKCS12");
        keyStore.load(null, null);
        String password = generateUserPassword(user.getId());
        keyStore.setKeyEntry(
                KEYSTORE_ALIAS,
                keyPair.getPrivate(),
                password.toCharArray(),
                new Certificate[] {cert});

        // Store keystore bytes
        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        keyStore.store(baos, password.toCharArray());
        byte[] keystoreBytes = baos.toByteArray();

        // Create entity
        UserServerCertificateEntity entity = new UserServerCertificateEntity();
        entity.setUser(user);
        entity.setKeystoreData(keystoreBytes);
        entity.setKeystorePassword(password);
        entity.setCertificateType(CertificateType.AUTO_GENERATED);
        entity.setSubjectDn(cert.getSubjectX500Principal().getName());
        entity.setIssuerDn(cert.getIssuerX500Principal().getName());
        entity.setValidFrom(
                LocalDateTime.ofInstant(cert.getNotBefore().toInstant(), ZoneId.systemDefault()));
        entity.setValidTo(
                LocalDateTime.ofInstant(cert.getNotAfter().toInstant(), ZoneId.systemDefault()));

        return certificateRepository.save(entity);
    }

    /** Upload user-provided certificate */
    @Transactional
    public UserServerCertificateEntity uploadUserCertificate(
            User user, InputStream p12Stream, String password) throws Exception {
        log.info("Uploading user certificate for user: {}", user.getUsername());

        // Validate keystore
        byte[] keystoreBytes = p12Stream.readAllBytes();
        KeyStore keyStore = KeyStore.getInstance("PKCS12");
        keyStore.load(new ByteArrayInputStream(keystoreBytes), password.toCharArray());

        // Extract certificate info
        String alias = keyStore.aliases().nextElement();
        X509Certificate cert = (X509Certificate) keyStore.getCertificate(alias);

        if (cert == null) {
            throw new IllegalArgumentException("No certificate found in keystore");
        }

        // Create or update entity
        UserServerCertificateEntity entity =
                certificateRepository
                        .findByUserId(user.getId())
                        .orElse(new UserServerCertificateEntity());

        entity.setUser(user);
        entity.setKeystoreData(keystoreBytes);
        entity.setKeystorePassword(password);
        entity.setCertificateType(CertificateType.USER_UPLOADED);
        entity.setSubjectDn(cert.getSubjectX500Principal().getName());
        entity.setIssuerDn(cert.getIssuerX500Principal().getName());
        entity.setValidFrom(
                LocalDateTime.ofInstant(cert.getNotBefore().toInstant(), ZoneId.systemDefault()));
        entity.setValidTo(
                LocalDateTime.ofInstant(cert.getNotAfter().toInstant(), ZoneId.systemDefault()));

        return certificateRepository.save(entity);
    }

    /** Get user's KeyStore for signing operations */
    @Transactional(readOnly = true)
    public KeyStore getUserKeyStore(Long userId) throws Exception {
        UserServerCertificateEntity cert =
                certificateRepository
                        .findByUserId(userId)
                        .orElseThrow(
                                () -> new IllegalArgumentException("User certificate not found"));

        KeyStore keyStore = KeyStore.getInstance("PKCS12");
        keyStore.load(
                new ByteArrayInputStream(cert.getKeystoreData()),
                cert.getKeystorePassword().toCharArray());
        return keyStore;
    }

    /** Get user's keystore password */
    @Transactional(readOnly = true)
    public String getUserKeystorePassword(Long userId) {
        UserServerCertificateEntity cert =
                certificateRepository
                        .findByUserId(userId)
                        .orElseThrow(
                                () -> new IllegalArgumentException("User certificate not found"));
        return cert.getKeystorePassword();
    }

    /** Delete user certificate */
    @Transactional
    public void deleteUserCertificate(Long userId) {
        certificateRepository.findByUserId(userId).ifPresent(certificateRepository::delete);
    }

    /** Check if user has certificate */
    @Transactional(readOnly = true)
    public boolean hasUserCertificate(Long userId) {
        return certificateRepository.findByUserId(userId).isPresent();
    }

    /** Get certificate info (without keystore data) */
    @Transactional(readOnly = true)
    public Optional<UserServerCertificateEntity> getCertificateInfo(Long userId) {
        return certificateRepository.findByUserId(userId);
    }

    /** Generate consistent password for user (based on user ID) */
    private String generateUserPassword(Long userId) {
        return DEFAULT_PASSWORD_PREFIX + userId;
    }
}
