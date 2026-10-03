package stirling.software.SPDF.controller.api.converters;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;

import org.apache.poi.poifs.filesystem.POIFSFileSystem;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import stirling.software.common.util.OfficeDocumentSanitizer;

class WordBinarySanitizerTest {
    private static final String LINK =
            "\u0013 INCLUDETEXT \"../private.txt\" \u0014Saved result\u0015";
    private static final int[] FIELD_INDEXES = {16, 18, 17, 20, 19, 48, 57, 59};

    @TempDir Path directory;

    @ParameterizedTest
    @ValueSource(ints = {1, 2})
    void fieldLikeFormattingAndUnregisteredTextStayByteIdentical(int width) throws Exception {
        Fixture fixture = new Fixture("Ordinary text " + LINK, width, false, 0, false);
        fixture.addFormattingDecoys();
        Path file = fixture.write(directory);
        byte[] original = Files.readAllBytes(file);

        WordBinarySanitizer.sanitizeInPlace(file);

        assertThat(Files.readAllBytes(file)).isEqualTo(original);
    }

    @ParameterizedTest
    @ValueSource(ints = {1, 2})
    void onlyRegisteredInstructionsChangeAndAllOtherStreamsArePreserved(int width)
            throws Exception {
        Fixture fixture = new Fixture(LINK, width, true, 0, false);
        fixture.addFormattingDecoys();
        Path file = fixture.write(directory);

        WordBinarySanitizer.sanitizeInPlace(file);

        fixture.assertStreams(file, blankInstruction(LINK, 1, LINK.indexOf('\u0014')));
    }

    @Test
    void mapsAnInstructionAcrossMixedWidthNoncontiguousTextPieces() throws Exception {
        Fixture fixture = new Fixture(LINK, 2, true, 0, true);
        Path file = fixture.write(directory);

        WordBinarySanitizer.sanitizeInPlace(file);

        fixture.assertStreams(file, blankInstruction(LINK, 1, LINK.indexOf('\u0014')));
    }

    @ParameterizedTest
    @ValueSource(ints = {1, 2, 3, 4, 5, 6, 7})
    void mapsFieldPositionsRelativeToEveryStory(int story) throws Exception {
        Fixture fixture = new Fixture("Main text\r" + LINK, 2, true, story, false);
        Path file = fixture.write(directory);

        WordBinarySanitizer.sanitizeInPlace(file);

        fixture.assertStreams(
                file, "Main text\r" + blankInstruction(LINK, 1, LINK.indexOf('\u0014')));
    }

    @ParameterizedTest
    @ValueSource(ints = {0, 1, 2, 3, 4, 5, 6, 7})
    void readsLegacyFieldTablesForPlainAndFastSavedDocuments(int story) throws Exception {
        for (boolean complex : List.of(false, true)) {
            String prefix = story == 0 ? "" : "Main text\r";
            Fixture fixture = new Fixture(prefix + LINK, 1, true, story, false);
            fixture.asLegacy(complex);
            Path file = fixture.write(directory);

            WordBinarySanitizer.sanitizeInPlace(file);

            fixture.assertStreams(file, prefix + blankInstruction(LINK, 1, LINK.indexOf('\u0014')));
        }
    }

    @Test
    void preservesNestedDelimitersAndTheOuterCachedResult() throws Exception {
        String text = "\u0013 INCLUDETEXT \u0013 DATE \u0014today\u0015 \u0014Saved result\u0015";
        Fixture fixture = new Fixture(text, 2, true, 0, true);
        Path file = fixture.write(directory);

        WordBinarySanitizer.sanitizeInPlace(file);

        fixture.assertStreams(file, blankInstruction(text, 1, text.lastIndexOf('\u0014')));
    }

    @Test
    void sanitizesNestedResolvingFieldsInsideAnOtherwiseSafeInstruction() throws Exception {
        String text =
                "\u0013 IF \u0013 INCLUDETEXT relative.doc \u0014cached\u0015 = 1 \u0014outer result\u0015";
        Fixture fixture = new Fixture(text, 1, true, 0, false);
        Path file = fixture.write(directory);

        WordBinarySanitizer.sanitizeInPlace(file);

        fixture.assertStreams(
                file,
                blankInstruction(text, text.indexOf('\u0013', 1) + 1, text.indexOf('\u0014')));
    }

    @Test
    void preservesOrdinaryFieldsAndClearsResolvingFieldsWithoutResults() throws Exception {
        String text = "\u0013 DATE \u00142026\u0015 \u0013 INCLUDETEXT relative.doc\u0015";
        Fixture fixture = new Fixture(text, 2, true, 0, false);
        Path file = fixture.write(directory);

        WordBinarySanitizer.sanitizeInPlace(file);

        fixture.assertStreams(
                file,
                blankInstruction(text, text.lastIndexOf('\u0013') + 1, text.lastIndexOf('\u0015')));
    }

