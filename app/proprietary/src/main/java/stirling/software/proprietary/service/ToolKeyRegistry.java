package stirling.software.proprietary.service;

import java.util.Set;

import org.springframework.stereotype.Component;

/**
 * The tool keys this install will record and rank. Usage rows are keyed by whatever the browser
 * says finished, so without a closed set any caller could write keys no tool will ever match: they
 * would sit in the rankings taking slots the UI then drops, and each distinct one served as {@code
 * currentTool} would open its own cached aggregate over the stats table.
 *
 * <p>Hand-maintained mirror of {@code frontend/editor/src/core/types/toolId.ts} and the proprietary
 * and prototype overrides beside it. {@code ToolKeyRegistryTest} parses those files and fails when
 * the two drift, so adding a tool to the frontend fails the build until it is added here.
 */
@Component
public class ToolKeyRegistry {

    static final Set<String> DEFAULT_KEYS =
            Set.of(
                    // CORE_REGULAR_TOOL_IDS
                    "certSign",
                    "sign",
                    "sharedSign",
                    "addText",
                    "addPassword",
                    "removePassword",
                    "removePages",
                    "removeBlanks",
                    "removeAnnotations",
                    "removeImage",
                    "changePermissions",
                    "watermark",
                    "sanitize",
                    "split",
                    "merge",
                    "convert",
                    "ocr",
                    "addImage",
                    "rotate",
                    "autoRotate",
                    "annotate",
                    "scannerImageSplit",
                    "editTableOfContents",
                    "autoRename",
                    "pageLayout",
                    "scalePages",
                    "adjustContrast",
                    "crop",
                    "pdfToSinglePage",
                    "repair",
                    "compare",
                    "addPageNumbers",
                    "redact",
                    "flatten",
                    "removeCertSign",
                    "unlockPDFForms",
                    "compress",
                    "classify",
                    "extractPages",
                    "reorganizePages",
                    "extractImages",
                    "addStamp",
                    "addAttachments",
                    "createPortfolio",
                    "changeMetadata",
                    "overlayPdfs",
                    "getPdfInfo",
                    "validateSignature",
                    "timestampPdf",
                    "replaceColor",
                    "showJS",
                    "bookletImposition",
                    "pdfTextEditor",
                    "formFill",
                    "autoFormDetection",
                    // CORE_SUPER_TOOL_IDS
                    "multiTool",
                    "read",
                    "automate",
                    // CORE_LINK_TOOL_IDS
                    "devApi",
                    "devFolderScanning",
                    "devSsoGuide",
                    "devAirgapped",
                    // Build-specific overrides: proprietary and prototype super tools
                    "ai-workflow",
                    "pdfCommentAgent");

    /** Longest key the set can hold, so storage can be sized from the data rather than a guess. */
    public static final int MAX_KEY_LENGTH =
            DEFAULT_KEYS.stream().mapToInt(String::length).max().orElse(0);

    private final Set<String> keys;

    public ToolKeyRegistry() {
        this.keys = DEFAULT_KEYS;
    }

    private ToolKeyRegistry(Set<String> keys) {
        this.keys = Set.copyOf(keys);
    }

    /** A registry over an arbitrary key set, so tests can use names of their own. */
    static ToolKeyRegistry forKeys(Set<String> keys) {
        return new ToolKeyRegistry(keys);
    }

    public boolean isKnown(String toolKey) {
        return toolKey != null && keys.contains(toolKey);
    }
}
