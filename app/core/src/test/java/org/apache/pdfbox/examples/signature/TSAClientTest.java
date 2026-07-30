package org.apache.pdfbox.examples.signature;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.math.BigInteger;
import java.net.URL;
import java.net.URLConnection;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.MessageDigest;
import java.security.Security;
import java.security.cert.X509Certificate;
import java.util.Date;
import java.util.Set;

import javax.security.auth.x500.X500Principal;

import org.bouncycastle.asn1.x509.AlgorithmIdentifier;
import org.bouncycastle.asn1.x509.ExtendedKeyUsage;
import org.bouncycastle.asn1.x509.Extension;
import org.bouncycastle.asn1.x509.KeyPurposeId;
import org.bouncycastle.cert.X509CertificateHolder;
import org.bouncycastle.cert.jcajce.JcaX509CertificateConverter;
import org.bouncycastle.cert.jcajce.JcaX509v3CertificateBuilder;
import org.bouncycastle.jce.provider.BouncyCastleProvider;
import org.bouncycastle.operator.ContentSigner;
import org.bouncycastle.operator.DigestCalculator;
import org.bouncycastle.operator.jcajce.JcaContentSignerBuilder;
import org.bouncycastle.operator.jcajce.JcaDigestCalculatorProviderBuilder;
import org.bouncycastle.tsp.TimeStampRequest;
import org.bouncycastle.tsp.TimeStampResponse;
import org.bouncycastle.tsp.TimeStampResponseGenerator;
import org.bouncycastle.tsp.TimeStampTokenGenerator;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

/**
 * Exercises the vendored PDFBox {@link TSAClient}. The TSA HTTP boundary is replaced with a mocked
 * {@link URL}/{@link URLConnection} so no real network is ever contacted. A real BouncyCastle TSA
 * response is generated in-process to drive the success path.
 */
@DisplayName("TSAClient (vendored PDFBox) Tests")
class TSAClientTest {

    private static KeyPair tsaKeyPair;
    private static X509Certificate tsaCert;

    @BeforeAll
    static void setUpProviderAndCert() throws Exception {
        if (Security.getProvider("BC") == null) {
            Security.addProvider(new BouncyCastleProvider());
        }
        KeyPairGenerator kpg = KeyPairGenerator.getInstance("RSA");
        kpg.initialize(2048);
        tsaKeyPair = kpg.generateKeyPair();
        tsaCert = selfSignedCert(tsaKeyPair);
    }

    private static X509Certificate selfSignedCert(KeyPair kp) throws Exception {
        X500Principal dn = new X500Principal("CN=Test TSA");
        long now = System.currentTimeMillis();
        Date from = new Date(now - 1000L);
        Date to = new Date(now + 365L * 24 * 60 * 60 * 1000);
        BigInteger serial = BigInteger.valueOf(now);
        ContentSigner signer = new JcaContentSignerBuilder("SHA256WithRSA").build(kp.getPrivate());
        JcaX509v3CertificateBuilder builder =
                new JcaX509v3CertificateBuilder(dn, serial, from, to, dn, kp.getPublic());
        // RFC 3161 requires the TSA signing cert to carry a critical id-kp-timeStamping EKU.
        builder.addExtension(
                Extension.extendedKeyUsage,
                true,
                new ExtendedKeyUsage(KeyPurposeId.id_kp_timeStamping));
        X509CertificateHolder holder = builder.build(signer);
        return new JcaX509CertificateConverter().setProvider("BC").getCertificate(holder);
    }