    @ParameterizedTest
    @ValueSource(
            strings = {
                "field-length",
                "field-position",
                "duplicate-position",
                "missing-end",
                "wrong-marker",
                "piece-offset",
                "piece-gap",
                "encrypted",
                "truncated-clx"
            })
    void refusesInvalidMetadataWithoutWritingAnyBytes(String corruption) throws Exception {
        Fixture fixture = new Fixture(LINK, 2, true, 0, false);
        switch (corruption) {
            case "field-length" -> putInt(fixture.word, 154 + 16 * 8 + 4, 21);
            case "field-position" -> putInt(fixture.table, 64, LINK.length() + 10);
            case "duplicate-position" -> putInt(fixture.table, 68, 0);
            case "missing-end" -> fixture.table[84] = 0x14;
            case "wrong-marker" -> fixture.word[1400] = 'X';
            case "piece-offset" -> putInt(fixture.table, 1039, 10);
            case "piece-gap" -> putInt(fixture.table, 1029, 1);
            case "encrypted" -> putShort(fixture.word, 10, 0x100);
            case "truncated-clx" -> putInt(fixture.word, 154 + 33 * 8 + 4, 8);
            default -> throw new AssertionError(corruption);
        }
        Path file = fixture.write(directory);
        byte[] original = Files.readAllBytes(file);

        assertThatThrownBy(() -> WordBinarySanitizer.sanitizeInPlace(file))
                .isInstanceOf(OfficeDocumentSanitizer.UnsanitizableDocumentException.class);
        assertThat(Files.readAllBytes(file)).isEqualTo(original);
    }

    @Test
    void sharedPhysicalTextIsRefusedInsteadOfChangingAnotherOccurrence() throws Exception {
        Fixture fixture = new Fixture(LINK + LINK, 2, true, 0, false);
        fixture.pieces =
                List.of(
                        new Piece(0, LINK.length(), 1400, 2),
                        new Piece(LINK.length(), LINK.length() * 2, 1400, 2));
        fixture.writePieces();
        Path file = fixture.write(directory);
        byte[] original = Files.readAllBytes(file);

        assertThatThrownBy(() -> WordBinarySanitizer.sanitizeInPlace(file))
                .isInstanceOf(OfficeDocumentSanitizer.UnsanitizableDocumentException.class);
        assertThat(Files.readAllBytes(file)).isEqualTo(original);
    }

    @Test
    void unicodeInstructionsKeepTheirUtf16Positions() throws Exception {
        String text = LINK.replace("private", "資料\uD83D\uDCC4");
        Fixture fixture = new Fixture(text, 2, true, 0, true);
        Path file = fixture.write(directory);

        WordBinarySanitizer.sanitizeInPlace(file);

        fixture.assertStreams(file, blankInstruction(text, 1, text.indexOf('\u0014')));
    }

    @Test
    void legacyInstructionsWithAmbiguousCodePagesAreRefusedWithoutRewriting() throws Exception {
        Fixture fixture = new Fixture(LINK.replace("private", "caf\u00e9"), 1, true, 0, false);
        fixture.asLegacy(false);
        Path file = fixture.write(directory);
        byte[] original = Files.readAllBytes(file);

        assertThatThrownBy(() -> WordBinarySanitizer.sanitizeInPlace(file))
                .isInstanceOf(OfficeDocumentSanitizer.UnsanitizableDocumentException.class);
        assertThat(Files.readAllBytes(file)).isEqualTo(original);
    }

    private static String blankInstruction(String text, int start, int end) {
        char[] expected = text.toCharArray();
        for (int i = start; i < end; i++) {
            if (expected[i] < 0x13 || expected[i] > 0x15) {
                expected[i] = ' ';
            }
        }
        return new String(expected);
    }

    private record Piece(int start, int end, int offset, int width) {}

    // Minimal MS-DOC FIB, CLX and field tables; non-text bytes are deliberate corruption traps.
    private static final class Fixture {
        final byte[] word = new byte[8192];
        final byte[] table = new byte[4096];
        final String text;
        List<Piece> pieces;

        Fixture(String text, int width, boolean fields, int story, boolean split) {
            this.text = text;
            putShort(word, 0, 0xA5EC);
            putShort(word, 2, 0xC1);
            putInt(word, 24, 1024);
            putInt(word, 28, word.length);
            putShort(word, 32, 14);
            putShort(word, 62, 22);
            putShort(word, 152, 93);
            int storyStart = story == 0 ? 0 : "Main text\r".length();
            putInt(word, 76, story == 0 ? text.length() : storyStart);
            if (story != 0) {
                putInt(word, 76 + story * 4, text.length() - storyStart);
            }
            pieces =
                    split
                            ? List.of(
                                    new Piece(0, 8, 2048, 1), new Piece(8, text.length(), 1400, 2))
                            : List.of(new Piece(0, text.length(), 1400, width));
            writePieces();
            if (fields) {
                List<Integer> markers = new ArrayList<>();
                for (int i = storyStart; i < text.length(); i++) {
                    if (text.charAt(i) >= 0x13 && text.charAt(i) <= 0x15) {
                        markers.add(i);
                    }
                }
                putInt(word, 154 + FIELD_INDEXES[story] * 8, 64);
                putInt(word, 154 + FIELD_INDEXES[story] * 8 + 4, markers.size() * 6 + 4);
                for (int n = 0; n < markers.size(); n++) {
                    int cp = markers.get(n);
                    putInt(table, 64 + n * 4, cp - storyStart);
                    table[64 + (markers.size() + 1) * 4 + n * 2] = (byte) text.charAt(cp);
                }
                putInt(table, 64 + markers.size() * 4, text.length() - storyStart);
            }
        }

