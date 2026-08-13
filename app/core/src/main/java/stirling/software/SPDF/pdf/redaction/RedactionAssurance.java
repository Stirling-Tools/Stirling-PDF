package stirling.software.SPDF.pdf.redaction;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.regex.Pattern;
import java.util.regex.PatternSyntaxException;

import org.apache.pdfbox.Loader;
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

    /** Build case-insensitive patterns from user input; an invalid regex fails the request. */
    public static List<Pattern> buildPatterns(
            List<String> rawEntries, boolean useRegex, boolean wholeWordSearch) {
        List<Pattern> patterns = new ArrayList<>();
        if (rawEntries == null) {
            return patterns;
        }
        for (String raw : rawEntries) {
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
                throw ExceptionUtils.createIllegalArgumentException(
                        "error.redaction.invalid.regex", "Invalid regex pattern");
            }
        }
        return patterns;
    }

    /** Scrub carriers and verify the file in place; throws when removal cannot be proven. */
    public static void scrubAndVerify(Path pdf, Targets targets) throws IOException {
        if (targets == null || targets.isEmpty()) {
            return;
        }
        byte[] scrubbed = scrubAndVerify(Files.readAllBytes(pdf), targets);
        Files.write(pdf, scrubbed);
    }

    /** Scrub carriers and verify; returns the scrubbed bytes, or throws if a target survives. */
    public static byte[] scrubAndVerify(byte[] pdfBytes, Targets targets) throws IOException {
        if (targets == null || targets.isEmpty()) {
            return pdfBytes;
        }
        byte[] scrubbed;
        try (PDDocument document = Loader.loadPDF(pdfBytes)) {
            CatalogScrubber.scrub(document, targets.literals(), targets.patterns());
            RedactionVerifier.warnAboutEmbeddedFontGlyphs(document);
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            document.save(out);
            scrubbed = out.toByteArray();
        } catch (IOException e) {
            // Cannot reopen our own output, so removal cannot be proven.
            throw new RedactionVerificationFailedException(
                    "Could not reopen the redacted PDF to verify removal", e);
        }
        RedactionVerifier.verify(scrubbed, targets.literals(), targets.patterns());
        return scrubbed;
    }

    /** Convenience for callers that only have raw request terms. */
    public static void scrubAndVerify(
            Path pdf, List<String> terms, boolean useRegex, boolean wholeWord) throws IOException {
        scrubAndVerify(
                pdf,
                targetsFor(terms == null ? Collections.emptyList() : terms, useRegex, wholeWord));
    }
}
