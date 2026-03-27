package stirling.software.proprietary.workflow.service;

import java.io.ByteArrayOutputStream;
import java.math.BigInteger;
import java.nio.charset.StandardCharsets;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.KeyStore;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.security.Security;
import java.security.cert.Certificate;
import java.security.cert.X509Certificate;
import java.util.Base64;
import java.util.Date;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

import org.bouncycastle.asn1.x500.X500Name;
import org.bouncycastle.asn1.x509.BasicConstraints;
import org.bouncycastle.asn1.x509.ExtendedKeyUsage;
import org.bouncycastle.asn1.x509.Extension;
import org.bouncycastle.asn1.x509.GeneralName;
import org.bouncycastle.asn1.x509.GeneralNames;
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

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.ApplicationProperties;

/**
 * Generates ephemeral (in-memory) PKCS12 keystores for guest/external signers. The generated
 * certificate includes the signer's email address as a Subject Alternative Name (rfc822Name),
 * providing industry-standard traceability. Guest keystores are never persisted to the database.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class GuestCertificateService {

    private static final String KEYSTORE_ALIAS = "stirling-pdf-guest-cert";
    private static final int VALIDITY_DAYS = 365;

    private final ApplicationProperties applicationProperties;

    static {
        if (Security.getProvider("BC") == null) {
            Security.addProvider(new BouncyCastleProvider());
        }
    }

    /**
     * Generates a new in-memory PKCS12 keystore for a guest signer identified by email. The X.509
     * certificate includes: - CN = sanitized email (no special chars) - O = Stirling-PDF Guest -
     * SAN rfc822Name = raw email (industry-standard signer identity field)
     *
     * @param email the guest signer's email address
     * @return an in-memory PKCS12 KeyStore ready for use in PDF signing
     */
    public KeyStore generateGuestKeyStore(String email) throws Exception {
        log.debug(
                "Generating guest certificate for external signer (domain: {})",
                email.contains("@") ? email.substring(email.indexOf('@')) : "<no-domain>");

        KeyPairGenerator keyPairGenerator = KeyPairGenerator.getInstance("RSA", "BC");
        keyPairGenerator.initialize(2048, new SecureRandom());
        KeyPair keyPair = keyPairGenerator.generateKeyPair();

        // Sanitize email for use in DN (remove chars that break X.500 parsing)
        String safeCn = email.replaceAll("[,=+<>#;\"\\\\]", "_");
        X500Name subject = new X500Name("CN=" + safeCn + ", O=Stirling-PDF Guest, C=US");

        BigInteger serialNumber = new BigInteger(64, new SecureRandom());
        Date notBefore = new Date();
        Date notAfter =
                new Date(notBefore.getTime() + ((long) VALIDITY_DAYS * 24 * 60 * 60 * 1000));

        JcaX509v3CertificateBuilder certBuilder =
                new JcaX509v3CertificateBuilder(
                        subject, serialNumber, notBefore, notAfter, subject, keyPair.getPublic());

        JcaX509ExtensionUtils extUtils = new JcaX509ExtensionUtils();

        // End-entity certificate, not a CA
        certBuilder.addExtension(Extension.basicConstraints, true, new BasicConstraints(false));

        // Key usage for PDF digital signatures
        certBuilder.addExtension(
                Extension.keyUsage,
                true,
                new KeyUsage(KeyUsage.digitalSignature | KeyUsage.nonRepudiation));

        // Extended key usage: emailProtection is the correct OID for email-identified signers
        certBuilder.addExtension(
                Extension.extendedKeyUsage,
                false,
                new ExtendedKeyUsage(KeyPurposeId.id_kp_emailProtection));

        // Subject Key Identifier
        certBuilder.addExtension(
                Extension.subjectKeyIdentifier,
                false,
                extUtils.createSubjectKeyIdentifier(keyPair.getPublic()));

        // Authority Key Identifier (self-signed)
        certBuilder.addExtension(
                Extension.authorityKeyIdentifier,
                false,
                extUtils.createAuthorityKeyIdentifier(keyPair.getPublic()));

        // Subject Alternative Name: rfc822Name = email (industry-standard signer identity)
        GeneralName emailSan = new GeneralName(GeneralName.rfc822Name, email);
        GeneralNames subjectAltName = new GeneralNames(emailSan);
        certBuilder.addExtension(Extension.subjectAlternativeName, false, subjectAltName);

        // Sign the certificate
        ContentSigner signer =
                new JcaContentSignerBuilder("SHA256WithRSA")
                        .setProvider("BC")
                        .build(keyPair.getPrivate());

        X509CertificateHolder certHolder = certBuilder.build(signer);
        X509Certificate cert =
                new JcaX509CertificateConverter().setProvider("BC").getCertificate(certHolder);

        // Build in-memory PKCS12 keystore
        String password = generateGuestPassword(email);
        KeyStore keyStore = KeyStore.getInstance("PKCS12");
        keyStore.load(null, null);
        keyStore.setKeyEntry(
                KEYSTORE_ALIAS,
                keyPair.getPrivate(),
                password.toCharArray(),
                new Certificate[] {cert});

        // Round-trip through serialization so the keystore is fully initialised
        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        keyStore.store(baos, password.toCharArray());
        KeyStore loaded = KeyStore.getInstance("PKCS12");
        loaded.load(new java.io.ByteArrayInputStream(baos.toByteArray()), password.toCharArray());

        log.debug("Guest certificate generated (CN={}, SAN=rfc822Name:[email])", safeCn);
        return loaded;
    }

    /**
     * Derives a deterministic password for a guest keystore. The password is a Base64-encoded
     * HMAC-SHA256 of the email using the application's secret key, truncated to 32 characters. Two
     * calls with the same email always return the same password.
     *
     * @param email the guest signer's email address
     * @return a deterministic password string
     */
    public String generateGuestPassword(String email) {
        try {
            String rawKey = applicationProperties.getAutomaticallyGenerated().getKey();
            if (rawKey == null || rawKey.isBlank()) {
                // Fallback: SHA-256 of email if no application key available
                MessageDigest digest = MessageDigest.getInstance("SHA-256");
                byte[] hash = digest.digest(email.getBytes(StandardCharsets.UTF_8));
                return Base64.getEncoder().encodeToString(hash).substring(0, 32);
            }

            Mac hmac = Mac.getInstance("HmacSHA256");
            SecretKeySpec keySpec =
                    new SecretKeySpec(rawKey.getBytes(StandardCharsets.UTF_8), "HmacSHA256");
            hmac.init(keySpec);
            byte[] macBytes = hmac.doFinal(email.getBytes(StandardCharsets.UTF_8));
            String encoded = Base64.getEncoder().encodeToString(macBytes);
            // Truncate to 32 chars; use URL-safe replacement to avoid keystore password issues
            return encoded.replace("/", "_").replace("+", "-").substring(0, 32);
        } catch (Exception e) {
            throw new IllegalStateException("Failed to derive guest keystore password", e);
        }
    }
}
