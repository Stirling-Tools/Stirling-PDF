package stirling.software.common.service;

import java.util.Calendar;
import java.util.List;

import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.graphics.color.PDColor;
import org.apache.pdfbox.pdmodel.graphics.color.PDDeviceRGB;
import org.apache.pdfbox.pdmodel.interactive.annotation.PDAnnotationText;
import org.springframework.stereotype.Service;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.api.comments.AnnotationLocation;
import stirling.software.common.model.api.comments.StickyNoteSpec;

/**
 * Shared primitive for adding sticky-note (PDF Text) annotations to a document.
 *
 * <p>Used by:
 *
 * <ul>
 *   <li>{@code /api/v1/misc/add-comments} — a deterministic, reusable tool.
 *   <li>AI-agent flows that generate comment specs (e.g. PDF review agent, math auditor review
 *       mode) and hand them off to this service for deterministic placement.
 * </ul>
 */
@Slf4j
@Service
public class PdfAnnotationService {

    /** Yellow sticky-note fill colour (R, G, B in 0..1 range). */
    private static final float[] STICKY_NOTE_COLOR_RGB = {1f, 0.95f, 0.4f};

    /** Opacity for the sticky-note icon. */
    private static final float ANNOTATION_OPACITY = 0.9f;

    /** PDF Text-annotation icon name — {@code "Comment"} is one of the standard icons. */
    private static final String ANNOTATION_ICON_NAME = "Comment";

    /** Default subject shown in the annotation popup when a spec does not supply one. */
    private static final String DEFAULT_SUBJECT = "Stirling AI Comment";

    /** Default author label shown in the annotation popup when a spec does not supply one. */
    private static final String DEFAULT_AUTHOR = "Stirling AI";

    /**
     * Cap on sticky-note text length. PDF annotation bodies can technically be much longer, but
     * anything beyond this is almost certainly pathological (accidental document-dump or malicious
     * payload) and would bloat the output file.
     */
    private static final int MAX_COMMENT_TEXT_LENGTH = 100_000;

    /**
     * Add a list of sticky notes to {@code doc}. Specs that reference an out-of-range page or
     * contain blank text are logged and skipped; this method never throws for a single bad spec.
     *
     * @return the number of annotations actually applied
     */
    public int addStickyNotes(PDDocument doc, List<StickyNoteSpec> specs) {
        if (specs == null || specs.isEmpty()) {
            return 0;
        }
        int totalPages = doc.getNumberOfPages();
        Calendar now = Calendar.getInstance();
        int applied = 0;
        for (int i = 0; i < specs.size(); i++) {
            StickyNoteSpec spec = specs.get(i);
            if (!isValid(spec, totalPages, i)) {
                continue;
            }
            apply(doc, spec, now);
            applied++;
        }
        if (applied < specs.size()) {
            log.warn(
                    "Applied {}/{} sticky notes; {} skipped due to invalid specs.",
                    applied,
                    specs.size(),
                    specs.size() - applied);
        }
        return applied;
    }

    /**
     * Add a single sticky note. Convenience wrapper; prefer {@link #addStickyNotes(PDDocument,
     * List)} when placing multiple annotations so log output is batched.
     */
    public void addStickyNote(PDDocument doc, StickyNoteSpec spec) {
        addStickyNotes(doc, List.of(spec));
    }

    private boolean isValid(StickyNoteSpec spec, int totalPages, int index) {
        if (spec == null || spec.location() == null) {
            log.warn("Skipping sticky-note[{}]: spec or location is null.", index);
            return false;
        }
        if (spec.text() == null || spec.text().isBlank()) {
            log.warn("Skipping sticky-note[{}]: text is blank.", index);
            return false;
        }
        if (spec.text().length() > MAX_COMMENT_TEXT_LENGTH) {
            log.warn(
                    "Skipping sticky-note[{}]: text length {} exceeds limit {}.",
                    index,
                    spec.text().length(),
                    MAX_COMMENT_TEXT_LENGTH);
            return false;
        }
        AnnotationLocation loc = spec.location();
        if (loc.width() <= 0f || loc.height() <= 0f) {
            log.warn(
                    "Skipping sticky-note[{}]: non-positive dimensions width={} height={}.",
                    index,
                    loc.width(),
                    loc.height());
            return false;
        }
        int page = loc.pageIndex();
        if (page < 0 || page >= totalPages) {
            log.warn(
                    "Skipping sticky-note[{}]: pageIndex={} out of range [0, {}).",
                    index,
                    page,
                    totalPages);
            return false;
        }
        return true;
    }

    private void apply(PDDocument doc, StickyNoteSpec spec, Calendar now) {
        AnnotationLocation loc = spec.location();

        PDAnnotationText annot = new PDAnnotationText();
        annot.setContents(spec.text());
        annot.setRectangle(new PDRectangle(loc.x(), loc.y(), loc.width(), loc.height()));
        annot.setSubject(nonBlankOr(spec.subject(), DEFAULT_SUBJECT));
        annot.setTitlePopup(nonBlankOr(spec.author(), DEFAULT_AUTHOR));
        annot.setColor(new PDColor(STICKY_NOTE_COLOR_RGB, PDDeviceRGB.INSTANCE));
        annot.setCreationDate(now);
        annot.setConstantOpacity(ANNOTATION_OPACITY);
        annot.getCOSObject().setName(COSName.NAME, ANNOTATION_ICON_NAME);

        try {
            doc.getPage(loc.pageIndex()).getAnnotations().add(annot);
        } catch (java.io.IOException e) {
            log.warn(
                    "Failed to attach sticky note to page {}: {}", loc.pageIndex(), e.getMessage());
        }
    }

    private static String nonBlankOr(String value, String fallback) {
        return value != null && !value.isBlank() ? value : fallback;
    }
}