    /** Builds a valid RFC 3161 timestamp response matching the supplied request bytes. */
    private static byte[] buildTsaResponse(byte[] requestBytes) throws Exception {
        TimeStampRequest request = new TimeStampRequest(requestBytes);

        // SHA-1 digest calculator for the token's messageImprint of the signer cert.
        DigestCalculator sha1 =
                new JcaDigestCalculatorProviderBuilder()
                        .setProvider("BC")
                        .build()
                        .get(
                                new AlgorithmIdentifier(
                                        org.bouncycastle.asn1.oiw.OIWObjectIdentifiers.idSHA1));

        ContentSigner signer =
                new JcaContentSignerBuilder("SHA256WithRSA").build(tsaKeyPair.getPrivate());

        TimeStampTokenGenerator tokenGen =
                new TimeStampTokenGenerator(
                        new org.bouncycastle.cms.jcajce.JcaSignerInfoGeneratorBuilder(
                                        new JcaDigestCalculatorProviderBuilder()
                                                .setProvider("BC")
                                                .build())
                                .build(signer, tsaCert),
                        sha1,
                        new org.bouncycastle.asn1.ASN1ObjectIdentifier("1.2.3.4.1"));
        // Embed the signer certificate so the response token validates standalone.
        tokenGen.addCertificates(
                new org.bouncycastle.cert.jcajce.JcaCertStore(java.util.List.of(tsaCert)));

        // Accept the SHA-256 digest used by the request's messageImprint.
        Set<String> acceptedAlgorithms =
                Set.of(org.bouncycastle.asn1.nist.NISTObjectIdentifiers.id_sha256.getId());
        TimeStampResponseGenerator responseGen =
                new TimeStampResponseGenerator(tokenGen, acceptedAlgorithms);
        TimeStampResponse response = responseGen.generate(request, BigInteger.ONE, new Date());
        return response.getEncoded();
    }

    private TSAClient newClient(URL url, String username, String password) throws Exception {
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        return new TSAClient(url, username, password, digest);
    }

    @Nested
    @DisplayName("Successful timestamp request")
    class SuccessTests {

        @Test
        @DisplayName("Returns a parsed time stamp token from a valid TSA response")
        void returnsTokenOnValidResponse() throws Exception {
            URL url = mock(URL.class);
            URLConnection connection = mock(URLConnection.class);
            when(url.openConnection()).thenReturn(connection);

            CapturingOutputStream sink = new CapturingOutputStream();
            when(connection.getOutputStream()).thenReturn(sink);
            // Lazily build the response based on the request actually written to the connection.
            ResponseSupplierInputStream responseStream = new ResponseSupplierInputStream(sink);
            when(connection.getInputStream()).thenReturn(responseStream);

            TSAClient client = newClient(url, null, null);
            var token = client.getTimeStampToken(new ByteArrayInputStream("hello pdf".getBytes()));

            assertThat(token).isNotNull();
            assertThat(token.getTimeStampInfo()).isNotNull();
            // Content-Type header is always set for the timestamp query.
            verify(connection).setRequestProperty("Content-Type", "application/timestamp-query");
            verify(connection).setDoOutput(true);
            verify(connection).setDoInput(true);
        }

        @Test
        @DisplayName("Sends a Basic Authorization header when credentials are supplied")
        void addsBasicAuthHeaderWhenCredentialsPresent() throws Exception {
            URL url = mock(URL.class);
            URLConnection connection = mock(URLConnection.class);
            when(url.openConnection()).thenReturn(connection);
            when(connection.getContentEncoding()).thenReturn(null);

            CapturingOutputStream sink = new CapturingOutputStream();
            when(connection.getOutputStream()).thenReturn(sink);
            when(connection.getInputStream()).thenReturn(new ResponseSupplierInputStream(sink));

            TSAClient client = newClient(url, "user", "secret");
            client.getTimeStampToken(new ByteArrayInputStream("data".getBytes()));

            verify(connection)
                    .setRequestProperty(
                            org.mockito.ArgumentMatchers.eq("Authorization"),
                            org.mockito.ArgumentMatchers.startsWith("Basic "));
        }

        @Test
        @DisplayName("Does not send Authorization header when username is empty")
        void noAuthHeaderWhenUsernameEmpty() throws Exception {
            URL url = mock(URL.class);
            URLConnection connection = mock(URLConnection.class);
            when(url.openConnection()).thenReturn(connection);

            CapturingOutputStream sink = new CapturingOutputStream();
            when(connection.getOutputStream()).thenReturn(sink);
            when(connection.getInputStream()).thenReturn(new ResponseSupplierInputStream(sink));

            TSAClient client = newClient(url, "", "secret");
            client.getTimeStampToken(new ByteArrayInputStream("data".getBytes()));

            verify(connection, never())
                    .setRequestProperty(org.mockito.ArgumentMatchers.eq("Authorization"), any());
        }
    }

