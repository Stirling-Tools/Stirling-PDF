package stirling.software.proprietary.pdf.ua;

import java.io.IOException;
import java.io.OutputStream;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.apache.pdfbox.contentstream.operator.Operator;
import org.apache.pdfbox.cos.COSBase;
import org.apache.pdfbox.cos.COSDictionary;
import org.apache.pdfbox.cos.COSInteger;
import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.pdfparser.PDFStreamParser;
import org.apache.pdfbox.pdfwriter.ContentStreamWriter;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.common.PDStream;

import lombok.extern.slf4j.Slf4j;

/**
 * Rewrites a page stream so every markable operator sits inside a marked-content sequence: claimed
 * content gets an MCID, everything else /Artifact, satisfying PDF/UA-1 clause 7.1 by construction.
 */
@Slf4j
public class MarkedContentInjector {

    private static final COSName ARTIFACT = COSName.getPDFName("Artifact");
    private static final COSName MCID = COSName.getPDFName("MCID");
    private static final COSName ACTUAL_TEXT = COSName.getPDFName("ActualText");
    private static final COSName ALT = COSName.getPDFName("Alt");

    /** Operators that force an open sequence to close so nesting stays legal. */
    private static boolean isBoundary(String name) {
        return "BT".equals(name) || "ET".equals(name) || "q".equals(name) || "Q".equals(name);
    }

    private static boolean isMarkedContentOperator(String name) {
        return "BDC".equals(name) || "BMC".equals(name) || "EMC".equals(name);
    }

    /**
     * Path-construction operators; ISO 32000-1 forbids marked content inside a path object, so a
     * sequence wrapping a fill or stroke must open before the path starts.
     */
    private static boolean isPathConstruction(String name) {
        return switch (name) {
            case "m", "l", "c", "v", "y", "h", "re" -> true;
            default -> false;
        };
    }

    private static boolean opensMarkedContent(String name) {
        return "BDC".equals(name) || "BMC".equals(name);
    }

    /**
     * True for an optional-content sequence; stripping an {@code /OC} wrapper would make hidden
     * layers such as watermarks or redaction overlays visible.
     */
    private static boolean isOptionalContent(String name, List<COSBase> operands) {
        return opensMarkedContent(name)
                && !operands.isEmpty()
                && operands.get(0) instanceof COSName tag
                && "OC".equals(tag.getName());
    }

    /**
     * True when a sequence supplies replacement text for its glyphs; dropping it leaves a screen
     * reader with the font's own mapping, which for a ligature says nothing useful.
     */
    private static boolean carriesReplacementText(String name, List<COSBase> operands) {
        if (!opensMarkedContent(name)) {
            return false;
        }
        for (COSBase operand : operands) {
            if (operand instanceof COSDictionary properties
                    && (properties.containsKey(ACTUAL_TEXT)
                            || properties.containsKey(ALT)
                            || properties.containsKey(COSName.E))) {
                return true;
            }
        }
        return false;
    }

    /** The source's own ids mean nothing once the tree is rebuilt, so they are dropped. */
    private static void stripStaleMcid(List<COSBase> operands) {
        for (COSBase operand : operands) {
            if (operand instanceof COSDictionary properties) {
                properties.removeItem(MCID);
            }
        }
    }

