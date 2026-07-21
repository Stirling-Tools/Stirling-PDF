package stirling.software.common.pdf;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import stirling.software.jpdfium.text.Table;

/**
 * Unit tests for {@link TableRenderer}. Tables are built directly from the {@link Table} record so
 * the renderer can be exercised without any PDF parsing, fixtures, or native calls.
 */
class TableRendererTest {

    /** Builds a Table from raw rows; geometry is irrelevant to rendering so it is set to zero. */
    private static Table table(List<List<String>> rows) {
        return new Table(rows, 0f, 0f, 0f, 0f);
    }

    @Nested
    @DisplayName("Degenerate tables")
    class Degenerate {

        @Test
        @DisplayName("zero rows renders the empty string")
        void zeroRows() {
            assertThat(TableRenderer.render(table(List.of()))).isEmpty();
        }

        @Test
        @DisplayName("single row with one column has no separator and is a plain line")
        void singleRowOneColumn() {
            String md = TableRenderer.render(table(List.of(List.of("only"))));
            assertThat(md).isEqualTo("only");
            assertThat(md).doesNotContain("|");
        }

        @Test
        @DisplayName("single row with several columns becomes newline-separated plain lines")
        void singleRowManyColumns() {
            String md = TableRenderer.render(table(List.of(List.of("a", "b", "c"))));
            // No separator row is possible with a single row, so cells are emitted as lines.
            assertThat(md).isEqualTo("a\nb\nc");
        }

        @Test
        @DisplayName("single-row cell content is trimmed and escaped")
        void singleRowTrimsAndEscapes() {
            String md = TableRenderer.render(table(List.of(List.of("  a|b  "))));
            assertThat(md).isEqualTo("a\\|b");
        }
    }

    @Nested
    @DisplayName("GFM rendering")
    class GfmRendering {

        @Test
        @DisplayName("two rows produce a header, a separator and a data row")
        void headerSeparatorData() {
            String md =
                    TableRenderer.render(
                            table(List.of(List.of("Name", "Age"), List.of("Alice", "30"))));
            String[] lines = md.split("\n");
            assertThat(lines).hasSize(3);
            assertThat(lines[0]).startsWith("|").contains("Name").contains("Age");
            // Separator row is made only of pipes and dashes.
            assertThat(lines[1].chars().allMatch(c -> c == '|' || c == '-')).isTrue();
            assertThat(lines[2]).contains("Alice").contains("30");
        }

        @Test
        @DisplayName("column widths grow to fit the widest cell in each column")
        void columnWidthsFitContent() {
            String md =
                    TableRenderer.render(
                            table(
                                    List.of(
                                            List.of("h", "header2"),
                                            List.of("averylongvalue", "x"))));
            String[] lines = md.split("\n");
            // Every rendered row (header, separator, data) is the same total width.
            int width = lines[0].length();
            for (String line : lines) {
                assertThat(line.length()).isEqualTo(width);
            }
        }

        @Test
        @DisplayName("minimum column width of three dashes is honoured for tiny cells")
        void minimumWidthThree() {
            String md = TableRenderer.render(table(List.of(List.of("a", "b"), List.of("c", "d"))));
            String separator = md.split("\n")[1];
            // Each column is padded to a minimum of 3, fenced by a dash either side: |-----|-----|.
            assertThat(separator).isEqualTo("|-----|-----|");
        }

        @Test
        @DisplayName("pipe characters in cells are escaped in every rendered row")
        void escapesPipes() {
            String md =
                    TableRenderer.render(table(List.of(List.of("a|b", "c"), List.of("d", "e|f"))));
            // Two literal pipes escaped; the structural pipes are not.
            assertThat(md).contains("a\\|b").contains("e\\|f");
        }

        @Test
        @DisplayName("cells are trimmed before measuring and rendering")
        void trimsCells() {
            String md =
                    TableRenderer.render(
                            table(List.of(List.of("  Name  ", " Age "), List.of("Al", "30"))));
            assertThat(md).contains("| Name").contains("Age ");
            assertThat(md).doesNotContain("  Name  ");
        }

        @Test
        @DisplayName("three rows emit two data rows after the separator")
        void multipleDataRows() {
            String md =
                    TableRenderer.render(
                            table(
                                    List.of(
                                            List.of("c1", "c2"),
                                            List.of("a", "b"),
                                            List.of("x", "y"))));
            String[] lines = md.split("\n");
            assertThat(lines).hasSize(4);
            assertThat(lines[2]).contains("a").contains("b");
            assertThat(lines[3]).contains("x").contains("y");
        }

        @Test
        @DisplayName("a short trailing row is padded out to the column count from asGrid")
        void shortRowPaddedByGrid() {
            // colCount comes from the first row; a shorter later row is padded with empty cells by
            // Table.asGrid, so rendering must not throw and the grid stays rectangular.
            String md =
                    TableRenderer.render(table(List.of(List.of("a", "b", "c"), List.of("only"))));
            String[] lines = md.split("\n");
            assertThat(lines).hasSize(3);
            int width = lines[0].length();
            for (String line : lines) {
                assertThat(line.length()).isEqualTo(width);
            }
        }
    }
}
