package stirling.software.proprietary.storage.crypto;

import java.nio.ByteBuffer;
import java.util.Arrays;
import java.util.UUID;

/**
 * On-disk format for storage-encrypted blobs. The object is self-describing so every {@code
 * StorageProvider} backend stores identical bytes and legacy plaintext blobs are recognised by the
 * absence of the magic:
 *
 * <pre>
 * offset size field
 * 0      8    magic "SPDFEAR1"
 * 8      1    format version (1)
 * 9      1    cipher suite (1 = AES-256-GCM-HKDF streaming, 1 MiB segments)
 * 10     16   key id (file_encryption_keys row that wraps the DEK)
 * 26     8    plaintext length
 * 34     2    wrapped-DEK length (60 for suite 1)
 * 36     60   wrapped DEK = IV(12) || AES-256-GCM(scope KEK, DEK) || tag(16)
 * 96     ..   payload: streaming-AEAD ciphertext
 * </pre>
 *
 * <p>Bytes 0–33 are the associated data for both the DEK wrap and the payload AEAD, so neither a
 * header transplanted onto another payload nor an altered key id / plaintext length authenticates.
 */
public final class EncryptedFileFormat {

    public static final byte[] MAGIC = {'S', 'P', 'D', 'F', 'E', 'A', 'R', '1'};
    public static final byte FORMAT_VERSION = 1;
    public static final byte SUITE_AES_GCM_HKDF_1MIB = 1;
    public static final int SEGMENT_SIZE_BYTES = 1 << 20;
    public static final int DEK_LENGTH_BYTES = 32;
    public static final int WRAPPED_DEK_LENGTH = 12 + DEK_LENGTH_BYTES + 16;
    public static final int HEADER_LENGTH = 8 + 1 + 1 + 16 + 8 + 2 + WRAPPED_DEK_LENGTH;

    private static final int AAD_LENGTH = 34;

    private EncryptedFileFormat() {}

    public record Header(
            byte formatVersion,
            byte cipherSuite,
            UUID keyId,
            long plaintextLength,
            byte[] wrappedDek) {

        public byte[] serialize() {
            ByteBuffer buffer = ByteBuffer.allocate(HEADER_LENGTH);
            buffer.put(MAGIC);
            buffer.put(formatVersion);
            buffer.put(cipherSuite);
            buffer.putLong(keyId.getMostSignificantBits());
            buffer.putLong(keyId.getLeastSignificantBits());
            buffer.putLong(plaintextLength);
            buffer.putShort((short) wrappedDek.length);
            buffer.put(wrappedDek);
            return buffer.array();
        }

        /** The header prefix (everything before the wrapped DEK) used as AEAD associated data. */
        public byte[] associatedData() {
            return Arrays.copyOfRange(serialize(), 0, AAD_LENGTH);
        }
    }

    /**
     * Parses a header from the first {@link #HEADER_LENGTH} bytes of a blob. Returns {@code null}
     * when the bytes are not a storage-encrypted object (legacy plaintext passthrough).
     *
     * @throws StorageEncryptionException when the magic matches but the version/suite is unknown —
     *     checked so it flows through the callers' IOException error mapping instead of surfacing
     *     as a bare 500.
     */
    public static Header parse(byte[] prefix) throws StorageEncryptionException {
        if (prefix == null || prefix.length < HEADER_LENGTH) {
            return null;
        }
        for (int i = 0; i < MAGIC.length; i++) {
            if (prefix[i] != MAGIC[i]) {
                return null;
            }
        }
        ByteBuffer buffer = ByteBuffer.wrap(prefix, MAGIC.length, HEADER_LENGTH - MAGIC.length);
        byte version = buffer.get();
        byte suite = buffer.get();
        UUID keyId = new UUID(buffer.getLong(), buffer.getLong());
        long plaintextLength = buffer.getLong();
        int wrappedDekLength = Short.toUnsignedInt(buffer.getShort());
        if (version != FORMAT_VERSION
                || suite != SUITE_AES_GCM_HKDF_1MIB
                || plaintextLength < 0
                || wrappedDekLength != WRAPPED_DEK_LENGTH) {
            throw new StorageEncryptionException(
                    "Unsupported storage-encryption header (version="
                            + version
                            + ", suite="
                            + suite
                            + "). This build cannot read the file.");
        }
        byte[] wrappedDek = new byte[wrappedDekLength];
        buffer.get(wrappedDek);
        return new Header(version, suite, keyId, plaintextLength, wrappedDek);
    }
}
