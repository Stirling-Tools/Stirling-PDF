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

    /** {@code PK\x03\x04} — local file header for any non-empty ZIP. */
    private static final byte[] ZIP_MAGIC = {0x50, 0x4B, 0x03, 0x04};

    private static final String ZIP_CONTENT_TYPE = "application/zip";
    private static final String PDF_CONTENT_TYPE = "application/pdf";
    private static final String OCTET_STREAM_CONTENT_TYPE = "application/octet-stream";

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
            // Wrapper-owned path. Don't claim ownership. Magic-byte check protects against tools
            // that emit application/pdf for non-PDF payloads (mirrors the ZIP-entry path below).
            if (!isPdfMagic(bodyPath)) {
                log.debug(
                        "Response advertised application/pdf but content does not start with"
                                + " %PDF- magic bytes; skipping OUTPUT recording. body={}",
                        bodyPath);
                return List.of();
            }
            return List.of(new ExtractedPdf(bodyPath, null));
        }
        if (ZIP_CONTENT_TYPE.equalsIgnoreCase(mediaType)) {
            return extractZip(bodyPath);
        }
        // Stirling-PDF tool endpoints sometimes set Content-Type to application/octet-stream (or
        // no header at all) even when the body is a real PDF or ZIP — Spring's default
        // StreamingResponseBody path doesn't always negotiate content type. When the declared
        // Content-Type is missing or generic, sniff magic bytes in a single head-read so we don't
        // open the body twice on the common negative path.
        if (mediaType == null || OCTET_STREAM_CONTENT_TYPE.equalsIgnoreCase(mediaType)) {
            BodyMagic magic = sniffMagic(bodyPath);
            if (magic == BodyMagic.PDF) {
                return List.of(new ExtractedPdf(bodyPath, null));
            }
            if (magic == BodyMagic.ZIP) {
                return extractZip(bodyPath);
            }
        }
        return List.of();
    }

    /** Discriminator returned by {@link #sniffMagic(Path)}. */
    private enum BodyMagic {
        PDF,
        ZIP,
        NEITHER
    }

    /**
     * Single-pass magic-byte sniff used by the generic Content-Type branch. Opens {@code path}
     * once, reads enough bytes to compare against both PDF and ZIP magics, returns the first match
     * (or {@link BodyMagic#NEITHER} if neither matched / read failed). Replaces two consecutive
     * {@link #isMagic} calls that would have opened the file twice on the common negative path.
     */
    private BodyMagic sniffMagic(Path path) {
        int needed = Math.max(PDF_MAGIC.length, ZIP_MAGIC.length);
        byte[] head = new byte[needed];
        int read;
        try (InputStream in = Files.newInputStream(path)) {
            read = in.read(head);
        } catch (IOException e) {
            log.debug("Magic-byte sniff failed for {}", path, e);
            return BodyMagic.NEITHER;
        }
        if (read >= PDF_MAGIC.length && startsWith(head, PDF_MAGIC)) {
            return BodyMagic.PDF;
        }
        if (read >= ZIP_MAGIC.length && startsWith(head, ZIP_MAGIC)) {
            return BodyMagic.ZIP;
        }
        return BodyMagic.NEITHER;
    }

    private static boolean startsWith(byte[] buf, byte[] prefix) {
        for (int i = 0; i < prefix.length; i++) {
            if (buf[i] != prefix[i]) {
                return false;
            }
        }
        return true;
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
        return isMagic(path, PDF_MAGIC);
    }

    /** Returns true if the first {@code magic.length} bytes of {@code path} equal {@code magic}. */
    private boolean isMagic(Path path, byte[] magic) {
        byte[] head = new byte[magic.length];
        try (InputStream in = Files.newInputStream(path)) {
            int read = in.read(head);
            if (read != magic.length) {
                return false;
            }
            for (int i = 0; i < magic.length; i++) {
                if (head[i] != magic[i]) {
                    return false;
                }
            }
            return true;
        } catch (IOException e) {
            log.debug("Magic-byte check failed for {}", path, e);
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
