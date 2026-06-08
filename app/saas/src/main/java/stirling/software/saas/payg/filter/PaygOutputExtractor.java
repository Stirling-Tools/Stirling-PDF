package stirling.software.saas.payg.filter;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Objects;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;

/**
 * Extracts the PDF artefacts from a controller's response body for lineage OUTPUT recording. Two
 * content-type paths:
 *
 * <ul>
 *   <li>{@code application/pdf} — return the response body path verbatim (the wrapper already
 *       materialised it to disk).
 *   <li>{@code application/zip} — iterate entries; each that has a {@code .pdf} extension AND
 *       starts with the {@code %PDF-} magic-byte sequence becomes one extracted {@link Path}.
 * </ul>
 *
 * <p>Anything else yields an empty list — non-PDF responses don't drive lineage matching. Encrypted
 * ZIPs, malformed entries, and IO failures log at debug and yield an empty list (per design §15
 * fail-open). Nested ZIP-of-ZIPs is intentionally out of scope: only outer-level PDFs are
 * extracted.
 *
 * <p>Each extracted ZIP entry is written to its own {@link TempFile} returned in the result list.
 * Callers are responsible for closing those temp files — typically the interceptor closes them in
 * the same {@code afterCompletion} that calls this extractor. The whole-response body path is owned
 * by the wrapper and is NOT in the returned list when extraction takes the direct-PDF path.
 */
@Slf4j
@Component
@Profile("saas")
public class PaygOutputExtractor {

    /** {@code %PDF-} in ASCII. */
    private static final byte[] PDF_MAGIC = {0x25, 0x50, 0x44, 0x46, 0x2D};

    private static final String ZIP_CONTENT_TYPE = "application/zip";
    private static final String PDF_CONTENT_TYPE = "application/pdf";

    private final TempFileManager tempFileManager;

    public PaygOutputExtractor(TempFileManager tempFileManager) {
        this.tempFileManager = Objects.requireNonNull(tempFileManager, "tempFileManager");
    }

    /**
     * Extract PDF paths from {@code bodyPath} according to {@code contentType}. The returned list
     * carries {@link ExtractedPdf} records — each wraps a {@link Path} and an indicator of whether
     * the caller owns the temp file lifecycle.
     *
     * @param contentType the response Content-Type header (may be null / parametrised — only the
     *     base media type is inspected)
     * @param bodyPath the on-disk full response body (from the wrapper's {@code materialisedPath})
     * @return zero-or-more PDFs extracted from the body. Empty when content type is not PDF/ZIP,
     *     when extraction failed, when no entries matched, or when {@code bodyPath} is null.
     */
    public List<ExtractedPdf> extract(String contentType, Path bodyPath) {
        if (bodyPath == null) {
            return List.of();
        }
        String mediaType = stripParameters(contentType);
        if (PDF_CONTENT_TYPE.equalsIgnoreCase(mediaType)) {
            // Wrapper-owned path. Don't claim ownership.
            return List.of(new ExtractedPdf(bodyPath, null));
        }
        if (ZIP_CONTENT_TYPE.equalsIgnoreCase(mediaType)) {
            return extractZip(bodyPath);
        }
        return List.of();
    }

    private List<ExtractedPdf> extractZip(Path bodyPath) {
        List<ExtractedPdf> results = new ArrayList<>();
        try (InputStream rawIn = Files.newInputStream(bodyPath);
                ZipInputStream zin = new ZipInputStream(rawIn)) {
            ZipEntry entry;
            while ((entry = zin.getNextEntry()) != null) {
                try {
                    if (entry.isDirectory()) {
                        continue;
                    }
                    String name = entry.getName();
                    if (name == null || !name.toLowerCase(Locale.ROOT).endsWith(".pdf")) {
                        continue;
                    }
                    TempFile temp = tempFileManager.createManagedTempFile(".pdf");
                    Files.copy(zin, temp.getPath(), StandardCopyOption.REPLACE_EXISTING);
                    if (isPdfMagic(temp.getPath())) {
                        results.add(new ExtractedPdf(temp.getPath(), temp));
                    } else {
                        temp.close();
                    }
                } finally {
                    zin.closeEntry();
                }
            }
        } catch (IOException | IllegalArgumentException e) {
            // ZipException extends IOException; IllegalArgumentException covers ZipEntry
            // "MALFORMED" surfaces from zlib. Fail-open: caller still serves the response.
            log.debug(
                    "ZIP unpack failed for response body {} ({}); skipping per-PDF OUTPUT recording",
                    bodyPath,
                    e.getClass().getSimpleName());
            // Close anything we already opened.
            for (ExtractedPdf p : results) {
                p.close();
            }
            return List.of();
        }
        return results;
    }

    private boolean isPdfMagic(Path path) {
        byte[] head = new byte[PDF_MAGIC.length];
        try (InputStream in = Files.newInputStream(path)) {
            int read = in.read(head);
            if (read != PDF_MAGIC.length) {
                return false;
            }
            for (int i = 0; i < PDF_MAGIC.length; i++) {
                if (head[i] != PDF_MAGIC[i]) {
                    return false;
                }
            }
            return true;
        } catch (IOException e) {
            log.debug("PDF magic-byte check failed for {}", path, e);
            return false;
        }
    }

    private static String stripParameters(String contentType) {
        if (contentType == null) {
            return null;
        }
        int semi = contentType.indexOf(';');
        return (semi < 0 ? contentType : contentType.substring(0, semi)).trim();
    }

    /**
     * One PDF extracted from the response body. {@link #ownedTempFile} is non-null only when this
     * extractor created the temp file (ZIP entries); the {@link #path} for direct-PDF responses
     * remains owned by the wrapper.
     */
    public record ExtractedPdf(Path path, TempFile ownedTempFile) implements AutoCloseable {
        @Override
        public void close() {
            if (ownedTempFile != null) {
                ownedTempFile.close();
            }
        }
    }
}
