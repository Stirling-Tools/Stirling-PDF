package stirling.software.saas.payg.lineage;

import java.io.IOException;
import java.nio.file.Path;
import java.util.Set;

import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

import stirling.software.proprietary.billing.ContentHasher;

/**
 * SHA-256 of the file's bytes. The simplest universally-applicable signature — works for every
 * content type, doesn't parse. Delegates to the shared {@link ContentHasher} so the cloud charge
 * path and a linked self-hosted instance's meter compute byte-identical signatures.
 *
 * <p>Always returns exactly one {@link LineageSignature} of type {@code "sha256"}. A future {@code
 * PdfMetadataSignatureExtractor} would be a separate bean and add its own signature type — composed
 * at the detector layer, no interaction needed here.
 */
@Component
@Profile("saas")
public class ByteHashSignatureExtractor implements LineageSignatureExtractor {

    private static final String SIGNATURE_TYPE = "sha256";

    @Override
    public Set<LineageSignature> extract(Path file) throws IOException {
        return Set.of(new LineageSignature(SIGNATURE_TYPE, ContentHasher.sha256(file)));
    }

    @Override
    public String name() {
        return SIGNATURE_TYPE;
    }
}
