package stirling.software.SPDF.pdf.redaction;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.regex.Pattern;
import java.util.regex.PatternSyntaxException;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.io.IOUtils;
import org.apache.pdfbox.io.RandomAccessReadBufferedFile;
import org.apache.pdfbox.pdmodel.PDDocument;

import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.utils.text.TextFinderUtils;
import stirling.software.common.util.ExceptionUtils;
import stirling.software.common.util.RegexPatternUtils;

/**
 * Post-redaction assurance pass: scrubs the out-of-page carriers the redaction engine does not
 * touch (bookmarks, annotations, form values, JavaScript, embedded files, XMP) and then verifies
 * the target is really gone from the output. Fails closed - callers get a {@link
 * RedactionVerificationFailedException} (HTTP 422) instead of a document that only looks redacted.
 */
@Slf4j
public final class RedactionAssurance {

    private RedactionAssurance() {}

    /** Literals and patterns to scrub and verify, derived from one redaction request. */
    public record Targets(Set<String> literals, List<Pattern> patterns) {

        public boolean isEmpty() {
            return literals.isEmpty() && patterns.isEmpty();
        }
    }

    /**
     * Bare literals are matched as substrings, mirroring what the engine removes; regex and
     * whole-word requests go through compiled patterns so a legitimate substring survivor (redact
     * "Smith" whole-word, keep "Smithson") is not reported as a leak. The two are kept mutually
     * exclusive so the carrier scrub keeps its word-boundary guard on literals.
     */
    public static Targets targetsFor(List<String> terms, boolean useRegex, boolean wholeWord) {
        if (terms == null || terms.isEmpty()) {
            return new Targets(Set.of(), List.of());
        }
        // A blank term would match every space in the document, so drop blanks first.
        List<String> cleaned =
                terms.stream().filter(t -> t != null && !t.isBlank()).map(String::trim).toList();
        if (cleaned.isEmpty()) {
            return new Targets(Set.of(), List.of());
        }
        if (useRegex || wholeWord) {
            return new Targets(Set.of(), buildPatterns(cleaned, useRegex, wholeWord));
        }
        return new Targets(new LinkedHashSet<>(cleaned), List.of());
    }

    /**
     * Union of two target sets, for a request that carries literal terms and regex patterns
     * separately. Each term keeps the kind it was built with, so one scrub-and-verify round trip
     * covers both instead of one per kind.
     */
    public static Targets merge(Targets first, Targets second) {
        Set<String> literals = new LinkedHashSet<>(first.literals());
        literals.addAll(second.literals());
        List<Pattern> patterns = new ArrayList<>(first.patterns());
        patterns.addAll(second.patterns());
        return new Targets(literals, patterns);
    }

    /** Build case-insensitive patterns from user input; an invalid regex fails the request. */
    public static List<Pattern> buildPatterns(
            List<String> rawEntries, boolean useRegex, boolean wholeWordSearch) {
        List<Pattern> patterns = new ArrayList<>();
        if (rawEntries == null) {
            return patterns;
        }
        int index = 0;
        for (String raw : rawEntries) {
            index++;
            if (raw == null || raw.trim().isEmpty()) {
                continue;
            }
            String trimmed = raw.trim();
            try {
                String core = useRegex ? trimmed : Pattern.quote(trimmed);
                if (wholeWordSearch) {
                    // Shared with the finder so removal + verification use identical boundaries.
                    core = TextFinderUtils.applyWordBoundaries(trimmed, core);
                }
                patterns.add(RegexPatternUtils.getInstance().createSearchPattern(core, true));
            } catch (PatternSyntaxException e) {
                // Fail closed: silently dropping the pattern would return an unverified 200.
                // Identify it by ordinal - echoing the term would put the secret in the response.
                throw ExceptionUtils.createIllegalArgumentException(
                        "error.redaction.invalid.regex", "Invalid regex pattern #" + index);
            }
        }
        return patterns;
    }

    /**
     * Scrub carriers and verify the file in place; throws when removal cannot be proven.
     *
     * <p>Stays file-to-file throughout: every parse streams off disk with a temp-file stream cache,
     * and the scrubbed document is written to a sibling temp file that replaces {@code pdf} only
     * once verification passes, so a failed verification leaves the input untouched. Buffering the
     * document instead would cost several times the upload size in heap on every redaction, and
     * {@link stirling.software.common.service.CustomPDFDocumentFactory} is deliberately not used
     * here: it slurps files under its small-file threshold into a byte array and re-applies default
     * metadata over the scrub.
     */
    public static void scrubAndVerify(Path pdf, Targets targets) throws IOException {
        if (targets == null || targets.isEmpty()) {
            return;
        }
        Path scrubbed =
                Files.createTempFile(
                        pdf.toAbsolutePath().getParent(), "redaction-assurance", ".pdf");
        try {
            try (PDDocument document = loadFileBacked(pdf)) {
                CatalogScrubber.scrub(document, targets.literals(), targets.patterns());
                RedactionVerifier.warnAboutEmbeddedFontGlyphs(document);
                document.save(scrubbed.toFile());
            } catch (IOException e) {
                // Cannot reopen our own output, so removal cannot be proven.
                throw new RedactionVerificationFailedException(
                        "Could not reopen the redacted PDF to verify removal", e);
            }
            // Re-parsed independently of the scrub, so the check sees the bytes the caller ships.
            try (PDDocument reopened = loadFileBacked(scrubbed)) {
                RedactionVerifier.verify(
                        scrubbed, reopened, targets.literals(), targets.patterns());
            } catch (IOException e) {
                throw new RedactionVerificationFailedException(
                        "Could not reopen the redacted PDF to verify removal", e);
            }
            Files.move(scrubbed, pdf, StandardCopyOption.REPLACE_EXISTING);
        } finally {
            Files.deleteIfExists(scrubbed);
        }
    }

    private static PDDocument loadFileBacked(Path pdf) throws IOException {
        RandomAccessReadBufferedFile source = new RandomAccessReadBufferedFile(pdf.toFile());
        try {
            return Loader.loadPDF(source, "", IOUtils.createTempFileOnlyStreamCache());
        } catch (IOException | RuntimeException e) {
            source.close();
            throw e;
        }
    }
}
