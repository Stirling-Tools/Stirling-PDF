package stirling.software.proprietary.service.ua;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.encryption.InvalidPasswordException;
import org.apache.pdfbox.pdmodel.interactive.form.PDAcroForm;
import org.springframework.stereotype.Service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.proprietary.model.api.ua.PdfUaConversionOutcome;
import stirling.software.proprietary.model.api.ua.UaValidationResult;
import stirling.software.proprietary.pdf.ua.PdfUaProfile;
import stirling.software.proprietary.pdf.ua.PdfUaTagger;
import stirling.software.proprietary.pdf.ua.SourceFacts;
import stirling.software.proprietary.pdf.ua.TaggingOptions;
import stirling.software.proprietary.pdf.ua.TaggingResult;

/**
 * Converts a PDF to PDF/UA. The declaration is written first and withdrawn unless validation
 * passes, so a returned file either conforms or does not claim to.
 */
@Service
@Slf4j
@RequiredArgsConstructor
public class PdfUaConversionService {

    private final PdfUaValidationService validationService;
    private final FontEmbeddingService fontEmbeddingService;
    private final stirling.software.common.service.CustomPDFDocumentFactory pdfDocumentFactory;

    /** Matches the cap GetInfoOnPDF already applies to comparable whole-document work. */
    private static final long MAX_INPUT_BYTES = 100L * 1024 * 1024;

    /** Beyond this the structure model alone runs to hundreds of megabytes. */
    private static final int MAX_PAGES = 2000;

    public PdfUaConversionOutcome convert(byte[] input, TaggingOptions options) throws IOException {
        if (input.length > MAX_INPUT_BYTES) {
            throw new IOException(
                    "This PDF is "
                            + (input.length / (1024 * 1024))
                            + " MB. PDF/UA conversion is limited to "
                            + (MAX_INPUT_BYTES / (1024 * 1024))
                            + " MB.");
        }
        PdfUaProfile profile = options.getProfile();
        List<String> warnings = new ArrayList<>();

        // Read the document's own facts before anything rewrites it. Font embedding runs
        // Ghostscript over the whole file, which discards the structure tree, /Lang and XFA, so
        // every guard and every "what did the source say" question must be answered from here.
        SourceFacts facts;
        try (PDDocument original = load(input)) {
            rejectUnsupportedSource(original);
            warnSignatures(original, warnings);
            facts = SourceFacts.of(original);
        }

        byte[] source = input;
        if (options.isEmbedFonts()) {
            // Must precede tagging: the embedder rewrites the file and drops any structure tree.
            FontEmbeddingService.Result fonts = fontEmbeddingService.embedFonts(input);
            source = fonts.pdfBytes();
            if (fonts.warning() != null) {
                warnings.add(fonts.warning());
            }
            source = keepTagsOverFonts(input, source, facts, options, warnings);
        }

        TaggingOptions effective = options.toBuilder().sourceFacts(facts).build();

        // Tag and declare in one pass; the claim is withdrawn below if validation disagrees.
        byte[] declared;
        TaggingResult taggingResult;
        PdfUaTagger tagger = new PdfUaTagger();
        try (PDDocument document = load(source)) {
            rejectEncrypted(document);
            taggingResult = tagger.tag(document, effective);
            warnings.addAll(taggingResult.getWarnings());
            tagger.declareConformance(document, profile);
            declared = save(document);
        }

        UaValidationResult validation = validationService.validate(declared, profile);

        // A validator cannot see text hidden behind artifact markers, so a clean verdict over
        // suppressed content would be a false claim.
        boolean honest = !taggingResult.isContentSuppressed();

        if (validation.compliant() && honest) {
            log.info("{} conversion passed validation", profile.displayName());
            return new PdfUaConversionOutcome(
                    declared, true, validation, summary(taggingResult), warnings);
        }

        byte[] undeclared;
        try (PDDocument document = load(declared)) {
            tagger.withdrawConformance(document);
            undeclared = save(document);
        }

        if (!validation.compliant()) {
            warnings.add(
                    "The document could not be made "
                            + profile.displayName()
                            + " conformant, so no conformance claim was written. "
                            + validation.totalFailures()
                            + " automated check(s) still fail.");
        }
        log.info(
                "{} conversion left undeclared: {} failures, suppressedText={}",
                profile.displayName(),
                validation.totalFailures(),
                !honest);
        return new PdfUaConversionOutcome(
                undeclared, false, validation, summary(taggingResult), warnings);
    }

