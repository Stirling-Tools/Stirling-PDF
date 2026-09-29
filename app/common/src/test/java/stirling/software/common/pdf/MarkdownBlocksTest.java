package stirling.software.common.pdf;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.util.ArrayList;
import java.util.List;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

/** Document-wide block passes: joining, heading-level rebasing, heading paths and unescaping. */
class MarkdownBlocksTest {

    private static MarkdownBlock block(String markdown) {
        return new MarkdownBlock(markdown, 1, 1);
    }

    private static List<MarkdownBlock> blocks(String... markdown) {
        List<MarkdownBlock> out = new ArrayList<>(markdown.length);
        for (String md : markdown) {
            out.add(block(md));
        }
        return out;
    }

    private static List<String> markdownOf(List<MarkdownBlock> blocks) {
        return blocks.stream().map(MarkdownBlock::markdown).toList();
    }

    @Nested
    @DisplayName("join")
    class Join {

        @Test
        void separatesBlocksWithABlankLine() {
            assertEquals("a\n\nb\n\nc", MarkdownBlocks.join(blocks("a", "b", "c")));
        }

        @Test
        void keepsEmptyBlocksSoTheSeparatorRunSurvives() {
            assertEquals("a\n\n\n\nb", MarkdownBlocks.join(blocks("a", "", "b")));
        }

        @Test
        void joinsNothingToAnEmptyString() {
            assertEquals("", MarkdownBlocks.join(List.of()));
        }
    }

    @Nested
    @DisplayName("heading-level rebasing over a block list")
    class Rebasing {

        @Test
        void rebasesTheStrongestHeadingToLevelOne() {
            List<MarkdownBlock> out =
                    MarkdownBlocks.normaliseHeadingLevels(blocks("### CONTENTS", "body"));
            assertEquals(List.of("# CONTENTS", "body"), markdownOf(out));
        }

        @Test
        void closesTheGapBetweenLevelsThatAreKept() {
            List<MarkdownBlock> out =
                    MarkdownBlocks.normaliseHeadingLevels(
                            blocks("# Title", "text", "### Section", "more"));
            assertEquals(List.of("# Title", "text", "## Section", "more"), markdownOf(out));
        }

        @Test
        void leavesAnAlreadyRootedGaplessDocumentAlone() {
            List<MarkdownBlock> input = blocks("# Title", "## Section", "body");
            assertSame(input, MarkdownBlocks.normaliseHeadingLevels(input));
        }

        @Test
        void decidesOnceOverTheWholeDocumentRatherThanPerBlock() {
            // In isolation "### Deep" would rebase to "#"; against the document's own level 1 it
            // must only close the gap.
            List<MarkdownBlock> out =
                    MarkdownBlocks.normaliseHeadingLevels(blocks("# Top", "### Deep"));
            assertEquals(List.of("# Top", "## Deep"), markdownOf(out));
        }

        @Test
        void keepsPagesAndHeadingPathsWhileRewritingTheMarkdown() {
            MarkdownBlock in = new MarkdownBlock("### Deep", 4, 5, List.of("kept"));
            MarkdownBlock out = MarkdownBlocks.normaliseHeadingLevels(List.of(in)).getFirst();
            assertEquals("# Deep", out.markdown());
            assertEquals(4, out.pageStart());
            assertEquals(5, out.pageEnd());
            assertEquals(List.of("kept"), out.headingPath());
        }
    }

    @Nested
    @DisplayName("headingLevel")
    class HeadingLevel {

        @Test
        void readsTheLevelOfABlocksOwnFirstLine() {
            assertEquals(1, MarkdownBlocks.headingLevel("# Title"));
            assertEquals(6, MarkdownBlocks.headingLevel("###### Deep"));
        }

        @Test
        void rejectsAnythingThatIsNotAHeadingAtTheVeryStart() {
            assertEquals(0, MarkdownBlocks.headingLevel("body\n# Not a heading block"));
            assertEquals(0, MarkdownBlocks.headingLevel("####### Seven is not a level"));
            assertEquals(0, MarkdownBlocks.headingLevel("#NoSpace"));
            assertEquals(0, MarkdownBlocks.headingLevel("# "));
            assertEquals(0, MarkdownBlocks.headingLevel("| Name | Qty |"));
            assertEquals(0, MarkdownBlocks.headingLevel("\\# escaped body text"));
            assertEquals(0, MarkdownBlocks.headingLevel(""));
        }
    }

