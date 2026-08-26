package stirling.software.proprietary.pdf.ua;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

/** Tests for the small types the tagger is built from. */
class PdfUaModelTest {

    @Nested
    @DisplayName("structure types")
    class Types {

        @Test
        @DisplayName("maps levels to heading tags and back")
        void headingLevelsRoundTrip() {
            for (int level = 1; level <= 6; level++) {
                assertEquals(level, StructType.heading(level).headingLevel());
                assertEquals("H" + level, StructType.heading(level).tag());
            }
        }

        @Test
        @DisplayName("clamps out-of-range levels rather than throwing")
        void clampsLevels() {
            assertEquals(StructType.H1, StructType.heading(0));
            assertEquals(StructType.H1, StructType.heading(-3));
            assertEquals(StructType.H6, StructType.heading(9));
        }

        @Test
        @DisplayName("reports zero for types that are not headings")
        void nonHeadingsHaveNoLevel() {
            assertEquals(0, StructType.P.headingLevel());
            assertFalse(StructType.TABLE.isHeading());
        }
    }

    @Nested
    @DisplayName("markable operators")
    class Markable {

        @ParameterizedTest
        @ValueSource(strings = {"Tj", "TJ", "'", "\"", "Do", "BI", "S", "f", "f*", "B", "sh"})
        @DisplayName("counts text, XObjects and path painting")
        void counted(String operator) {
            assertTrue(MarkableOp.isMarkableOperator(operator), operator + " should be markable");
        }

        @ParameterizedTest
        @ValueSource(strings = {"q", "Q", "cm", "BT", "ET", "Tf", "Td", "n", "W", "gs", "re"})
        @DisplayName("ignores operators that paint nothing")
        void notCounted(String operator) {
            assertFalse(
                    MarkableOp.isMarkableOperator(operator), operator + " should not be markable");
        }

        @Test
        @DisplayName("n ends a path without painting, so it is not content")
        void pathEndIsNotPainting() {
            assertFalse(MarkableOp.isPathPainting("n"));
            assertTrue(MarkableOp.isPathPainting("f"));
        }
    }

    @Nested
    @DisplayName("profiles")
    class Profiles {

        @Test
        @DisplayName("parses the shapes a caller might send")
        void parsesRequestValues() {
            assertEquals(PdfUaProfile.UA1, PdfUaProfile.fromRequest("ua1"));
            assertEquals(PdfUaProfile.UA1, PdfUaProfile.fromRequest(null));
            assertEquals(PdfUaProfile.UA1, PdfUaProfile.fromRequest(""));
            assertEquals(PdfUaProfile.UA1, PdfUaProfile.fromRequest("nonsense"));
            assertEquals(PdfUaProfile.UA2, PdfUaProfile.fromRequest("ua2"));
            assertEquals(PdfUaProfile.UA2, PdfUaProfile.fromRequest("PDF/UA-2"));
        }

        @Test
        @DisplayName("UA-2 requires PDF 2.0")
        void ua2NeedsPdf2() {
            assertEquals(2.0f, PdfUaProfile.UA2.pdfVersion());
            assertEquals(1.7f, PdfUaProfile.UA1.pdfVersion());
        }
    }

    @Nested
    @DisplayName("bounding boxes")
    class Boxes {

        @Test
        @DisplayName("union of an empty box is the other box")
        void unionWithEmpty() {
            BBox box = new BBox(10, 10, 20, 20);
            assertEquals(box, box.union(BBox.EMPTY));
            assertEquals(box, BBox.EMPTY.union(box));
        }

        @Test
        @DisplayName("union covers both boxes")
        void unionCoversBoth() {
            BBox union = new BBox(0, 0, 10, 10).union(new BBox(20, 5, 30, 25));
            assertEquals(new BBox(0, 0, 30, 25), union);
        }

        @Test
        @DisplayName("reports horizontal overlap as a fraction of the narrower box")
        void overlapIsRelative() {
            BBox wide = new BBox(0, 0, 100, 10);
            BBox narrow = new BBox(40, 0, 60, 10);
            assertEquals(1.0f, wide.horizontalOverlap(narrow));
            assertEquals(0f, wide.horizontalOverlap(new BBox(200, 0, 220, 10)));
        }
    }

    @Nested
    @DisplayName("structure blocks")
    class Blocks {

        @Test
        @DisplayName("counts content across the whole subtree")
        void countsDescendantContent() {
            StructBlock table = new StructBlock(StructType.TABLE, 0);
            StructBlock row = new StructBlock(StructType.TR, 0);
            StructBlock cell = new StructBlock(StructType.TD, 0);
            cell.addRange(3, 5);
            row.addChild(cell);
            table.addChild(row);
            assertEquals(3, table.contentCount());
        }

        @Test
        @DisplayName("collects text in tree order")
        void collectsText() {
            StructBlock list = new StructBlock(StructType.L, 0);
            StructBlock first = new StructBlock(StructType.LI, 0);
            first.setText("one");
            StructBlock second = new StructBlock(StructType.LI, 0);
            second.setText("two");
            list.addChild(first).addChild(second);
            assertEquals("one two", list.collectText());
        }

        @Test
        @DisplayName("an artifact is not a structure element")
        void artifactsAreDistinct() {
            StructBlock artifact = StructBlock.artifact(ArtifactType.PAGINATION, 0);
            assertTrue(artifact.isArtifact());
            assertEquals("Pagination", artifact.getArtifactType().subtype());
        }
    }
}
