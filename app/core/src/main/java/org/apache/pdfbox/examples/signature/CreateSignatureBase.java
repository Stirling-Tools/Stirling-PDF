/*
 * Copyright 2015 The Apache Software Foundation.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

package org.apache.pdfbox.examples.signature;

import java.io.IOException;
import java.io.InputStream;
import java.net.URISyntaxException;
import java.security.GeneralSecurityException;
import java.security.KeyStore;
import java.security.KeyStoreException;
import java.security.NoSuchAlgorithmException;
import java.security.PrivateKey;
import java.security.Provider;
import java.security.UnrecoverableKeyException;
import java.security.cert.Certificate;
import java.security.cert.CertificateException;
import java.security.cert.X509Certificate;
import java.util.Arrays;
import java.util.Enumeration;
import java.util.Locale;

import org.apache.pdfbox.pdmodel.interactive.digitalsignature.SignatureInterface;
import org.bouncycastle.cert.jcajce.JcaCertStore;
import org.bouncycastle.cms.CMSException;
import org.bouncycastle.cms.CMSSignedData;
import org.bouncycastle.cms.CMSSignedDataGenerator;
import org.bouncycastle.cms.jcajce.JcaSignerInfoGeneratorBuilder;
import org.bouncycastle.operator.ContentSigner;
import org.bouncycastle.operator.OperatorCreationException;
import org.bouncycastle.operator.jcajce.JcaContentSignerBuilder;
import org.bouncycastle.operator.jcajce.JcaDigestCalculatorProviderBuilder;

import lombok.Getter;
import lombok.Setter;

public abstract class CreateSignatureBase implements SignatureInterface {
    private PrivateKey privateKey;
    @Getter private Certificate[] certificateChain;
    @Setter private String tsaUrl;

    /**
     * Provider that must service the signing operation. Set for hardware-held keys (SunPKCS11 for
     * USB tokens, SunMSCAPI for the Windows store) so the {@link java.security.Signature} runs on
     * the token. Left {@code null} for software keystores, which use the default provider.
     */
    @Setter private Provider signingProvider;

    /**
     * Specifies whether the external signing scenario should be used. If set to {@code true},
     * external signing will be performed and {@link SignatureInterface} will be used for signing.
     * If set to {@code false}, internal signing will be performed.
     *
     * <p>Default: {@code false}
     *
     * @param externalSigning {@code true} if external signing should be performed; {@code false}
     *     for internal signing
     */
    @Setter @Getter private boolean externalSigning;

    /**
     * Initialize the signature creator with a keystore (pkcs12) and pin that should be used for the
     * signature.
     *
     * @param keystore is a pkcs12 keystore.
     * @param pin is the pin for the keystore / private key
     * @throws KeyStoreException if the keystore has not been initialized (loaded)
     * @throws NoSuchAlgorithmException if the algorithm for recovering the key cannot be found
     * @throws UnrecoverableKeyException if the given password is wrong
     * @throws CertificateException if the certificate is not valid as signing time
     * @throws IOException if no certificate could be found
     */
    public CreateSignatureBase(KeyStore keystore, char[] pin)
            throws KeyStoreException,
                    UnrecoverableKeyException,
                    NoSuchAlgorithmException,
                    IOException,
                    CertificateException {
        this(keystore, pin, null);
    }

    /**
     * Initialize the signature creator, optionally selecting a specific certificate by alias. A
     * hardware token / the Windows store can hold several certificates, so the caller picks one;
     * when {@code requestedAlias} is null the first usable entry is used (software keystore
     * behaviour).
     *
     * @param keystore the keystore (software, PKCS#11 or Windows-MY)
     * @param pin the keystore / token PIN, may be null for the Windows store
     * @param requestedAlias the alias to sign with, or null to pick the first usable entry
     */
    public CreateSignatureBase(KeyStore keystore, char[] pin, String requestedAlias)
            throws KeyStoreException,
                    UnrecoverableKeyException,
                    NoSuchAlgorithmException,
                    IOException,
                    CertificateException {
        if (requestedAlias != null
                && !requestedAlias.isBlank()
                && keystore.containsAlias(requestedAlias)) {
            privateKey = (PrivateKey) keystore.getKey(requestedAlias, pin);
            certificateChain = resolveChain(keystore, requestedAlias);
            if (certificateChain == null) {
                throw new IOException("Could not find certificate for alias " + requestedAlias);
            }
            checkValidity(certificateChain[0]);
            return;
        }

        // grabs the first alias from the keystore and gets the private key.
        Enumeration<String> aliases = keystore.aliases();
        Certificate cert = null;
        while (cert == null && aliases.hasMoreElements()) {
            String alias = aliases.nextElement();
            privateKey = (PrivateKey) keystore.getKey(alias, pin);
            Certificate[] certChain = resolveChain(keystore, alias);
            if (certChain != null) {
                certificateChain = certChain;
                cert = certChain[0];
                checkValidity(cert);
            }
        }

        if (cert == null) {
            throw new IOException("Could not find certificate");
        }
    }

    /**
     * Resolve the certificate chain for an alias. PKCS#11 tokens and the Windows store frequently
     * expose only the leaf certificate (a null chain), so fall back to the single certificate.
     */
    private static Certificate[] resolveChain(KeyStore keystore, String alias)
            throws KeyStoreException {
        Certificate[] chain = keystore.getCertificateChain(alias);
        if (chain != null && chain.length > 0) {
            return chain;
        }
        Certificate single = keystore.getCertificate(alias);
        return single != null ? new Certificate[] {single} : null;
    }

    private static void checkValidity(Certificate cert) throws CertificateException {
        if (cert instanceof X509Certificate x509Cert) {
            // avoid expired certificate
            x509Cert.checkValidity();
        }
    }

    public final void setPrivateKey(PrivateKey privateKey) {
        this.privateKey = privateKey;
    }

    public final void setCertificateChain(final Certificate[] certificateChain) {
        this.certificateChain = certificateChain;
    }

    /**
     * SignatureInterface sample implementation.
     *
     * <p>This method will be called from inside of the pdfbox and create the PKCS #7 signature. The
     * given InputStream contains the bytes that are given by the byte range.
     *
     * <p>This method is for internal use only.
     *
     * <p>Use your favorite cryptographic library to implement PKCS #7 signature creation. If you
     * want to create the hash and the signature separately (e.g. to transfer only the hash to an
     * external application), read <a href="https://stackoverflow.com/questions/41767351">this
     * answer</a> or <a href="https://stackoverflow.com/questions/56867465">this answer</a>.
     *
     * @throws IOException
     */
    @Override
    public byte[] sign(InputStream content) throws IOException {
        // cannot be done private (interface)
        try {
            CMSSignedDataGenerator gen = new CMSSignedDataGenerator();
            X509Certificate cert = (X509Certificate) certificateChain[0];
            JcaContentSignerBuilder signerBuilder =
                    new JcaContentSignerBuilder(resolveSignatureAlgorithm(privateKey, cert));
            // Hardware keys (PKCS#11 / Windows store) must sign on their own provider so the
            // operation runs on the token; software keys use the default provider.
            if (signingProvider != null) {
                signerBuilder.setProvider(signingProvider);
            }
            ContentSigner signer = signerBuilder.build(privateKey);
            gen.addSignerInfoGenerator(
                    new JcaSignerInfoGeneratorBuilder(
                                    new JcaDigestCalculatorProviderBuilder().build())
                            .build(signer, cert));
            gen.addCertificates(new JcaCertStore(Arrays.asList(certificateChain)));
            CMSProcessableInputStream msg = new CMSProcessableInputStream(content);
            CMSSignedData signedData = gen.generate(msg, false);
            if (tsaUrl != null && !tsaUrl.isEmpty()) {
                ValidationTimeStamp validation = new ValidationTimeStamp(tsaUrl);
                signedData = validation.addSignedTimeStamp(signedData);
            }
            return signedData.getEncoded();
        } catch (GeneralSecurityException
                | CMSException
                | OperatorCreationException
                | URISyntaxException e) {
            throw new IOException(e);
        }
    }

    /**
     * Pick a SHA-256 signature algorithm that matches the key type. RSA keeps the historical
     * default; EC / EdDSA tokens are common, so they are handled too.
     */
    private static String resolveSignatureAlgorithm(PrivateKey key, X509Certificate cert) {
        String alg = key.getAlgorithm();
        if (alg == null || alg.isBlank()) {
            alg = cert.getPublicKey().getAlgorithm();
        }
        alg = alg == null ? "" : alg.toUpperCase(Locale.ROOT);
        if (alg.contains("ED25519") || alg.contains("EDDSA")) {
            return "Ed25519";
        }
        if (alg.contains("EC")) { // EC, ECDSA
            return "SHA256withECDSA";
        }
        if (alg.contains("DSA")) {
            return "SHA256withDSA";
        }
        return "SHA256withRSA";
    }
}
