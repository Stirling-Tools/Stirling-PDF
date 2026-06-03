package stirling.software.saas.payg.lineage;

import java.io.IOException;
import java.nio.file.Path;
import java.util.Set;

/**
 * Extracts one or more {@link LineageSignature}s from a file. Lineage is decided at the file level:
 * the extractor sees the whole content and returns whatever identity signals it can pull out.
 *
 * <p>The default {@link ByteHashSignatureExtractor} returns a single SHA-256 of the bytes. A future
 * format-aware extractor (e.g. for PDFs, opening with jpdfium to read {@code /ID[0]} or a
 * content-stream hash) is just another {@link org.springframework.stereotype.Component} bean
 * implementing this interface — no changes to the detector or the store. Multiple extractors can be
 * composed; the detector unions their signatures and matches on any of them.
 *
 * <p>Callers materialise upload bodies / response bodies to a {@link Path} (via {@code
 * TempFileManager}) before extraction so the extractor can stream-hash <em>and</em>, optionally,
 * parse the file with a format-specific library — both from the same on-disk byte sequence.
 */
public interface LineageSignatureExtractor {

    /**
     * Returns every signature this extractor can derive from {@code file}. Empty set is legal —
     * meaning "this extractor doesn't know how to fingerprint this content" — and is normal for
     * format-specific extractors that decline to handle non-matching inputs.
     */
    Set<LineageSignature> extract(Path file) throws IOException;

    /**
     * Short, stable name for logging and diagnostics ({@code "sha256"}, {@code "pdf-id"}, etc.).
     */
    String name();
}
