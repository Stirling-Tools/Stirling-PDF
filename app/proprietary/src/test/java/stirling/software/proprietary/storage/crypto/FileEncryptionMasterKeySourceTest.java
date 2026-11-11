package stirling.software.proprietary.storage.crypto;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Base64;

import org.junit.jupiter.api.Test;

/**
 * Provenance drives the "this key was generated for you" warning, which is the only prompt an
 * operator gets to back up a key they never chose.
 */
class FileEncryptionMasterKeySourceTest {

    private static final String MASTER = Base64.getEncoder().encodeToString(new byte[32]);

    @Test
    void configuredKeyReportsConfig() {
        FileEncryptionMasterKey key = new FileEncryptionMasterKey(MASTER, false);

        assertThat(key.source()).isEqualTo(FileEncryptionMasterKey.Source.CONFIG);
        assertThat(key.source().wireName()).isEqualTo("config");
    }

    @Test
    void wireNamesMatchTheValuesTheUiSwitchesOn() {
        assertThat(FileEncryptionMasterKey.Source.ENVIRONMENT.wireName()).isEqualTo("environment");
        assertThat(FileEncryptionMasterKey.Source.GENERATED.wireName()).isEqualTo("generated");
    }
}
