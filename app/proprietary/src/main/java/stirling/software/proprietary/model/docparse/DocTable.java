package stirling.software.proprietary.model.docparse;

import java.util.List;

/** One extracted table. Mirrors {@code docparse.py DocTable}. */
public record DocTable(
        int page, List<Double> bbox, List<List<String>> cells, String markdown, Double confidence) {

    public DocTable {
        cells = cells == null ? List.of() : cells;
    }
}
