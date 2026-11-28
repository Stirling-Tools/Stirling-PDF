package stirling.software.SPDF.pdf.signature;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.math.BigInteger;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.KeyStore;
import java.security.cert.Certificate;
import java.security.cert.X509Certificate;
import java.util.Date;

import org.bouncycastle.asn1.x500.X500Name;
import org.bouncycastle.cert.jcajce.JcaX509CertificateConverter;
import org.bouncycastle.cert.jcajce.JcaX509v3CertificateBuilder;
import org.bouncycastle.operator.jcajce.JcaContentSignerBuilder;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class CreateSignatureAliasTest {

    private static final char[] PIN = "pw".toCharArray();

    private KeyStore keystore;
    private X509Certificate first;
    private X509Certificate second;

    @BeforeEach
    void twoIdentities() throws Exception {
        keystore = KeyStore.getInstance("PKCS12");
        keystore.load(null, null);
        first = add("first");
        second = add("second");
    }

    @Test
    void signsWithTheRequestedAlias() throws Exception {
        assertThat(new Signer(keystore, PIN, "second").getCertificateChain()[0]).isEqualTo(second);
    }

    @Test
    void refusesAnAliasThatIsNotInTheStore() {
        assertThatThrownBy(() -> new Signer(keystore, PIN, "missing"))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("missing");
    }

    @Test
    void usesTheFirstEntryWhenNoAliasIsGiven() throws Exception {
        assertThat(new Signer(keystore, PIN, null).getCertificateChain()[0]).isIn(first, second);
    }

    private X509Certificate add(String alias) throws Exception {
        KeyPairGenerator kpg = KeyPairGenerator.getInstance("RSA");
        kpg.initialize(2048);
        KeyPair keys = kpg.generateKeyPair();
        Date now = new Date();
        X509Certificate cert =
                new JcaX509CertificateConverter()
                        .getCertificate(
                                new JcaX509v3CertificateBuilder(
                                                new X500Name("CN=" + alias),
                                                BigInteger.valueOf(System.nanoTime()),
                                                new Date(now.getTime() - 60_000),
                                                new Date(now.getTime() + 86_400_000L),
                                                new X500Name("CN=" + alias),
                                                keys.getPublic())
                                        .build(
                                                new JcaContentSignerBuilder("SHA256withRSA")
                                                        .build(keys.getPrivate())));
        keystore.setKeyEntry(alias, keys.getPrivate(), PIN, new Certificate[] {cert});
        return cert;
    }

    private static final class Signer extends CreateSignatureBase {
        Signer(KeyStore keystore, char[] pin, String alias) throws Exception {
            super(keystore, pin, alias);
        }
    }
}
