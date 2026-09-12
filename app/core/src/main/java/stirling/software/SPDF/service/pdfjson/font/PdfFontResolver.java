package stirling.software.SPDF.service.pdfjson.font;

import java.util.Map;

import org.springframework.stereotype.Component;

import stirling.software.SPDF.model.json.PdfJsonFont;

@Component
public class PdfFontResolver {

    /**
     * Build a font key used across the PDF JSON conversion code. Includes optional jobId prefix to
     * ensure uniqueness across concurrent jobs.
     */
    public String buildFontKey(String jobId, int pageNumber, String fontId) {
        String jobPrefix = (jobId != null && !jobId.isEmpty()) ? jobId + ":" : "";
        return jobPrefix + pageNumber + ":" + fontId;
    }

    /** Overload accepting nullable Integer pageNumber. */
    public String buildFontKey(String jobId, Integer pageNumber, String fontId) {
        int page = pageNumber != null ? pageNumber : -1;
        return buildFontKey(jobId, page, fontId);
    }

    /**
     * Resolve a PdfJsonFont from a lookup map using a page-scoped key first, then falling back to
     * an unscoped (-1) key. This preserves the original lookup behavior.
     */
    public PdfJsonFont resolve(Map<String, PdfJsonFont> lookup, int pageNumber, String fontId) {
        if (lookup == null || fontId == null) {
            return null;
        }
        PdfJsonFont model = lookup.get(buildFontKey(null, pageNumber, fontId));
        if (model != null) {
            return model;
        }
        return lookup.get(buildFontKey(null, -1, fontId));
    }
}
