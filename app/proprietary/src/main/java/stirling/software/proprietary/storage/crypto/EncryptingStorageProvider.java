package stirling.software.proprietary.storage.crypto;

import java.io.BufferedOutputStream;
import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.io.SequenceInputStream;
import java.net.URI;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.GeneralSecurityException;
import java.security.SecureRandom;
import java.time.Duration;
import java.util.Arrays;
import java.util.Optional;

import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;

import org.springframework.core.io.AbstractResource;
import org.springframework.core.io.Resource;
import org.springframework.web.multipart.MultipartFile;

import com.google.crypto.tink.subtle.AesGcmHkdfStreaming;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.util.TempFileManager;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.storage.provider.StorageProvider;
import stirling.software.proprietary.storage.provider.StoredObject;

/**
 * Envelope-encryption decorator over any {@link StorageProvider}: encrypts on {@code store} (when
 * the write flag is on), decrypts on {@code load}, and passes legacy plaintext blobs through
 * untouched (detected by the {@link EncryptedFileFormat} magic). Backends store opaque ciphertext
 * and need no changes.
 *
 * <p>The decorator is installed unconditionally (see {@link StorageEncryptionState}), so a node
 * whose config lags the cluster decrypts or fails loudly instead of streaming raw ciphertext.
 * Decryption keeps working after the feature is switched off; only new writes revert to plaintext.
 *
 * <p>Presigned download URLs delegate to the backend only while no encrypted content can exist;
 * otherwise they are suppressed, because an S3 presigned GET would hand ciphertext straight to the
 * browser. Callers already fall back to app-streamed {@link #load} when no URL is offered.
 */
@Slf4j
public class EncryptingStorageProvider implements StorageProvider {

    private static final SecureRandom RANDOM = new SecureRandom();

    private final StorageProvider delegate;
    private final StorageEncryptionState state;
    private final TempFileManager tempFileManager;

    public EncryptingStorageProvider(StorageProvider delegate, StorageEncryptionState state) {
        this(delegate, state, null);
    }

    public EncryptingStorageProvider(
            StorageProvider delegate,
            StorageEncryptionState state,
            TempFileManager tempFileManager) {
        this.delegate = delegate;
        this.state = state;
        this.tempFileManager = tempFileManager;
    }

    /** Test convenience mirroring the pre-state constructor shape. */
    public EncryptingStorageProvider(
            StorageProvider delegate, FileEncryptionKeyService keys, boolean writeEnabled) {
        this(delegate, StorageEncryptionState.of(writeEnabled, keys), null);
    }

    /** Test convenience with an explicit audit listener. */
    public EncryptingStorageProvider(
            StorageProvider delegate,
            FileEncryptionKeyService keys,
            boolean writeEnabled,
            StorageEncryptionAuditListener auditListener) {
        this(delegate, StorageEncryptionState.of(writeEnabled, keys, auditListener), null);
    }

