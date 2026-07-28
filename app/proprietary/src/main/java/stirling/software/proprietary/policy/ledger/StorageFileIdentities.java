package stirling.software.proprietary.policy.ledger;

import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.security.DigestInputStream;
import java.security.MessageDigest;

import stirling.software.proprietary.billing.ContentHasher;
import stirling.software.proprietary.storage.model.StoredFile;
import stirling.software.proprietary.storage.provider.StorageProvider;

/**
 * Ledger identity and version tiers for files in app storage, shared by the storage-folder input
 * source and the storage output sink so a produced file is recorded in exactly the shape the next
 * sweep computes. Identity is the immutable row id. The cheap gate pairs {@code updatedAt} with
 * size — but metadata-only writes (a folder move, a rename) bump {@code updatedAt} too, so the gate
 * over-triggers by design and the content hash is the second tier that turns those into a gate
 * refresh instead of a reprocess.
 */
public final class StorageFileIdentities {

    private StorageFileIdentities() {}

    public static String identity(StoredFile file) {
        return "storage:" + file.getId();
    }

    public static String gate(StoredFile file) {
        return file.getUpdatedAt() + ":" + file.getSizeBytes();
    }

    /** SHA-256 of the stored blob; {@link UncheckedIOException} on read failure (propagates). */
    public static String contentHash(StorageProvider storageProvider, StoredFile file) {
        MessageDigest digest = ContentHasher.newSha256();
        try (InputStream is =
                new DigestInputStream(
                        storageProvider.load(file.getStorageKey()).getInputStream(), digest)) {
            is.transferTo(java.io.OutputStream.nullOutputStream());
            return ContentHasher.toHex(digest.digest());
        } catch (IOException e) {
            throw new UncheckedIOException("could not hash stored file " + identity(file), e);
        }
    }
}
