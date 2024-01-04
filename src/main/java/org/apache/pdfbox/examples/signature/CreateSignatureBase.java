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
import java.security.UnrecoverableKeyException;
import java.security.cert.Certificate;
import java.security.cert.CertificateException;
import java.security.cert.X509Certificate;
import java.util.Arrays;
import java.util.Enumeration;

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

public abstract class CreateSignatureBase implements SignatureInterface {
    private PrivateKey privateKey;
    private Certificate[] certificateChain;
    private String tsaUrl;
    private boolean externalSigning;

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
        // grabs the first alias from the keystore and get the private key. An
        // alternative method or constructor could be used for setting a specific
        // alias that should be used.
        Enumeration<String> aliases = keystore.aliases();
        String alias;
        Certificate cert = null;
        while (cert == null && aliases.hasMoreElements()) {
            alias = aliases.nextElement();
            setPrivateKey((PrivateKey) keystore.getKey(alias, pin));
            Certificate[] certChain = keystore.getCertificateChain(alias);
            if (certChain != null) {
                setCertificateChain(certChain);
                cert = certChain[0];
                if (cert instanceof X509Certificate) {
                    // avoid expired certificate
                    ((X509Certificate) cert).checkValidity();

                    //// SigUtils.checkCertificateUsage((X509Certificate) cert);
                }
            }
        }

        if (cert == null) {
            throw new IOException("Could not find certificate");
        }
    }

    public final void setPrivateKey(PrivateKey privateKey) {
        this.privateKey = privateKey;
    }

    public final void setCertificateChain(final Certificate[] certificateChain) {
        this.certificateChain = certificateChain;
    }

    public Certificate[] getCertificateChain() {
        return certificateChain;
    }

    public void setTsaUrl(String tsaUrl) {
        this.tsaUrl = tsaUrl;
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
            ContentSigner sha1Signer =
                    new JcaContentSignerBuilder("SHA256WithRSA").build(privateKey);
            gen.addSignerInfoGenerator(
                    new JcaSignerInfoGeneratorBuilder(
                                    new JcaDigestCalculatorProviderBuilder().build())
                            .build(sha1Signer, cert));
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
     * Set if external signing scenario should be used. If {@code false}, SignatureInterface would
     * be used for signing.
     *
     * <p>Default: {@code false}
     *
     * @param externalSigning {@code true} if external signing should be performed
     */
    public void setExternalSigning(boolean externalSigning) {
        this.externalSigning = externalSigning;
    }

    public boolean isExternalSigning() {
        return externalSigning;
    }
}