        void writePieces() {
            putInt(word, 154 + 33 * 8, 1024);
            putInt(word, 154 + 33 * 8 + 4, 9 + pieces.size() * 12);
            table[1024] = 2;
            putInt(table, 1025, 4 + pieces.size() * 12);
            for (int n = 0; n < pieces.size(); n++) {
                Piece piece = pieces.get(n);
                putInt(table, 1029 + n * 4, piece.start());
                int fc = piece.width() == 1 ? (piece.offset() * 2) | 0x40000000 : piece.offset();
                putInt(table, 1029 + (pieces.size() + 1) * 4 + n * 8 + 2, fc);
            }
            putInt(table, 1029 + pieces.size() * 4, text.length());
            writeText(word, text);
        }

        void writeText(byte[] bytes, String value) {
            for (Piece piece : pieces) {
                byte[] encoded =
                        value.substring(piece.start(), piece.end())
                                .getBytes(
                                        piece.width() == 1
                                                ? StandardCharsets.ISO_8859_1
                                                : StandardCharsets.UTF_16LE);
                System.arraycopy(encoded, 0, bytes, piece.offset(), encoded.length);
            }
        }

        void addFormattingDecoys() {
            byte[] compressed = LINK.getBytes(StandardCharsets.ISO_8859_1);
            byte[] unicode = LINK.getBytes(StandardCharsets.UTF_16LE);
            System.arraycopy(compressed, 0, word, 3500, compressed.length);
            System.arraycopy(unicode, 0, word, 4001, unicode.length);
        }

        void asLegacy(boolean complex) {
            byte[] fib = word.clone();
            java.util.Arrays.fill(word, 0, 1024, (byte) 0);
            putShort(word, 0, 0xA5DC);
            putShort(word, 2, 0x65);
            putShort(word, 10, complex ? 4 : 0);
            putInt(word, 24, 1400);
            putInt(word, 28, 1400 + text.length());
            System.arraycopy(fib, 76, word, 52, 32);
            for (int index : FIELD_INDEXES) {
                int pair = 88 + index * 8 + (index >= 38 ? 10 : 0);
                putInt(word, pair, 4096 + 64);
                System.arraycopy(fib, 154 + index * 8 + 4, word, pair + 4, 4);
            }
            System.arraycopy(table, 0, word, 4096, table.length);
            if (complex) {
                putInt(word, 88 + 33 * 8, 4096 + 1024);
                putInt(word, 88 + 33 * 8 + 4, 21);
                putInt(word, 4096 + 1039, 1400);
            }
        }

        Path write(Path directory) throws IOException {
            Path path = directory.resolve("fixture.doc");
            try (POIFSFileSystem fs = new POIFSFileSystem()) {
                fs.createDocument(new ByteArrayInputStream(word), "WordDocument");
                fs.createDocument(new ByteArrayInputStream(table), "0Table");
                fs.createDocument(new ByteArrayInputStream(new byte[] {1, 2, 3, 4}), "Data");
                try (var output = Files.newOutputStream(path)) {
                    fs.writeFilesystem(output);
                }
            }
            return path;
        }

        void assertStreams(Path path, String expectedText) throws IOException {
            byte[] expectedWord = word.clone();
            writeText(expectedWord, expectedText);
            try (POIFSFileSystem fs = new POIFSFileSystem(path.toFile(), true)) {
                try (var input = fs.createDocumentInputStream("WordDocument")) {
                    assertThat(input.readAllBytes()).isEqualTo(expectedWord);
                }
                try (var input = fs.createDocumentInputStream("0Table")) {
                    assertThat(input.readAllBytes()).isEqualTo(table);
                }
                try (var input = fs.createDocumentInputStream("Data")) {
                    assertThat(input.readAllBytes()).containsExactly(1, 2, 3, 4);
                }
            }
        }
    }

    private static void putInt(byte[] bytes, int offset, int value) {
        ByteBuffer.wrap(bytes).order(ByteOrder.LITTLE_ENDIAN).putInt(offset, value);
    }

    private static void putShort(byte[] bytes, int offset, int value) {
        ByteBuffer.wrap(bytes).order(ByteOrder.LITTLE_ENDIAN).putShort(offset, (short) value);
    }
}
