package stirling.software.SPDF.controller.api.converters;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.nio.file.Path;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.BitSet;
import java.util.Comparator;
import java.util.Deque;
import java.util.List;
import java.util.Locale;
import java.util.Set;

import org.apache.poi.poifs.filesystem.DirectoryNode;
import org.apache.poi.poifs.filesystem.DocumentInputStream;
import org.apache.poi.poifs.filesystem.POIFSFileSystem;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.util.OfficeDocumentSanitizer;

/**
 * Uses field tables and text pieces to blank resolving instructions without rewriting other data.
 */
@Slf4j
final class WordBinarySanitizer {

    private static final String WORD_DOCUMENT_STREAM = "WordDocument";

    // Field characters, MS-DOC 2.8.25: begin, separator, end.
    private static final int FIELD_BEGIN = 0x13;
    private static final int FIELD_SEPARATOR = 0x14;
    private static final int FIELD_END = 0x15;

    /** Blocks resolving keywords even for relative paths without a URI scheme. */
    private static final Set<String> RESOLVING_FIELDS =
            Set.of(
                    "INCLUDEPICTURE",
                    "INCLUDETEXT",
                    "INCLUDE",
                    "IMPORT",
                    "LINK",
                    "DDE",
                    "DDEAUTO",
                    "HTMLCONTROL",
                    "SUBSCRIBER");

    /** Schemes the importer resolves, matched anywhere in an instruction whatever it is named. */
    private static final List<String> EXTERNAL_SCHEMES =
            List.of(
                    "http://",
                    "https://",
                    "ftp://",
                    "ftps://",
                    "file:",
                    "smb:",
                    "webdav:",
                    "davs:",
                    "dav:",
                    "vnd.sun.star.",
                    "\\\\");

    private static final int MAX_KEYWORD_LENGTH = 32;

    private static final int MAX_INSTRUCTION_CHARS = 8192;

    // MS-DOC story order; each field table uses character positions relative to its own story.
    private static final int[] FIELD_TABLE_INDEXES = {16, 18, 17, 20, 19, 48, 57, 59};

    private record TextPiece(int start, int end, int offset, int width) {
        int byteOffset(int cp) {
            return offset + (cp - start) * width;
        }
    }

    private static final class Field {
        final int begin;
        int separator = -1;

        Field(int begin) {
            this.begin = begin;
        }
    }

    private WordBinarySanitizer() {}

    /** Rewrites in place; compound-file I/O failures raise UnsanitizableDocumentException. */
    static void sanitizeInPlace(Path staged) throws IOException {
        try (POIFSFileSystem fileSystem = new POIFSFileSystem(staged.toFile(), false)) {
            DirectoryNode root = fileSystem.getRoot();
            if (!root.hasEntryCaseInsensitive(WORD_DOCUMENT_STREAM)) {
                return;
            }
            byte[] stream;
            try (DocumentInputStream in =
                    fileSystem.createDocumentInputStream(WORD_DOCUMENT_STREAM)) {
                stream = in.readAllBytes();
            }
            int blanked = blankResolvingFields(stream, root);
            if (blanked == 0) {
                return;
            }
            log.warn("Blanked {} resolving field instruction(s) in a Word binary", blanked);
            root.getEntry(WORD_DOCUMENT_STREAM).delete();
            root.createDocument(WORD_DOCUMENT_STREAM, new ByteArrayInputStream(stream));
            fileSystem.writeFilesystem();
        } catch (Exception e) {
            log.warn("Word binary could not be sanitized: {}", e.getMessage());
            throw new OfficeDocumentSanitizer.UnsanitizableDocumentException();
        }
    }

