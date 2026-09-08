package stirling.software.SPDF.controller.api.converters;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.nio.file.Path;
import java.util.Locale;
import java.util.Set;

import org.apache.poi.poifs.filesystem.DirectoryNode;
import org.apache.poi.poifs.filesystem.DocumentInputStream;
import org.apache.poi.poifs.filesystem.POIFSFileSystem;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.util.OfficeDocumentSanitizer;

/**
 * Blanks the field instructions LibreOffice's WW8 importer dereferences out of a Word compound
 * file's {@code WordDocument} stream.
 *
 * <p>{@code INCLUDEPICTURE "http://…"} in a {@code .doc} is fetched at import, proven with a
 * loopback listener; the same field expressed in RTF or OOXML is not, because writerfilter leaves
 * it unhandled. So a Word binary cannot be treated as an opaque pass-through the way {@code .rtf}
 * can.
 *
 * <p>The instruction is overwritten with spaces rather than removed, so every byte offset the FIB
 * records into this stream still lands where it did, and the field becomes one whose type the
 * importer does not recognise.
 */
@Slf4j
final class WordBinarySanitizer {

    private static final String WORD_DOCUMENT_STREAM = "WordDocument";

    // Field characters, MS-DOC 2.8.25: begin, separator, end.
    private static final int FIELD_BEGIN = 0x13;
    private static final int FIELD_SEPARATOR = 0x14;
    private static final int FIELD_END = 0x15;

    /**
     * The field instructions whose argument the importer resolves. {@code HYPERLINK} is absent
     * deliberately: it becomes a link in the output rather than a fetch, exactly as an {@code <a
     * href>} does on the HTML path.
     */
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

    private static final int MAX_KEYWORD_LENGTH = 32;

    // No genuine field instruction runs anything like this long; the cap bounds the rewrite a
    // stream with no terminating field character could otherwise provoke.
    private static final int MAX_INSTRUCTION_CHARS = 8192;

    // WW8 stores a text run either compressed to one byte per character or as UTF-16LE.
    private static final int[] CHARACTER_WIDTHS = {1, 2};

    private WordBinarySanitizer() {}

    /**
     * Rewrites {@code staged} in place, leaving it untouched when it declares no resolving field.
     *
     * @throws OfficeDocumentSanitizer.UnsanitizableDocumentException when the compound file cannot
     *     be read or written, so an unreadable one is refused rather than converted unsanitized
     */
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
            int keywordStart = i + characterWidth;
            while (isCharacter(stream, keywordStart, characterWidth, ' ')) {
                keywordStart += characterWidth;
            }
            if (!RESOLVING_FIELDS.contains(keyword(stream, keywordStart, characterWidth))) {
                continue;
            }
            int end = keywordStart;
            int limit = Math.min(stream.length, i + MAX_INSTRUCTION_CHARS * characterWidth);
            while (end + characterWidth <= limit
                    && !isCharacter(stream, end, characterWidth, FIELD_SEPARATOR)
                    && !isCharacter(stream, end, characterWidth, FIELD_END)) {
                end += characterWidth;
            }
            for (int at = i + characterWidth; at < end; at += characterWidth) {
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

    private static String keyword(byte[] stream, int offset, int characterWidth) {
        StringBuilder keyword = new StringBuilder();
        for (int at = offset;
                keyword.length() < MAX_KEYWORD_LENGTH && at + characterWidth <= stream.length;
                at += characterWidth) {
            if (characterWidth == 2 && stream[at + 1] != 0) {
                break;
            }
            char character = (char) (stream[at] & 0xFF);
            if (character < 'A' || character > 'z' || (character > 'Z' && character < 'a')) {
                break;
            }
            keyword.append(character);
        }
        return keyword.toString().toUpperCase(Locale.ROOT);
    }

    private static boolean isCharacter(byte[] stream, int offset, int characterWidth, int value) {
        if (offset < 0 || offset + characterWidth > stream.length) {
            return false;
        }
        return (stream[offset] & 0xFF) == value && (characterWidth == 1 || stream[offset + 1] == 0);
    }
}
