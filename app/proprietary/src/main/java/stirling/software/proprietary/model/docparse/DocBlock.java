package stirling.software.proprietary.model.docparse;

import java.util.List;

/**
 * One layout block. {@code bbox} is [x0, y0, x1, y1] normalized to 0..1 with a top-left origin;
 * {@code null} in basic tier (no layout model ran). Mirrors {@code docparse.py DocBlock}.
 */
public record DocBlock(String type, String text, int page, List<Double> bbox, Double confidence) {}