    @Override
    public StoredObject store(User owner, MultipartFile file) throws IOException {
        if (!state.isWriteEnabled()) {
            return delegate.store(owner, file);
        }
        FileEncryptionKeyService.ScopeKek kek = state.keyService().activeKekForOwner(owner);
        byte[] dek = new byte[EncryptedFileFormat.DEK_LENGTH_BYTES];
        RANDOM.nextBytes(dek);

        // Spool ciphertext to a temp file: DatabaseStorageProvider needs getBytes() and
        // S3StorageProvider needs an exact Content-Length, so the ciphertext size must be known
        // before the delegate reads the upload. TempFileManager-registered so a crash mid-upload
        // doesn't orphan the spool forever.
        Path spool = createSpoolFile();
        try {
            EncryptedFileFormat.Header header = buildHeader(kek, dek, file.getSize());
            byte[] aad = header.associatedData();
            long plaintextBytes;
            try (OutputStream out = new BufferedOutputStream(Files.newOutputStream(spool))) {
                out.write(header.serialize());
                OutputStream encrypting = streamingAead(dek).newEncryptingStream(out, aad);
                try (InputStream in = file.getInputStream()) {
                    plaintextBytes = in.transferTo(encrypting);
                }
                encrypting.close();
            } catch (GeneralSecurityException e) {
                throw new StorageEncryptionException("Failed to encrypt upload", e);
            }
            // The header (and AAD) already carry file.getSize(); a MultipartFile that mis-reports
            // would otherwise surface as a Content-Length mismatch, i.e. a truncated or hanging
            // download instead of an error.
            if (plaintextBytes != file.getSize()) {
                throw new StorageEncryptionException(
                        "Upload reported "
                                + file.getSize()
                                + " bytes but streamed "
                                + plaintextBytes);
            }
            StoredObject stored = delegate.store(owner, new SpooledUpload(file, spool));
            log.debug(
                    "Encrypted {} under key {} ({} plaintext bytes)",
                    stored.getStorageKey(),
                    kek.keyId(),
                    file.getSize());
            state.auditListener().encrypted(stored.getStorageKey(), kek.keyId());
            return stored.toBuilder()
                    .sizeBytes(file.getSize())
                    .encryptionKeyId(kek.keyId().toString())
                    .build();
        } finally {
            Arrays.fill(dek, (byte) 0);
            Files.deleteIfExists(spool);
        }
    }

    private Path createSpoolFile() throws IOException {
        if (tempFileManager != null) {
            return tempFileManager.createTempFile(".enc").toPath();
        }
        return Files.createTempFile("stirling-enc-", ".bin");
    }

    @Override
    public Resource load(String storageKey) throws IOException {
        Resource raw = delegate.load(storageKey);
        if (raw.isOpen()) {
            return wrapOneShot(storageKey, raw);
        }
        return wrapReopenable(storageKey, raw);
    }

    @Override
    public void delete(String storageKey) throws IOException {
        delegate.delete(storageKey);
    }

    @Override
    public void close() {
        try {
            delegate.close();
        } catch (Exception e) {
            log.warn("Error closing delegate storage provider", e);
        }
    }

    @Override
    public Optional<URI> signedDownloadUrl(String storageKey, Duration ttl) throws IOException {
        if (state.suppressDirectDownloads()) {
            return Optional.empty();
        }
        return delegate.signedDownloadUrl(storageKey, ttl);
    }

    @Override
    public Optional<URI> signedDownloadUrl(
            String storageKey, Duration ttl, boolean inline, String originalFilename)
            throws IOException {
        if (state.suppressDirectDownloads()) {
            return Optional.empty();
        }
        return delegate.signedDownloadUrl(storageKey, ttl, inline, originalFilename);
    }

    // ---- store helpers -------------------------------------------------------------------

    private EncryptedFileFormat.Header buildHeader(
            FileEncryptionKeyService.ScopeKek kek, byte[] dek, long plaintextLength)
            throws StorageEncryptionException {
        // AAD covers the header prefix, so build a header with a placeholder wrap first to get
        // the prefix bytes, then wrap the DEK bound to that prefix.
        EncryptedFileFormat.Header prototype =
                new EncryptedFileFormat.Header(
                        EncryptedFileFormat.FORMAT_VERSION,
                        EncryptedFileFormat.SUITE_AES_GCM_HKDF_1MIB,
                        kek.keyId(),
                        plaintextLength,
                        new byte[EncryptedFileFormat.WRAPPED_DEK_LENGTH]);
        byte[] aad = prototype.associatedData();
        byte[] wrappedDek = wrapDek(dek, kek.key(), aad);
        return new EncryptedFileFormat.Header(
                EncryptedFileFormat.FORMAT_VERSION,
                EncryptedFileFormat.SUITE_AES_GCM_HKDF_1MIB,
                kek.keyId(),
                plaintextLength,
                wrappedDek);
    }