    @Nested
    @DisplayName("Error handling")
    class ErrorTests {

        @Test
        @DisplayName("Propagates IOException raised while writing the request")
        void propagatesWriteFailure() throws Exception {
            URL url = mock(URL.class);
            URLConnection connection = mock(URLConnection.class);
            when(url.openConnection()).thenReturn(connection);
            OutputStream failing =
                    new OutputStream() {
                        @Override
                        public void write(int b) throws IOException {
                            throw new IOException("write boom");
                        }
                    };
            when(connection.getOutputStream()).thenReturn(failing);

            TSAClient client = newClient(url, null, null);

            assertThatThrownBy(
                            () ->
                                    client.getTimeStampToken(
                                            new ByteArrayInputStream("data".getBytes())))
                    .isInstanceOf(IOException.class)
                    .hasMessageContaining("write boom");
        }

        @Test
        @DisplayName("Propagates IOException raised while reading the response")
        void propagatesReadFailure() throws Exception {
            URL url = mock(URL.class);
            URLConnection connection = mock(URLConnection.class);
            when(url.openConnection()).thenReturn(connection);
            when(connection.getOutputStream()).thenReturn(new CapturingOutputStream());
            when(connection.getInputStream()).thenThrow(new IOException("read boom"));

            TSAClient client = newClient(url, null, null);

            assertThatThrownBy(
                            () ->
                                    client.getTimeStampToken(
                                            new ByteArrayInputStream("data".getBytes())))
                    .isInstanceOf(IOException.class)
                    .hasMessageContaining("read boom");
        }

        @Test
        @DisplayName("Wraps a malformed (non-TSP) response as an IOException")
        void wrapsMalformedResponse() throws Exception {
            URL url = mock(URL.class);
            URLConnection connection = mock(URLConnection.class);
            when(url.openConnection()).thenReturn(connection);
            when(connection.getOutputStream()).thenReturn(new CapturingOutputStream());
            when(connection.getInputStream())
                    .thenReturn(new ByteArrayInputStream("not a tsp response".getBytes()));

            TSAClient client = newClient(url, null, null);

            assertThatThrownBy(
                            () ->
                                    client.getTimeStampToken(
                                            new ByteArrayInputStream("data".getBytes())))
                    .isInstanceOf(IOException.class);
        }

        @Test
        @DisplayName("Throws when the connection cannot be opened")
        void throwsWhenConnectionFails() throws Exception {
            URL url = mock(URL.class);
            when(url.openConnection()).thenThrow(new IOException("no route"));

            TSAClient client = newClient(url, null, null);

            assertThatThrownBy(
                            () ->
                                    client.getTimeStampToken(
                                            new ByteArrayInputStream("data".getBytes())))
                    .isInstanceOf(IOException.class)
                    .hasMessageContaining("no route");
        }
    }

    /** Collects everything written so the matching TSA response can be generated afterward. */
    private static final class CapturingOutputStream extends OutputStream {
        private final ByteArrayOutputStream delegate = new ByteArrayOutputStream();

        @Override
        public void write(int b) {
            delegate.write(b);
        }

        @Override
        public void write(byte[] b, int off, int len) {
            delegate.write(b, off, len);
        }

        byte[] toByteArray() {
            return delegate.toByteArray();
        }
    }

    /** Lazily builds the TSA response from the request captured by the sink on first read. */
    private static final class ResponseSupplierInputStream extends java.io.InputStream {
        private final CapturingOutputStream sink;
        private ByteArrayInputStream delegate;

        ResponseSupplierInputStream(CapturingOutputStream sink) {
            this.sink = sink;
        }

        private ByteArrayInputStream delegate() {
            if (delegate == null) {
                try {
                    delegate = new ByteArrayInputStream(buildTsaResponse(sink.toByteArray()));
                } catch (Exception e) {
                    throw new RuntimeException(e);
                }
            }
            return delegate;
        }

        @Override
        public int read() {
            return delegate().read();
        }

        @Override
        public int read(byte[] b, int off, int len) {
            return delegate().read(b, off, len);
        }
    }
}
