package stirling.software.SPDF.service.ocr;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.io.IOException;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

import org.apache.pdfbox.contentstream.operator.Operator;
import org.apache.pdfbox.cos.COSArray;
import org.apache.pdfbox.cos.COSNumber;
import org.apache.pdfbox.cos.COSString;
import org.apache.pdfbox.pdfparser.PDFStreamParser;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.common.PDStream;
import org.junit.jupiter.api.Test;

class CjkSpacingTest {

    @Test
    void joinsChineseAndJapaneseButKeepsOtherSpaces() {
        assertEquals("本季度的审查发现，客户", CjkSpacing.join("本 季度 的 审查 发 现 ， 客 户"));
        assertEquals("今四半期の調査", CjkSpacing.join("今四半期 の 調査"));
        assertEquals("Stirling PDF 支持多种", CjkSpacing.join("Stirling PDF 支持 多种"));
        assertEquals("本季\n度", CjkSpacing.join("本季\n度"));
        assertEquals("이번 분기 검토", CjkSpacing.join("이번 분기 검토"));
        assertEquals("plain  text", CjkSpacing.join("plain  text"));
    }

    @Test
    void textLayerLosesSpacesBetweenCjkWordsAndKeepsTheirWidth() throws IOException {
        // Shaped like TessPDFRenderer's text-only page: one TJ per word, a trailing space when
        // another word follows. Words: "本季度 ", "的 ", "审 ", "Ab".
        Layer layer =
                rewrite(
                        "100 Tz [ <672C5B635EA60020> ] TJ 22 0 Td"
                                + " 100 Tz [ <76840020> ] TJ 11 0 Td"
                                + " 100 Tz [ <5BA10020> ] TJ 11 0 Td"
                                + " 100 Tz [ <00410062> ] TJ",
                        "本季度的审 Ab");

        // The space before Latin text and the last word stay as they were.
        assertEquals(List.of("本季度", "的", "审 ", "Ab"), layer.words());
        assertEquals(List.of(133.33f, 200f, 100f, 100f), layer.scales());
    }

    @Test
    void koreanSyllableGroupsJoinWhereTesseractsTextHasNoSpace() throws IOException {
        // Words: "만 ", "족 ", "도 ", "는 ", "크게"; Tesseract's text reads "만족도는 크게".
        Layer layer =
                rewrite(
                        "100 Tz [ <B9CC0020> ] TJ 11 0 Td"
                                + " 100 Tz [ <C8710020> ] TJ 11 0 Td"
                                + " 100 Tz [ <B3C40020> ] TJ 11 0 Td"
                                + " 100 Tz [ <B2940020> ] TJ 11 0 Td"
                                + " 100 Tz [ <D06CAC8C> ] TJ",
                        "만족도는 크게");

        assertEquals(List.of("만", "족", "도", "는 ", "크게"), layer.words());
        assertEquals(List.of(200f, 200f, 200f, 100f, 100f), layer.scales());
    }

    @Test
    void wordsStopMatchingAtTheFirstDifference() {
        boolean[] runOn = CjkSpacing.runsIntoNext(List.of("ab ", "cd ", "xx ", "ef"), "abcd ef");

        assertEquals(true, runOn[0]);
        assertEquals(false, runOn[1]);
        assertEquals(false, runOn[2]);
        assertEquals(false, runOn[3]);
    }

    private record Layer(List<String> words, List<Float> scales) {}

    /**
     * Runs joinTextLayer over one BT block of {@code words} and reads back the TJ strings and Tz.
     */
    private static Layer rewrite(String words, String text) throws IOException {
        String content = "BT 3 Tr 1 0 0 1 72 700 Tm /f-0-0 11 Tf " + words + " ET";
        try (PDDocument doc = new PDDocument()) {
            PDPage page = new PDPage();
            doc.addPage(page);
            PDStream stream = new PDStream(doc);
            try (OutputStream out = stream.createOutputStream()) {
                out.write(content.getBytes(StandardCharsets.US_ASCII));
            }
            page.setContents(stream);

            CjkSpacing.joinTextLayer(doc, text);

            List<String> strings = new ArrayList<>();
            List<Float> scales = new ArrayList<>();
            List<Object> tokens;
            try (var in = page.getContents()) {
                tokens = new PDFStreamParser(in.readAllBytes()).parse();
            }
            for (int i = 1; i < tokens.size(); i++) {
                if (!(tokens.get(i) instanceof Operator op)) continue;
                if ("TJ".equals(op.getName())) {
                    byte[] bytes = ((COSString) ((COSArray) tokens.get(i - 1)).get(0)).getBytes();
                    strings.add(new String(bytes, StandardCharsets.UTF_16BE));
                } else if ("Tz".equals(op.getName())) {
                    scales.add(
                            Math.round(((COSNumber) tokens.get(i - 1)).floatValue() * 100) / 100f);
                }
            }
            return new Layer(strings, scales);
        }
    }
}