    private static int blankResolvingFields(byte[] stream, DirectoryNode root) throws IOException {
        int version = unsignedShort(stream, 2);
        boolean modern = version >= 0xC1;
        require(modern || (version >= 0x65 && version <= 0x68));
        int flags = unsignedShort(stream, 10);
        require((flags & 0x8100) == 0);
        int pairs = modern ? 154 : 88;
        if (modern) {
            require(unsignedShort(stream, 32) == 14 && unsignedShort(stream, 62) == 22);
            require(unsignedShort(stream, 152) >= 60);
            bounds(stream, pairs, Math.multiplyExact(unsignedShort(stream, 152), 8));
        }
        byte[] table = stream;
        if (modern) {
            try (DocumentInputStream in =
                    root.createDocumentInputStream((flags & 0x200) == 0 ? "0Table" : "1Table")) {
                table = in.readAllBytes();
            }
        }
        int[] lengths = new int[FIELD_TABLE_INDEXES.length];
        int total = 0;
        for (int i = 0; i < lengths.length; i++) {
            lengths[i] = nonnegativeInt(stream, (modern ? 76 : 52) + i * 4);
            total = Math.addExact(total, lengths[i]);
        }
        require(total <= stream.length);
        List<TextPiece> pieces = textPieces(stream, table, modern, flags, pairs, total);
        BitSet erase = new BitSet();
        BitSet markers = new BitSet();
        int storyStart = 0;
        int blanked = 0;
        for (int i = 0; i < lengths.length; i++) {
            int index = FIELD_TABLE_INDEXES[i];
            int pair = pairs + index * 8 + (!modern && index >= 38 ? 10 : 0);
            int size = nonnegativeInt(stream, pair + 4);
            if (size != 0) {
                int offset = nonnegativeInt(stream, pair);
                bounds(table, offset, size);
                require(size >= 4 && (size - 4) % 6 == 0);
                int count = (size - 4) / 6;
                Deque<Field> stack = new ArrayDeque<>();
                int previous = -1;
                for (int n = 0; n < count; n++) {
                    int relative = nonnegativeInt(table, offset + n * 4);
                    require(relative > previous && relative < lengths[i]);
                    previous = relative;
                    int cp = Math.addExact(storyStart, relative);
                    int marker = table[offset + (count + 1) * 4 + n * 2] & 0x1F;
                    require(character(stream, pieces, cp) == marker);
                    markers.set(cp);
                    switch (marker) {
                        case FIELD_BEGIN -> stack.push(new Field(cp));
                        case FIELD_SEPARATOR -> {
                            require(!stack.isEmpty() && stack.peek().separator == -1);
                            stack.peek().separator = cp;
                        }
                        case FIELD_END -> {
                            require(!stack.isEmpty());
                            Field field = stack.pop();
                            int end = field.separator < 0 ? cp : field.separator;
                            int start = field.begin + 1;
                            require(end - start <= MAX_INSTRUCTION_CHARS);
                            StringBuilder instruction = new StringBuilder(end - start);
                            for (int at = start; at < end; at++) {
                                instruction.append(character(stream, pieces, at));
                            }
                            if (isResolving(instruction.toString())) {
                                // Legacy code pages can use variable-width characters; never guess
                                // their byte widths.
                                require(modern || instruction.chars().allMatch(c -> c < 128));
                                erase.set(start, end);
                                blanked++;
                            }
                        }
                        default -> throw new IOException("Invalid Word field marker");
                    }
                }
                require(stack.isEmpty());
                require(nonnegativeInt(table, offset + count * 4) > previous);
            }
            storyStart = Math.addExact(storyStart, lengths[i]);
        }
        if (blanked == 0) {
            return 0;
        }
        // Shared physical text would let an instruction rewrite alter unrelated visible text.
        List<TextPiece> physical = new ArrayList<>(pieces);
        physical.sort(Comparator.comparingInt(TextPiece::offset));
        int previousEnd = 0;
        for (TextPiece piece : physical) {
            require(piece.offset() >= previousEnd);
            previousEnd = piece.byteOffset(piece.end());
        }
        // Preserve nested field delimiters so all field tables and cached results stay valid.
        erase.andNot(markers);
        for (TextPiece piece : pieces) {
            for (int cp = erase.nextSetBit(piece.start());
                    cp >= 0 && cp < piece.end();
                    cp = erase.nextSetBit(cp + 1)) {
                int offset = piece.byteOffset(cp);
                stream[offset] = ' ';
                if (piece.width() == 2) {
                    stream[offset + 1] = 0;
                }
            }
        }
        return blanked;
    }

