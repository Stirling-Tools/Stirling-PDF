package stirling.software.proprietary.model.api.ai;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;

/**
 * Types of content that can be extracted from a PDF and sent to the AI.
 *
 * <p>Values MUST match {@code PdfContentType} in {@code engine/src/stirling/contracts/common.py}.
 */
public enum AiPdfContentType {
    // Document-level structured data
    PAGE_LAYOUT("page_layout"),
    DOCUMENT_METADATA("document_metadata"),
    ENCRYPTION_INFO("encryption_info"),
    BOOKMARKS("bookmarks"),
    LAYERS("layers"),
    EMBEDDED_FILES("embedded_files"),
    JAVASCRIPT("javascript"),
    LINKS("links"),
    IMAGE_INFO("image_info"),
    FONTS("fonts"),

    // Text and content
    PAGE_TEXT("page_text"),
    FULL_TEXT("full_text"),
    FORM_FIELDS("form_fields"),
    ANNOTATIONS("annotations"),
    SIGNATURES("signatures"),
    STRUCTURE_TREE("structure_tree"),
    XMP_METADATA("xmp_metadata"),

    // Heavy content
    COMPLIANCE("compliance"),
    IMAGES("images");

    private final String value;

    AiPdfContentType(String value) {
        this.value = value;
    }

    @JsonValue
    public String getValue() {
        return value;
    }

    @JsonCreator
    public static AiPdfContentType fromValue(String value) {
        for (AiPdfContentType type : values()) {
            if (type.value.equals(value)) {
                return type;
            }
        }
        throw new IllegalArgumentException("Unknown PDF content type: " + value);
    }
}
