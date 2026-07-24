package stirling.software.proprietary.storage.crypto;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.UUID;

import org.junit.jupiter.api.Test;

class EncryptedFileFormatTest {

    private static EncryptedFileFormat.Header sampleHeader() {
        return new EncryptedFileFormat.Header(
                EncryptedFileFormat.FORMAT_VERSION,
                EncryptedFileFormat.SUITE_AES_GCM_HKDF_1MIB,
                UUID.randomUUID(),
                123_456_789L,
                new byte[EncryptedFileFormat.WRAPPED_DEK_LENGTH]);
    }

    @Test
    void serialize_parse_roundtrips() {
        EncryptedFileFormat.Header header = sampleHeader();
        byte[] bytes = header.serialize();
        assertThat(bytes).hasSize(EncryptedFileFormat.HEADER_LENGTH);

        EncryptedFileFormat.Header parsed = EncryptedFileFormat.parse(bytes);
        assertThat(parsed).isNotNull();
        assertThat(parsed.keyId()).isEqualTo(header.keyId());
        assertThat(parsed.plaintextLength()).isEqualTo(header.plaintextLength());
        assertThat(parsed.wrappedDek()).isEqualTo(header.wrappedDek());
    }

    @Test
    void parse_returnsNullForPlaintext() {
        byte[] pdf = new byte[EncryptedFileFormat.HEADER_LENGTH];
        pdf[0] = '%';
        pdf[1] = 'P';
        pdf[2] = 'D';
        pdf[3] = 'F';
        assertThat(EncryptedFileFormat.parse(pdf)).isNull();
    }

    @Test
    void parse_returnsNullForShortPrefix() {
        assertThat(EncryptedFileFormat.parse(new byte[10])).isNull();
        assertThat(EncryptedFileFormat.parse(null)).isNull();
    }

    @Test
    void parse_throwsOnUnknownVersion() {
        byte[] bytes = sampleHeader().serialize();
        bytes[8] = 99; // format version
        assertThatThrownBy(() -> EncryptedFileFormat.parse(bytes))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("Unsupported");
    }

    @Test
    void associatedData_excludesWrappedDek() {
        EncryptedFileFormat.Header header = sampleHeader();
        byte[] aad = header.associatedData();
        assertThat(aad).hasSize(34);
        // Changing the wrapped DEK must not change the AAD (it is authenticated separately).
        byte[] otherDek = new byte[EncryptedFileFormat.WRAPPED_DEK_LENGTH];
        otherDek[0] = 1;
        EncryptedFileFormat.Header other =
                new EncryptedFileFormat.Header(
                        header.formatVersion(),
                        header.cipherSuite(),
                        header.keyId(),
                        header.plaintextLength(),
                        otherDek);
        assertThat(other.associatedData()).isEqualTo(aad);
    }
}
