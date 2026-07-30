package stirling.software.proprietary.model.docparse;

import java.util.List;

/**
 * Where a value came from. {@code quote} is always set; {@code bbox} only when a layout parse ran
 * (advanced tier); offsets index into the cited page's text. Mirrors {@code docparse.py
 * FieldCitation}.
 */
public record FieldCitation(
        Integer page, List<Double> bbox, String quote, Integer startOffset, Integer endOffset) {}