    private static byte[] wrapDek(byte[] dek, byte[] kek, byte[] aad)
            throws StorageEncryptionException {
        try {
            byte[] iv = new byte[12];
            RANDOM.nextBytes(iv);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(
                    Cipher.ENCRYPT_MODE,
                    new SecretKeySpec(kek, "AES"),
                    new GCMParameterSpec(128, iv));
            cipher.updateAAD(aad);
            byte[] ct = cipher.doFinal(dek);
            byte[] out = new byte[iv.length + ct.length];
            System.arraycopy(iv, 0, out, 0, iv.length);
            System.arraycopy(ct, 0, out, iv.length, ct.length);
            return out;
        } catch (GeneralSecurityException e) {
            throw new StorageEncryptionException("Failed to wrap file key", e);
        }
    }

    private byte[] unwrapDek(EncryptedFileFormat.Header header) throws IOException {
        byte[] kek = state.keyService().kekForDecrypt(header.keyId());
        try {
            byte[] wrapped = header.wrappedDek();
            byte[] iv = Arrays.copyOfRange(wrapped, 0, 12);
            byte[] ct = Arrays.copyOfRange(wrapped, 12, wrapped.length);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(
                    Cipher.DECRYPT_MODE,
                    new SecretKeySpec(kek, "AES"),
                    new GCMParameterSpec(128, iv));
            cipher.updateAAD(header.associatedData());
            return cipher.doFinal(ct);
        } catch (GeneralSecurityException e) {
            throw new StorageEncryptionException(
                    "Failed to unwrap file key for key " + header.keyId() + " — tampered header?",
                    e);
        }
    }

    /**
     * Uses Tink's {@code subtle} API directly rather than the keyset/StreamingAead registry:
     * keysets would store DEKs in Tink's own serialisation and key-management model, while this
     * format keeps the (already-wrapped) DEK in our header. {@code subtle} is outside Tink's
     * stability guarantee — the pinned version plus the round-trip tests are what make upgrades
     * safe; re-run them on any Tink bump.
     */
    private static AesGcmHkdfStreaming streamingAead(byte[] dek) throws GeneralSecurityException {
        return new AesGcmHkdfStreaming(
                dek,
                "HMACSHA256",
                EncryptedFileFormat.DEK_LENGTH_BYTES,
                EncryptedFileFormat.SEGMENT_SIZE_BYTES,
                0);
    }

    // ---- load helpers --------------------------------------------------------------------

    /** Re-openable delegate (local file, DB byte array): sniff via a throwaway stream. */
    private Resource wrapReopenable(String storageKey, Resource raw) throws IOException {
        byte[] prefix;
        try (InputStream in = raw.getInputStream()) {
            prefix = in.readNBytes(EncryptedFileFormat.HEADER_LENGTH);
        }
        EncryptedFileFormat.Header header = EncryptedFileFormat.parse(prefix);
        if (header == null) {
            return raw;
        }
        byte[] dek = unwrapDek(header);
        state.auditListener().decrypted(storageKey, header.keyId());
        return new ReopenableDecryptedResource(raw, header, dek);
    }

    /**
     * One-shot delegate (S3 stream): the sniffed prefix must be replayed or decrypted inline. The
     * stream is a live HTTP connection, so every failure path (unknown header version, revoked key,
     * tampered wrap) must close it — leaking here would starve the S3 connection pool precisely
     * when the kill switch is being exercised.
     */
    private Resource wrapOneShot(String storageKey, Resource raw) throws IOException {
        InputStream in = raw.getInputStream();
        try {
            byte[] prefix = in.readNBytes(EncryptedFileFormat.HEADER_LENGTH);
            EncryptedFileFormat.Header header = EncryptedFileFormat.parse(prefix);
            if (header == null) {
                long length;
                try {
                    length = raw.contentLength();
                } catch (IOException | RuntimeException e) {
                    // Stock InputStreamResource refuses contentLength() once the stream is
                    // partially read; S3's resource reports it from the response header instead.
                    length = -1;
                }
                return new OneShotResource(
                        new SequenceInputStream(new ByteArrayInputStream(prefix), in),
                        length,
                        raw.getDescription());
            }
            byte[] dek = unwrapDek(header);
            InputStream decrypting;
            try {
                decrypting = streamingAead(dek).newDecryptingStream(in, header.associatedData());
            } catch (GeneralSecurityException e) {
                throw new StorageEncryptionException("Failed to open decrypting stream", e);
            }
            state.auditListener().decrypted(storageKey, header.keyId());
            return new OneShotResource(decrypting, header.plaintextLength(), raw.getDescription());
        } catch (IOException | RuntimeException e) {
            try {
                in.close();
            } catch (IOException closeFailure) {
                e.addSuppressed(closeFailure);
            }
            throw e;
        }
    }