    @Nested
    @DisplayName("heading paths")
    class HeadingPaths {

        @Test
        void aHeadingIncludesItselfAndBodyInheritsTheOpenChain() {
            List<MarkdownBlock> out =
                    MarkdownBlocks.withHeadingPaths(
                            blocks("preamble", "# Top", "body", "## Sub", "more body"));
            assertEquals(List.of(), out.get(0).headingPath());
            assertEquals(List.of("Top"), out.get(1).headingPath());
            assertEquals(List.of("Top"), out.get(2).headingPath());
            assertEquals(List.of("Top", "Sub"), out.get(3).headingPath());
            assertEquals(List.of("Top", "Sub"), out.get(4).headingPath());
        }

        @Test
        void aSiblingReplacesAndAShallowerHeadingPopsTheChain() {
            List<MarkdownBlock> out =
                    MarkdownBlocks.withHeadingPaths(
                            blocks("# A", "## A1", "### A1a", "## A2", "# B", "tail"));
            assertEquals(List.of("A", "A1", "A1a"), out.get(2).headingPath());
            assertEquals(List.of("A", "A2"), out.get(3).headingPath());
            assertEquals(List.of("B"), out.get(4).headingPath());
            assertEquals(List.of("B"), out.get(5).headingPath());
        }

        @Test
        void readsHeadingTextAsThePageDoesRatherThanAsMarkdown() {
            List<MarkdownBlock> out =
                    MarkdownBlocks.withHeadingPaths(blocks("# Q3 \\*net\\* revenue \\[USD\\]"));
            assertEquals(List.of("Q3 *net* revenue [USD]"), out.getFirst().headingPath());
        }

        @Test
        void leavesTheMarkdownAndPagesUntouched() {
            MarkdownBlock in = new MarkdownBlock("# Title", 2, 3);
            MarkdownBlock out = MarkdownBlocks.withHeadingPaths(List.of(in)).getFirst();
            assertEquals("# Title", out.markdown());
            assertEquals(2, out.pageStart());
            assertEquals(3, out.pageEnd());
        }
    }

    @Nested
    @DisplayName("unescape")
    class Unescape {

        @Test
        void dropsTheBackslashBeforeEveryCharacterEscapingAdds() {
            assertEquals("*_[]<>|~`", MarkdownBlocks.unescape("\\*\\_\\[\\]\\<\\>\\|\\~\\`"));
            assertEquals("# leading", MarkdownBlocks.unescape("\\# leading"));
            assertEquals("1. item", MarkdownBlocks.unescape("1\\. item"));
            assertEquals("2) item", MarkdownBlocks.unescape("2\\) item"));
        }

        @Test
        void restoresAGenuineBackslashFromItsEscapedPair() {
            assertEquals("C:\\path", MarkdownBlocks.unescape("C:\\\\path"));
        }

        @Test
        void keepsABackslashThatNeverCameFromEscaping() {
            assertEquals("\\q", MarkdownBlocks.unescape("\\q"));
            assertEquals("ends with \\", MarkdownBlocks.unescape("ends with \\"));
        }
    }

    @Nested
    @DisplayName("MarkdownBlock")
    class Block {

        @Test
        void defaultsAMissingHeadingPathToEmptyAndCopiesTheOneGiven() {
            assertEquals(List.of(), new MarkdownBlock("x", 1, 1, null).headingPath());
            List<String> source = new ArrayList<>(List.of("Top"));
            MarkdownBlock block = new MarkdownBlock("x", 1, 1, source);
            source.add("mutated after construction");
            assertEquals(List.of("Top"), block.headingPath());
            assertThrows(
                    UnsupportedOperationException.class, () -> block.headingPath().add("nope"));
        }

        @Test
        void withersReplaceOneFieldAndKeepTheRest() {
            MarkdownBlock block = new MarkdownBlock("original", 2, 4, List.of("Top"));
            assertEquals(
                    new MarkdownBlock("replaced", 2, 4, List.of("Top")),
                    block.withMarkdown("replaced"));
            assertEquals(
                    new MarkdownBlock("original", 2, 4, List.of("Other")),
                    block.withHeadingPath(List.of("Other")));
        }
    }
}
