package stirling.software.proprietary.pdf.ua;

import java.util.ArrayList;
import java.util.List;
import java.util.function.Consumer;

import lombok.Getter;
import lombok.Setter;

/**
 * One node of the derived logical structure: either page content (ranges of markable operator
 * ordinals) or child blocks. Containers with no content are pruned before serialisation.
 */
@Getter
@Setter
public class StructBlock {

    /** A contiguous, inclusive run of markable operator ordinals within one page stream. */
    public record OrdinalRange(int start, int end) {
        public boolean contains(int ordinal) {
            return ordinal >= start && ordinal <= end;
        }

        public int size() {
            return end - start + 1;
        }
    }

    private StructType type;
    private ArtifactType artifactType;
    private int pageIndex;
    private BBox bbox = BBox.EMPTY;
    private String text = "";

    private final List<OrdinalRange> ranges = new ArrayList<>();
    private final List<StructBlock> children = new ArrayList<>();

    /** {@code /Alt} - required on Figure and Formula for PDF/UA. */
    private String alt;

    /** {@code /ActualText} - replacement text for content whose glyphs do not spell the word. */
    private String actualText;

    /** {@code /Lang} - set only where it differs from the document default. */
    private String lang;

    /** {@code /Scope} on a TH: Row, Column or Both. */
    private String scope;

    /** {@code /ListNumbering} on an L. */
    private String listNumbering;

    /** Unique {@code /ID}, required on Note and FENote elements. */
    private String id;

    /**
     * Marked content ids assigned during injection; one block yields several when split, since a
     * sequence must nest inside BT/ET and q/Q rather than straddle them.
     */
    private final List<Integer> mcids = new ArrayList<>();

    /** True when the source content was already inside a marked-content sequence. */
    private boolean preMarked;

    public StructBlock(StructType type, int pageIndex) {
        this.type = type;
        this.pageIndex = pageIndex;
    }

    public static StructBlock artifact(ArtifactType artifactType, int pageIndex) {
        StructBlock block = new StructBlock(StructType.ARTIFACT, pageIndex);
        block.artifactType = artifactType;
        return block;
    }

    public StructBlock addChild(StructBlock child) {
        children.add(child);
        return this;
    }

    public StructBlock addRange(int start, int end) {
        ranges.add(new OrdinalRange(start, end));
        return this;
    }

    public boolean isArtifact() {
        return type == StructType.ARTIFACT;
    }

    /** Depth-first walk over this block and all descendants. */
    public void visit(Consumer<StructBlock> visitor) {
        visitor.accept(this);
        for (StructBlock child : children) {
            child.visit(visitor);
        }
    }

    /** Total number of ordinals owned by this block and its descendants. */
    public int contentCount() {
        int total = ranges.stream().mapToInt(OrdinalRange::size).sum();
        for (StructBlock child : children) {
            total += child.contentCount();
        }
        return total;
    }

    /** Concatenated text of this block and its descendants, in tree order. */
    public String collectText() {
        StringBuilder sb = new StringBuilder();
        visit(
                block -> {
                    if (!block.text.isBlank()) {
                        if (sb.length() > 0) {
                            sb.append(' ');
                        }
                        sb.append(block.text.strip());
                    }
                });
        return sb.toString();
    }

    @Override
    public String toString() {
        return type.tag()
                + (artifactType != null ? "[" + artifactType.subtype() + "]" : "")
                + "(p"
                + pageIndex
                + ", "
                + ranges.size()
                + " ranges, "
                + children.size()
                + " kids)";
    }
}