    private static List<TextPiece> textPieces(
            byte[] stream, byte[] table, boolean modern, int flags, int pairs, int total)
            throws IOException {
        int min = nonnegativeInt(stream, 24);
        require(min >= (modern ? pairs + unsignedShort(stream, 152) * 8 : 586));
        if (!modern && (flags & 4) == 0) {
            bounds(stream, min, total);
            return List.of(new TextPiece(0, total, min, 1));
        }
        int clx = nonnegativeInt(stream, pairs + 33 * 8);
        int size = nonnegativeInt(stream, pairs + 33 * 8 + 4);
        bounds(table, clx, size);
        int limit = clx + size;
        while (clx < limit && table[clx] == 1) {
            require(limit - clx >= 3);
            int skip = 3 + unsignedShort(table, clx + 1);
            require(skip <= limit - clx);
            clx += skip;
        }
        require(limit - clx >= 5 && table[clx] == 2);
        int length = nonnegativeInt(table, clx + 1);
        require(length >= 4 && (length - 4) % 12 == 0 && length == limit - clx - 5);
        int count = (length - 4) / 12;
        int cps = clx + 5;
        int descriptors = cps + (count + 1) * 4;
        List<TextPiece> pieces = new ArrayList<>();
        require(nonnegativeInt(table, cps) == 0);
        for (int n = 0; n < count; n++) {
            int start = nonnegativeInt(table, cps + n * 4);
            int end = nonnegativeInt(table, cps + (n + 1) * 4);
            require(end > start);
            int fc = nonnegativeInt(table, descriptors + n * 8 + 2);
            boolean compressed = !modern || (fc & 0x40000000) != 0;
            int offset = modern && compressed ? (fc & 0x3FFFFFFF) / 2 : fc;
            int width = compressed ? 1 : 2;
            require(offset >= min);
            require(!modern || !compressed || (fc & 1) == 0);
            bounds(stream, offset, Math.multiplyExact(end - start, width));
            pieces.add(new TextPiece(start, end, offset, width));
        }
        require(!pieces.isEmpty() && pieces.getLast().end() >= total);
        return pieces;
    }

    private static char character(byte[] stream, List<TextPiece> pieces, int cp)
            throws IOException {
        int low = 0;
        int high = pieces.size() - 1;
        while (low <= high) {
            int middle = (low + high) >>> 1;
            TextPiece piece = pieces.get(middle);
            if (cp < piece.start()) {
                high = middle - 1;
            } else if (cp >= piece.end()) {
                low = middle + 1;
            } else {
                int offset = piece.byteOffset(cp);
                return (char)
                        (piece.width() == 2
                                ? unsignedShort(stream, offset)
                                : stream[offset] & 0xFF);
            }
        }
        throw new IOException("Word field is outside the text pieces");
    }

    private static int unsignedShort(byte[] bytes, int offset) throws IOException {
        bounds(bytes, offset, 2);
        return (bytes[offset] & 0xFF) | (bytes[offset + 1] & 0xFF) << 8;
    }

    private static int nonnegativeInt(byte[] bytes, int offset) throws IOException {
        int value = unsignedShort(bytes, offset) | unsignedShort(bytes, offset + 2) << 16;
        require(value >= 0);
        return value;
    }

    private static void bounds(byte[] bytes, int offset, int length) throws IOException {
        require(offset >= 0 && length >= 0 && offset <= bytes.length - length);
    }

    private static void require(boolean valid) throws IOException {
        if (!valid) {
            throw new IOException("Invalid or unsupported Word field metadata");
        }
    }

    private static boolean isResolving(String instruction) {
        return RESOLVING_FIELDS.contains(keyword(instruction))
                || namesAnExternalReference(instruction);
    }

    /** The instruction's leading name, wherever it starts: WW8 does not require a single space. */
    private static String keyword(String instruction) {
        int start = 0;
        while (start < instruction.length() && !isAsciiLetter(instruction.charAt(start))) {
            start++;
        }
        int end = start;
        while (end < instruction.length()
                && end - start < MAX_KEYWORD_LENGTH
                && isAsciiLetter(instruction.charAt(end))) {
            end++;
        }
        return instruction.substring(start, end).toUpperCase(Locale.ROOT);
    }

    private static boolean namesAnExternalReference(String instruction) {
        String lower = instruction.toLowerCase(Locale.ROOT);
        for (String scheme : EXTERNAL_SCHEMES) {
            if (lower.contains(scheme)) {
                return true;
            }
        }
        // A path carries no scheme and is resolved against the directory the upload is staged in,
        // so traversal out of that directory is a reference like any other.
        return lower.contains("../") || lower.contains("..\\") || namesAPath(lower);
    }

    private static boolean namesAPath(String lower) {
        for (int at = 0; at + 2 < lower.length(); at++) {
            char character = lower.charAt(at);
            if (character == '/' && (at == 0 || isTokenBreak(lower.charAt(at - 1)))) {
                return true;
            }
            char separator = lower.charAt(at + 2);
            if (isAsciiLetter(character)
                    && lower.charAt(at + 1) == ':'
                    && (separator == '\\' || separator == '/')) {
                return true;
            }
        }
        return false;
    }

    private static boolean isTokenBreak(char character) {
        return character == ' ' || character == '"' || character == '\t' || character == '\'';
    }

    private static boolean isAsciiLetter(char character) {
        return (character >= 'A' && character <= 'Z') || (character >= 'a' && character <= 'z');
    }
}