    /**
     * Fresh decrypting stream per read; supports repeated reads and range-skip consumers. Note a
     * range request still decrypts from byte 0 and discards up to the offset — inherent to
     * streaming AEAD without a seekable-channel implementation.
     */
    private static final class ReopenableDecryptedResource extends AbstractResource {
        private final Resource ciphertext;
        private final EncryptedFileFormat.Header header;
        private final byte[] dek;

        private ReopenableDecryptedResource(
                Resource ciphertext, EncryptedFileFormat.Header header, byte[] dek) {
            this.ciphertext = ciphertext;
            this.header = header;
            this.dek = dek;
        }

        @Override
        public InputStream getInputStream() throws IOException {
            InputStream in = ciphertext.getInputStream();
            try {
                in.skipNBytes(EncryptedFileFormat.HEADER_LENGTH);
                return streamingAead(dek).newDecryptingStream(in, header.associatedData());
            } catch (GeneralSecurityException | IOException e) {
                in.close();
                throw e instanceof IOException io
                        ? io
                        : new StorageEncryptionException("Failed to open decrypting stream", e);
            }
        }

        @Override
        public long contentLength() {
            return header.plaintextLength();
        }

        @Override
        public boolean exists() {
            return ciphertext.exists();
        }

        @Override
        public String getFilename() {
            return ciphertext.getFilename();
        }

        @Override
        public String getDescription() {
            return "decrypted " + ciphertext.getDescription();
        }
    }

    /** Single-use resource over an already-open stream (mirrors InputStreamResource semantics). */
    private static final class OneShotResource extends AbstractResource {
        private final InputStream stream;
        private final long contentLength;
        private final String description;
        private boolean consumed;

        private OneShotResource(InputStream stream, long contentLength, String description) {
            this.stream = stream;
            this.contentLength = contentLength;
            this.description = description;
        }

        @Override
        public synchronized InputStream getInputStream() {
            if (consumed) {
                throw new IllegalStateException(
                        "InputStream has already been read - do not use OneShotResource twice");
            }
            consumed = true;
            return stream;
        }

        @Override
        public long contentLength() {
            return contentLength;
        }

        @Override
        public boolean isOpen() {
            return true;
        }

        @Override
        public boolean exists() {
            return true;
        }

        @Override
        public String getDescription() {
            return "decrypted " + description;
        }
    }

    /** Presents the spooled ciphertext file as the upload the delegate should persist. */
    private static final class SpooledUpload implements MultipartFile {
        private final MultipartFile original;
        private final Path spool;

        private SpooledUpload(MultipartFile original, Path spool) {
            this.original = original;
            this.spool = spool;
        }

        @Override
        public String getName() {
            return original.getName();
        }

        @Override
        public String getOriginalFilename() {
            return original.getOriginalFilename();
        }

        @Override
        public String getContentType() {
            return original.getContentType();
        }

        @Override
        public boolean isEmpty() {
            return getSize() == 0;
        }

        @Override
        public long getSize() {
            try {
                return Files.size(spool);
            } catch (IOException e) {
                throw new IllegalStateException("Spooled ciphertext unavailable", e);
            }
        }

        @Override
        public byte[] getBytes() throws IOException {
            return Files.readAllBytes(spool);
        }

        @Override
        public InputStream getInputStream() throws IOException {
            return Files.newInputStream(spool);
        }

        @Override
        public void transferTo(File dest) throws IOException {
            Files.copy(spool, dest.toPath());
        }
    }
}
