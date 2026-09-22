package stirling.software.SPDF.controller.api.converters;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.nio.file.Path;
import java.util.List;
import java.util.Locale;
import java.util.Set;

import org.apache.poi.poifs.filesystem.DirectoryNode;
import org.apache.poi.poifs.filesystem.DocumentInputStream;
import org.apache.poi.poifs.filesystem.POIFSFileSystem;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.util.OfficeDocumentSanitizer;

/** Blanks resolving Word field instructions while preserving offsets and field-result text. */
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

    // No genuine field instruction runs anything like this long; the cap bounds the rewrite a
    // stream with no terminating field character could otherwise provoke.
    private static final int MAX_INSTRUCTION_CHARS = 8192;

    // WW8 stores a text run either compressed to one byte per character or as UTF-16LE.
    private static final int[] CHARACTER_WIDTHS = {1, 2};

    // Stands in for a UTF-16 character no keyword or reference can be written with.
    private static final char NON_ASCII = '\uFFFF';

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
            int blanked = 0;
            for (int characterWidth : CHARACTER_WIDTHS) {
                blanked += blankResolvingFields(stream, characterWidth);
            }
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

    private static int blankResolvingFields(byte[] stream, int characterWidth) {
        int blanked = 0;
        for (int i = 0; i + characterWidth <= stream.length; i++) {
            if (!isCharacter(stream, i, characterWidth, FIELD_BEGIN)) {
                continue;
            }
            int start = i + characterWidth;
            int end = instructionEnd(stream, i, characterWidth);
            if (end < 0 || !isResolving(instruction(stream, start, end, characterWidth))) {
                continue;
            }
            for (int at = start; at < end; at += characterWidth) {
                stream[at] = ' ';
                if (characterWidth == 2) {
                    stream[at + 1] = 0;
                }
            }
            blanked++;
            i = end;
        }
        return blanked;
    }

    /** Finds the next separator or end marker within the scan limit, or returns -1. */
    private static int instructionEnd(byte[] stream, int fieldBegin, int characterWidth) {
        int limit = Math.min(stream.length, fieldBegin + MAX_INSTRUCTION_CHARS * characterWidth);
        for (int end = fieldBegin + characterWidth; end + characterWidth <= limit; ) {
            if (isCharacter(stream, end, characterWidth, FIELD_SEPARATOR)
                    || isCharacter(stream, end, characterWidth, FIELD_END)) {
                return end;
            }
            end += characterWidth;
        }
        return -1;
    }

    private static String instruction(byte[] stream, int start, int end, int characterWidth) {
        StringBuilder instruction = new StringBuilder((end - start) / characterWidth);
        for (int at = start; at + characterWidth <= end; at += characterWidth) {
            boolean ascii = characterWidth == 1 || stream[at + 1] == 0;
            instruction.append(ascii ? (char) (stream[at] & 0xFF) : NON_ASCII);
        }
        return instruction.toString();
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

    private static boolean isCharacter(byte[] stream, int offset, int characterWidth, int value) {
        if (offset < 0 || offset + characterWidth > stream.length) {
            return false;
        }
        return (stream[offset] & 0xFF) == value && (characterWidth == 1 || stream[offset + 1] == 0);
    }
}