    private static PdfUaConversionOutcome.TaggingSummary summary(TaggingResult result) {
        return new PdfUaConversionOutcome.TaggingSummary(
                result.isRebuilt(),
                result.getTaggedElements(),
                result.getArtifacts(),
                result.getFiguresNeedingAlt());
    }

    /**
     * Tagging rewrites the content streams a signature covers, so the conversion still runs but the
     * caller has to know the signature will no longer verify.
     */
    private static void warnSignatures(PDDocument document, List<String> warnings) {
        int signatures = document.getSignatureDictionaries().size();
        if (signatures > 0) {
            warnings.add(
                    signatures
                            + " digital signature(s) will stop verifying: tagging rewrites the"
                            + " content streams they cover. Convert first, then re-sign.");
        }
    }

    /** Replaces PDFBox's "incorrect password" wording, baffling when the caller supplied none. */
    private PDDocument load(byte[] bytes) throws IOException {
        try {
            // The factory spills large documents to a temp-file cache instead of the heap.
            return pdfDocumentFactory.load(bytes);
        } catch (IOException | RuntimeException e) {
            // The factory wraps the parse failure, so check the cause chain rather than the type.
            if (mentionsPassword(e)) {
                throw new IOException(
                        "This PDF is encrypted. Remove the password before converting it to"
                                + " PDF/UA.",
                        e);
            }
            throw e;
        }
    }

    private static boolean mentionsPassword(Throwable error) {
        for (Throwable cause = error; cause != null; cause = cause.getCause()) {
            if (cause instanceof InvalidPasswordException) {
                return true;
            }
            String message = cause.getMessage();
            if (message != null) {
                String lower = message.toLowerCase(Locale.ROOT);
                if (lower.contains("password") || lower.contains("decrypt")) {
                    return true;
                }
            }
        }
        return false;
    }

    /** XFA is forbidden by PDF/UA-1 clause 7.15; encrypted or huge files cannot be restructured. */
    /**
     * Under KEEP nothing rebuilds a tree, so if the embedder deleted one we would hand back an
     * untagged document. Fonts are not worth the whole structure; give the tags back instead.
     */
    private byte[] keepTagsOverFonts(
            byte[] input,
            byte[] embedded,
            SourceFacts facts,
            TaggingOptions options,
            List<String> warnings)
            throws IOException {
        if (options.getExistingTags() != TaggingOptions.ExistingTags.KEEP
                || !facts.hasUsableTree()
                || embedded == input) {
            return embedded;
        }
        boolean survived;
        try (PDDocument rewritten = load(embedded)) {
            survived = PdfUaTagger.hasUsableStructureTree(rewritten);
        }
        if (survived) {
            return embedded;
        }
        warnings.add(
                "Embedding the missing fonts would have deleted the document's existing tags, so"
                        + " the tags were kept and the fonts left unembedded. Turn off font"
                        + " embedding to silence this, or rebuild the tags to embed them.");
        return input;
    }

    /**
     * Checks that must see the document as the author wrote it. Font embedding strips XFA, so
     * running this afterwards would let a dynamic form through unnoticed, and it would push a
     * document we are about to reject through the whole embedder first.
     */
    private static void rejectUnsupportedSource(PDDocument document) throws IOException {
        if (document.getNumberOfPages() > MAX_PAGES) {
            throw new IOException(
                    "This PDF has "
                            + document.getNumberOfPages()
                            + " pages. PDF/UA conversion is limited to "
                            + MAX_PAGES
                            + " pages; split it first.");
        }
        PDAcroForm form = document.getDocumentCatalog().getAcroForm();
        if (form != null && form.xfaIsDynamic()) {
            throw new IOException(
                    "Dynamic XFA forms are not permitted by PDF/UA. Flatten the form first.");
        }
    }

    /**
     * Deliberately checked on the working document rather than the source. Permissions-only
     * encryption with an empty user password is common in published documents, the embedder
     * resolves it, and those files convert usefully; rejecting them up front would fail a document
     * for a password its author never set.
     */
    private static void rejectEncrypted(PDDocument document) throws IOException {
        if (document.isEncrypted()) {
            throw new IOException(
                    "Encrypted PDFs cannot be converted to PDF/UA. Remove the password first.");
        }
    }

    private static byte[] save(PDDocument document) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        document.save(out);
        return out.toByteArray();
    }
}
