package stirling.software.SPDF.service.macos;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.lang.foreign.MemorySegment;
import java.security.InvalidKeyException;
import java.security.KeyPairGenerator;
import java.security.KeyStore;
import java.security.Signature;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.DisabledOnOs;
import org.junit.jupiter.api.condition.EnabledOnOs;
import org.junit.jupiter.api.condition.OS;

class MacKeychainProviderTest {

    @Test
    void registersKeyStoreAndSignatureAlgorithms() {
        MacKeychainProvider provider = MacKeychainProvider.get();

        assertThat(provider.getService("KeyStore", MacKeychainProvider.KEYSTORE_TYPE)).isNotNull();
        for (String alg :
                new String[] {
                    "SHA256withRSA",
                    "SHA384withRSA",
                    "SHA512withRSA",
                    "SHA256withECDSA",
                    "SHA384withECDSA",
                    "SHA512withECDSA"
                }) {
            assertThat(provider.getService("Signature", alg)).as(alg).isNotNull();
        }
    }

    @Test
    void refusesSoftwareKeys() throws Exception {
        Signature signature = Signature.getInstance("SHA256withRSA", MacKeychainProvider.get());
        var softwareKey = KeyPairGenerator.getInstance("RSA").generateKeyPair().getPrivate();

        assertThatThrownBy(() -> signature.initSign(softwareKey))
                .isInstanceOf(InvalidKeyException.class);
    }

    @Test
    void refusesKeyOfTheWrongAlgorithm() throws Exception {
        Signature signature = Signature.getInstance("SHA256withECDSA", MacKeychainProvider.get());

        assertThatThrownBy(
                        () ->
                                signature.initSign(
                                        new MacKeychainPrivateKey(
                                                "RSA", MemorySegment.NULL, false)))
                .isInstanceOf(InvalidKeyException.class)
                .hasMessageContaining("expected EC");
    }

    @Test
    @DisabledOnOs(OS.MAC)
    void unsupportedOffMacOs() {
        assertThat(MacKeychainProvider.isSupported()).isFalse();
        assertThatThrownBy(
                        () -> {
                            KeyStore ks =
                                    KeyStore.getInstance(
                                            MacKeychainProvider.KEYSTORE_TYPE,
                                            MacKeychainProvider.get());
                            ks.load(null, null);
                        })
                .isInstanceOf(IllegalStateException.class);
    }

    @Test
    @EnabledOnOs(OS.MAC)
    void bindsSecurityFrameworkOnMacOs() throws Exception {
        assertThat(MacKeychainProvider.isSupported()).isTrue();
        KeyStore ks =
                KeyStore.getInstance(MacKeychainProvider.KEYSTORE_TYPE, MacKeychainProvider.get());
        ks.load(null, null);
        assertThat(ks.size()).isGreaterThanOrEqualTo(0);
    }
}
