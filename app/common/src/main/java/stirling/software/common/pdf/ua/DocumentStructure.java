package stirling.software.common.pdf.ua;

import java.util.ArrayList;
import java.util.List;
import java.util.function.Consumer;

import lombok.Getter;
import lombok.Setter;

/** The derived logical structure of a document, ready for serialisation into a structure tree. */
@Getter
@Setter
public class DocumentStructure {

    /** Top-level blocks in document reading order. */
    private final List<StructBlock> blocks = new ArrayList<>();

    /** Warnings raised during analysis, surfaced in the conversion report. */
    private final List<String> warnings = new ArrayList<>();

    private String title;
    private String language;

    /**
     * True when real text had to be wrapped as artifacts, which must block any conformance claim.
     */
    private boolean textSuppressed;

    /** Body text size used as the baseline for heading detection, in points. */
    private float bodyFontSize;

    public void add(StructBlock block) {
        blocks.add(block);
    }

    public void warn(String message) {
        if (!warnings.contains(message)) {
            warnings.add(message);
        }
    }

    public void visit(Consumer<StructBlock> visitor) {
        blocks.forEach(block -> block.visit(visitor));
    }

    public int count(StructType type) {
        int[] total = {0};
        visit(
                block -> {
                    if (block.getType() == type) {
                        total[0]++;
                    }
                });
        return total[0];
    }

    public int artifactCount() {
        int[] total = {0};
        visit(
                block -> {
                    if (block.isArtifact()) {
                        total[0]++;
                    }
                });
        return total[0];
    }

    /** Figures with no alternative description, the most common PDF/UA failure. */
    public List<StructBlock> figuresWithoutAlt() {
        List<StructBlock> missing = new ArrayList<>();
        visit(
                block -> {
                    if ((block.getType() == StructType.FIGURE
                                    || block.getType() == StructType.FORMULA)
                            && (block.getAlt() == null || block.getAlt().isBlank())
                            && (block.getActualText() == null || block.getActualText().isBlank())) {
                        missing.add(block);
                    }
                });
        return missing;
    }

    public boolean isEmpty() {
        return blocks.isEmpty();
    }
}
