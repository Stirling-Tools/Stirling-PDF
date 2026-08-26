package stirling.software.proprietary.pdf.ua;

import java.util.ArrayList;
import java.util.List;

import lombok.Getter;

/** What a tagging run produced, for the conversion report. */
@Getter
public class TaggingResult {

    private final List<String> warnings = new ArrayList<>();
    private final DocumentStructure structure;
    private final boolean rebuilt;
    private final int taggedElements;
    private final int artifacts;
    private final int figuresNeedingAlt;

    /** True when text was hidden as artifacts; the caller must not declare conformance. */
    private final boolean contentSuppressed;

    public TaggingResult(DocumentStructure structure, boolean rebuilt) {
        this.structure = structure;
        this.rebuilt = rebuilt;
        this.warnings.addAll(structure.getWarnings());
        int[] elements = {0};
        structure.visit(
                block -> {
                    if (!block.isArtifact()) {
                        elements[0]++;
                    }
                });
        this.taggedElements = elements[0];
        this.artifacts = structure.artifactCount();
        this.figuresNeedingAlt = structure.figuresWithoutAlt().size();
        this.contentSuppressed = structure.isTextSuppressed();
    }

    public boolean needsHumanReview() {
        return figuresNeedingAlt > 0 || !warnings.isEmpty();
    }
}
