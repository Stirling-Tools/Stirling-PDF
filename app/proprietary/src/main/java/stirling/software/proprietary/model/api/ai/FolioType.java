package stirling.software.proprietary.model.api.ai;

import com.fasterxml.jackson.annotation.JsonValue;

/**
 * Java's classification of a single PDF page after a cheap PDFBox character-count scan. Mirrors the
 * Python {@code FolioType} enum in {@code ledger/models.py}.
 */
public enum FolioType {
    /** Selectable text layer is present — PDFBox can extract text directly. */
    TEXT,
    /** Image-only page — OCRmyPDF is required before any text is available. */
    IMAGE,
    /** Partial text layer plus embedded images — both PDFBox and OCRmyPDF may be useful. */
    MIXED;

    @JsonValue
    public String toJson() {
        return name().toLowerCase();
    }
}
