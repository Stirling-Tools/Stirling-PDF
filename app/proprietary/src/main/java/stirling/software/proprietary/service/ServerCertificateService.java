package stirling.software.proprietary.service;

import java.io.*;
import java.math.BigInteger;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.security.*;
import java.security.cert.Certificate;
import java.security.cert.X509Certificate;
import java.util.Date;

import org.bouncycastle.asn1.x500.X500Name;
import org.bouncycastle.cert.X509CertificateHolder;
import org.bouncycastle.cert.jcajce.JcaX509CertificateConverter;
import org.bouncycastle.cert.jcajce.JcaX509v3CertificateBuilder;
import org.bouncycastle.jce.provider.BouncyCastleProvider;
import org.bouncycastle.operator.ContentSigner;
import org.bouncycastle.operator.jcajce.JcaContentSignerBuilder;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.configuration.InstallationPathConfig;

@Service
@Slf4j
public class ServerCertificateService implements stirling.software.common.service.ServerCertificateService {

    private static final String KEYSTORE_FILENAME = "server-certificate.p12";
    private static final String KEYSTORE_ALIAS = "stirling-pdf-server";
    private static final String DEFAULT_PASSWORD = "stirling-pdf-server-cert";

    @Value("${system.serverCertificate.enabled:false}")
    private boolean enabled;

    @Value("${system.serverCertificate.organizationName:Stirling-PDF}")
    private String organizationName;

    @Value("${system.serverCertificate.validity:365}")
    private int validityDays;

    @Value("${system.serverCertificate.regenerateOnStartup:false}")
    private boolean regenerateOnStartup;

    static {
        Security.addProvider(new BouncyCastleProvider());
    }

    private Path getKeystorePath() {
        return Paths.get(InstallationPathConfig.getConfigPath(), KEYSTORE_FILENAME);
    }

    public boolean isEnabled() {
        return enabled;
    }

    public boolean hasServerCertificate() {
        return Files.exists(getKeystorePath());
    }

    public void initializeServerCertificate() {
        if (!enabled) {
            log.debug("Server certificate feature is disabled");
            return;
        }

        Path keystorePath = getKeystorePath();

        if (!Files.exists(keystorePath) || regenerateOnStartup) {
            try {
                generateServerCertificate();
                log.info("Generated new server certificate at: {}", keystorePath);
            } catch (Exception e) {
                log.error("Failed to generate server certificate", e);
            }
        } else {
            log.info("Server certificate already exists at: {}", keystorePath);
        }
    }

    public KeyStore getServerKeyStore() throws Exception {
        if (!enabled || !hasServerCertificate()) {
            throw new IllegalStateException("Server certificate is not available");
        }

        KeyStore keyStore = KeyStore.getInstance("PKCS12");
        try (FileInputStream fis = new FileInputStream(getKeystorePath().toFile())) {
            keyStore.load(fis, DEFAULT_PASSWORD.toCharArray());
        }
        return keyStore;
    }

    public String getServerCertificatePassword() {
        return DEFAULT_PASSWORD;
    }

    public X509Certificate getServerCertificate() throws Exception {
        KeyStore keyStore = getServerKeyStore();
        return (X509Certificate) keyStore.getCertificate(KEYSTORE_ALIAS);
    }

    public byte[] getServerCertificatePublicKey() throws Exception {
        X509Certificate cert = getServerCertificate();
        return cert.getEncoded();
    }

    public void uploadServerCertificate(InputStream p12Stream, String password) throws Exception {
        // Validate the uploaded certificate
        KeyStore uploadedKeyStore = KeyStore.getInstance("PKCS12");
        uploadedKeyStore.load(p12Stream, password.toCharArray());

        // Find the first private key entry
        String alias = null;
        for (String a : java.util.Collections.list(uploadedKeyStore.aliases())) {
            if (uploadedKeyStore.isKeyEntry(a)) {
                alias = a;
                break;
            }
        }

        if (alias == null) {
            throw new IllegalArgumentException("No private key found in uploaded certificate");
        }

        // Create new keystore with our standard alias and password
        KeyStore newKeyStore = KeyStore.getInstance("PKCS12");
        newKeyStore.load(null, null);

        PrivateKey privateKey = (PrivateKey) uploadedKeyStore.getKey(alias, password.toCharArray());
        Certificate[] chain = uploadedKeyStore.getCertificateChain(alias);

        newKeyStore.setKeyEntry(KEYSTORE_ALIAS, privateKey, DEFAULT_PASSWORD.toCharArray(), chain);

        // Save to server keystore location
        Path keystorePath = getKeystorePath();
        Files.createDirectories(keystorePath.getParent());

        try (FileOutputStream fos = new FileOutputStream(keystorePath.toFile())) {
            newKeyStore.store(fos, DEFAULT_PASSWORD.toCharArray());
        }

        log.info("Server certificate updated from uploaded file");
    }

    public void deleteServerCertificate() throws Exception {
        Path keystorePath = getKeystorePath();
        if (Files.exists(keystorePath)) {
            Files.delete(keystorePath);
            log.info("Server certificate deleted");
        }
    }

    public ServerCertificateInfo getServerCertificateInfo() throws Exception {
        if (!hasServerCertificate()) {
            return new ServerCertificateInfo(false, null, null, null, null);
        }

        X509Certificate cert = getServerCertificate();
        return new ServerCertificateInfo(
                true,
                cert.getSubjectX500Principal().getName(),
                cert.getIssuerX500Principal().getName(),
                cert.getNotBefore(),
                cert.getNotAfter());
    }

    private void generateServerCertificate() throws Exception {
        // Generate key pair
        KeyPairGenerator keyPairGenerator = KeyPairGenerator.getInstance("RSA", "BC");
        keyPairGenerator.initialize(2048, new SecureRandom());
        KeyPair keyPair = keyPairGenerator.generateKeyPair();

        // Certificate details
        X500Name subject =
                new X500Name(
                        "CN=" + organizationName + " Server, O=" + organizationName + ", C=US");
        BigInteger serialNumber = BigInteger.valueOf(System.currentTimeMillis());
        Date notBefore = new Date();
        Date notAfter = new Date(notBefore.getTime() + ((long) validityDays * 24 * 60 * 60 * 1000));

        // Build certificate
        JcaX509v3CertificateBuilder certBuilder =
                new JcaX509v3CertificateBuilder(
                        subject, serialNumber, notBefore, notAfter, subject, keyPair.getPublic());

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
        keyStore.setKeyEntry(
                KEYSTORE_ALIAS,
                keyPair.getPrivate(),
                DEFAULT_PASSWORD.toCharArray(),
                new Certificate[] {cert});

        // Save keystore
        Path keystorePath = getKeystorePath();
        Files.createDirectories(keystorePath.getParent());

        try (FileOutputStream fos = new FileOutputStream(keystorePath.toFile())) {
            keyStore.store(fos, DEFAULT_PASSWORD.toCharArray());
        }
    }

}