    /** Wraps every markable operator on the page; returns the next unused marked content id. */
    public int inject(
            PDDocument document,
            PDPage page,
            List<StructBlock> blocks,
            int nextMcid,
            boolean stripExisting)
            throws IOException {

        Map<Integer, StructBlock> owners = ownersByOrdinal(blocks);
        List<Object> tokens = parse(page);
        List<Object> output = new ArrayList<>(tokens.size() + owners.size() * 4);

        List<COSBase> operands = new ArrayList<>();
        // Tracks, for each surviving source sequence, whether its closer should be kept.
        Deque<Boolean> keptSequences = new ArrayDeque<>();
        StructBlock openBlock = null;
        boolean open = false;
        int ordinal = -1;
        int mcid = nextMcid;
        int pathStart = -1;

        for (Object token : tokens) {
            if (!(token instanceof Operator operator)) {
                operands.add((COSBase) token);
                continue;
            }
            String name = operator.getName();

            if (stripExisting && isMarkedContentOperator(name)) {
                boolean keep;
                if (opensMarkedContent(name)) {
                    keep =
                            isOptionalContent(name, operands)
                                    || carriesReplacementText(name, operands);
                    if (keep) {
                        stripStaleMcid(operands);
                    }
                    keptSequences.push(keep);
                } else {
                    // A closer is kept exactly when its matching opener was.
                    keep = !keptSequences.isEmpty() && keptSequences.pop();
                }
                if (!keep) {
                    operands.clear();
                    continue;
                }
                // Close our own sequence first so the two never interleave illegally.
                if (open) {
                    output.add(Operator.getOperator("EMC"));
                    open = false;
                    openBlock = null;
                }
                output.addAll(operands);
                output.add(operator);
                operands.clear();
                continue;
            }

            if (isBoundary(name) && open) {
                output.add(Operator.getOperator("EMC"));
                open = false;
                openBlock = null;
            }

            // Remember where the current path object began so a sequence wrapping its painting
            // operator can be opened before it rather than inside it.
            if (isPathConstruction(name)) {
                if (pathStart < 0) {
                    pathStart = output.size();
                }
            } else if (!MarkableOp.isPathPainting(name) && !"n".equals(name)) {
                pathStart = -1;
            }

            if (MarkableOp.isMarkableOperator(name)) {
                ordinal++;
                StructBlock owner = owners.get(ordinal);
                if (!open || owner != openBlock) {
                    boolean insidePath = MarkableOp.isPathPainting(name) && pathStart >= 0;
                    if (open) {
                        // Close before the path began, so the EMC also stays outside the path.
                        output.add(
                                insidePath ? pathStart : output.size(),
                                Operator.getOperator("EMC"));
                        if (insidePath) {
                            pathStart++;
                        }
                    }
                    int at = insidePath ? pathStart : output.size();
                    mcid = openSequenceAt(output, at, owner, mcid);
                    open = true;
                    openBlock = owner;
                }
            }

            output.addAll(operands);
            output.add(operator);
            operands.clear();

            if (MarkableOp.isPathPainting(name) || "n".equals(name)) {
                pathStart = -1;
            }
        }

        if (open) {
            output.add(Operator.getOperator("EMC"));
        }

        write(document, page, output);
        return mcid;
    }

    /** Emits the opening BDC/BMC at a given position and records the id on the owning block. */
    private int openSequenceAt(List<Object> output, int at, StructBlock owner, int mcid) {
        List<Object> opening = new ArrayList<>(3);
        if (owner == null) {
            opening.add(ARTIFACT);
            opening.add(Operator.getOperator("BMC"));
        } else if (owner.isArtifact()) {
            COSDictionary properties = new COSDictionary();
            if (owner.getArtifactType() != null) {
                properties.setName(COSName.TYPE, owner.getArtifactType().subtype());
            }
            opening.add(ARTIFACT);
            opening.add(properties);
            opening.add(Operator.getOperator("BDC"));
        } else {
            COSDictionary properties = new COSDictionary();
            properties.setItem(MCID, COSInteger.get(mcid));
            opening.add(COSName.getPDFName(owner.getType().tag()));
            opening.add(properties);
            opening.add(Operator.getOperator("BDC"));
            owner.getMcids().add(mcid);
            mcid++;
        }
        output.addAll(at, opening);
        return mcid;
    }

    /**
     * Maps each claimed ordinal to its block. Overlapping claims are dropped rather than merged:
     * two structure elements sharing content would make the reading order ambiguous.
     */
    static Map<Integer, StructBlock> ownersByOrdinal(List<StructBlock> blocks) {
        Map<Integer, StructBlock> owners = new HashMap<>();
        for (StructBlock block : blocks) {
            block.visit(
                    node -> {
                        for (StructBlock.OrdinalRange range : node.getRanges()) {
                            for (int i = range.start(); i <= range.end(); i++) {
                                StructBlock existing = owners.putIfAbsent(i, node);
                                if (existing != null && existing != node) {
                                    log.debug(
                                            "Ordinal {} claimed by both {} and {}; keeping the first",
                                            i,
                                            existing,
                                            node);
                                }
                            }
                        }
                    });
        }
        return owners;
    }

    private static List<Object> parse(PDPage page) throws IOException {
        PDFStreamParser parser = new PDFStreamParser(page);
        List<Object> tokens = new ArrayList<>();
        Object token;
        while ((token = parser.parseNextToken()) != null) {
            tokens.add(token);
        }
        return tokens;
    }

    private static void write(PDDocument document, PDPage page, List<Object> tokens)
            throws IOException {
        PDStream stream = new PDStream(document);
        try (OutputStream out = stream.createOutputStream(COSName.FLATE_DECODE)) {
            new ContentStreamWriter(out).writeTokens(tokens);
        }
        page.setContents(stream);
    }
}
