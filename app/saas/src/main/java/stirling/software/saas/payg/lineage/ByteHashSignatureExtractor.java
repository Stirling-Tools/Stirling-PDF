package stirling.software.saas.payg.lineage;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.DigestInputStream;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.Set;

import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

/**
 * SHA-256 of the file's bytes. The simplest universally-applicable signature — works for every
 * content type, doesn't parse, doesn't allocate proportional to file size (fixed 64 KiB read
 * buffer), hardware-accelerated by the JVM on modern hardware (Intel SHA-NI, ARM SHA extensions).
 *
 * <p>Always returns exactly one {@link LineageSignature} of type {@code "sha256"}. A future {@code
 * PdfMetadataSignatureExtractor} would be a separate bean and add its own signature type — composed
 * at the detector layer, no interaction needed here.
 */
@Component
@Profile("saas")
public class ByteHashSignatureExtractor implements LineageSignatureExtractor {

    private static final String ALGORITHM = "SHA-256";
    private static final String SIGNATURE_TYPE = "sha256";
    private static final int BUFFER_SIZE = 64 * 1024;

    @Override
    public Set<LineageSignature> extract(Path file) throws IOException {
        MessageDigest digest = newDigest();
        try (InputStream raw = Files.newInputStream(file);
                DigestInputStream in = new DigestInputStream(raw, digest)) {
            byte[] buf = new byte[BUFFER_SIZE];
            // Drain through the digest stream; we only care about side effects on the digest.
            while (in.read(buf) != -1) {
                // no-op
            }
        }
        String hex = HexFormat.of().formatHex(digest.digest());
        return Set.of(new LineageSignature(SIGNATURE_TYPE, hex));
    }

    @Override
    public String name() {
        return SIGNATURE_TYPE;
    }

    private static MessageDigest newDigest() {
        try {
            return MessageDigest.getInstance(ALGORITHM);
        } catch (NoSuchAlgorithmException e) {
            // SHA-256 is mandated by every JDK; unreachable in practice.
            throw new IllegalStateException(ALGORITHM + " unavailable — JDK is misconfigured", e);
        }
    }
}
