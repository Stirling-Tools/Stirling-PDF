package stirling.software.proprietary.sources.model;

import java.util.List;

/**
 * Type-specific detail for an expanded source row. Only the generic {@code basic} key/value shape
 * is emitted today: it shows what we can source honestly without inventing the richer per-type
 * fields (rate limits, rotation history, ...) that no backend data backs yet.
 */
public record SourceDetailView(String kind, List<Row> rows) {

    public record Row(String label, String value) {}

    public static SourceDetailView basic(List<Row> rows) {
        return new SourceDetailView("basic", rows);
    }
}
