package stirling.software.common.util;

import java.nio.charset.StandardCharsets;
import java.util.ArrayDeque;
import java.util.Arrays;
import java.util.Deque;
import java.util.Locale;
import java.util.Set;

import org.springframework.stereotype.Component;

import lombok.extern.slf4j.Slf4j;

/**
 * Neutralises the RTF constructs that make LibreOffice read or fetch another resource: fields whose
 * type is an include, import or DDE link, and OLE object links. Bytes are overwritten in place, so
 * the output has the input's length and {@code \bin} payloads keep their offsets. A neutralised
 * field loses its {@code \fldinst} control word, so LibreOffice never sees an instruction for it;
 * its cached result text stays.
 *
 * <p>The scanner tokenises the way LibreOffice's RTF importer does (rtftokenizer.cxx,
 * rtfdocumentimpl.cxx), because a field type the two read differently is a bypass. It looks for the
 * type both ways the importer does: the raw lookahead run straight after {@code \fldinst}, which
 * for INCLUDEPICTURE makes it read the named file, and the decoded instruction text, where hex and
 * Unicode escapes can spell the type. Where the importer's reading cannot be predicted from the
 * bytes alone, every field instruction in the document is removed instead.
 */
@Component
@Slf4j
public class RtfSanitizer {

    private static final Set<String> FIELD_KEYWORDS =
            Set.of("INCLUDEPICTURE", "INCLUDETEXT", "DDEAUTO", "IMPORT", "LINK", "DDE");

    private static final Set<String> OBJECT_LINK_WORDS =
            Set.of("objautlink", "objlink", "objupdate", "objdata");

    private static final String FIELD_INSTRUCTION = "fldinst";

    private static final Set<String> FLOWING_DESTINATIONS = Set.of("field", "fldrslt", "formfield");

    /**
     * Destinations whose text LibreOffice's RTF importer routes away from the document stream
     * (rtfdispatchdestination.cxx, and text() and resolveChars() in rtfdocumentimpl.cxx), so it
     * never becomes part of an enclosing field instruction.
     */
    private static final Set<String> DIVERTING_DESTINATIONS =
            Set.of(
                    """
                    aftncn aftnsep aftnsepc annotation atnauthor atndate atnicn atnid atnparent
                    atnref atntime atrfend atrfstart author bkmkend bkmkstart blipuid buptim
                    category colorschememapping colortbl comment company datafield datastore
                    defchp defpap doccomm docvar ebcend ebcstart factoidname falt fchars ffdeftext
                    ffentrymcr ffexitmcr ffformat ffhelptext ffl ffname ffstattext file filetbl
                    fldtype fname fontemb fontfile fonttbl footer footerf footerl footerr footnote
                    ftncn ftnsepc g generator gridtbl header headerf headerl headerr hl hlfr
                    hlinkbase hlloc hlsrc hsv htmltag keycode keywords latentstyles lchars
                    levelnumbers leveltext linkval listname liststylename lsdlockedexcept
                    mailmerge maln manager mchr mcount mdiff mgrow mhtmltag mlimloc mmaddfieldname
                    mmaxdist mmc mmconnectstr mmconnectstrdata mmcs mmdatasource mmheadersource
                    mmmailsubject mmodso mmodsofilter mmodsofldmpdata mmodsomappedname mmodsoname
                    mmodsorecipdata mmodsosort mmodsosrc mmodsotable mmodsoudl mmodsoudldata
                    mmodsouniquetag mmquery mphant mpos mr mshow mshp mtransp mtype mvfmf mvfml
                    mvtof mvtol nextfile nonesttables objalias objclass objdata objname objsect
                    objtime oldcprops oldpprops oldsprops oldtprops oleclsid operator panose
                    password passwordhash pgp pgptbl pict pnseclvl pntext pntxta pntxtb private
                    propname protend protstart protusertbl pxe revtbl rsidtbl rxe shprslt sn
                    staticval stylesheet subject sv svb template themedata title txe wgrffmtfilter
                    windowcaption writereservation writereservhash xe xform xmlattrname
                    xmlattrvalue xmlclose xmlname xmlnstbl xmlopen
                    """
                            .split("\\s+"));

    /**
     * The importer's other destinations, apart from field, fldinst, fldrslt and formfield: their
     * text reaches the instruction in some states and not others. One inside an instruction removes
     * it rather than guessing.
     */
    private static final Set<String> UNPREDICTABLE_DESTINATIONS =
            Set.of(
                    """
                    background creatim do dptxbxtext flymaincnt ftnsep info lfolevel list
                    listlevel listoverride listoverridetable listpicture listtable listtext macc
                    mbar mbox md mdeg mden me mf mfunc mlim mlimlow mlimupp mm mmath mmr mnary
                    mnum mrad msub msup nesttableprops object picprop pn printim result revtim rtf
                    shp shpgrp shpinst shppict shptxt sp tc ud upr userprops
                    """
                            .split("\\s+"));

    private static final byte MASK = (byte) 'x';

    public byte[] sanitize(byte[] rtfBytes) {
        if (rtfBytes == null || rtfBytes.length == 0) {
            return rtfBytes;
        }
        byte[] out = rtfBytes.clone();
        Scanner scanner = new Scanner(out);
        int masked = scanner.scan();
        if (scanner.unpredictable) {
            log.warn(
                    "RTF input uses constructs LibreOffice may parse differently; removed every"
                            + " field instruction");
        }
        if (masked > 0) {
            log.warn("Neutralised {} external-reference construct(s) in RTF input", masked);
        }
        return out;
    }

    /** Decoded text of one {@code \fldinst} group, with the source bytes behind each char. */
    private static final class Instruction {
        private final int namePosition;
        private final StringBuilder text = new StringBuilder();
        private int[] charStarts = new int[16];
        private int[] positions = new int[16];
        private int positionCount;

        Instruction(int namePosition) {
            this.namePosition = namePosition;
        }

        void append(char c, int[] sourcePositions, int sourceCount) {
            int index = text.length();
            if (index + 1 >= charStarts.length) {
                charStarts = Arrays.copyOf(charStarts, charStarts.length * 2);
            }
            while (positionCount + sourceCount > positions.length) {
                positions = Arrays.copyOf(positions, positions.length * 2);
            }
            text.append(c);
            charStarts[index] = positionCount;
            System.arraycopy(sourcePositions, 0, positions, positionCount, sourceCount);
            positionCount += sourceCount;
            charStarts[index + 1] = positionCount;
        }
    }

    /** One group's share of the importer's parser state; a child group starts with a copy. */
    private static final class Group {
        int unicodeSkip = 1;
        int charsToSkip;
        boolean hex;
        Instruction instruction;
        boolean ownsInstruction;
        boolean skipping;
        boolean picture;

        Group child() {
            Group child = new Group();
            child.unicodeSkip = unicodeSkip;
            child.charsToSkip = charsToSkip;
            child.hex = hex;
            child.instruction = instruction;
            // The importer resets a picture's subgroups to the normal text destination.
            child.skipping = skipping && !picture;
            return child;
        }
    }

    private static final class Scanner {
        private final byte[] data;
        private final Deque<Group> groups = new ArrayDeque<>();
        private Group current = new Group();
        private boolean pendingStar;
        private boolean shiftJisPossible;
        private boolean unpredictable;
        private int masked;

        // The importer keeps its hex-escape progress outside the group stack, so it carries over
        // when a group closes mid-escape; mirrored here for the same reason.
        private int hexRemaining = 2;
        private int hexValue;
        private final int[] hexPositions = new int[4];
        private int hexPositionCount;

        private final int[] single = new int[1];

        Scanner(byte[] data) {
            this.data = data;
        }

        int scan() {
            int pos = 0;
            while (pos < data.length) {
                int b = data[pos] & 0xFF;
                switch (b) {
                    case '{' -> {
                        groups.push(current);
                        current = current.child();
                        pos++;
                    }
                    case '}' -> {
                        closeGroup();
                        pos++;
                    }
                    case '\\' -> pos = controlSequence(pos);
                    case '\r', '\n' -> pos++;
                    default -> pos = character(pos, b);
                }
            }
            while (!groups.isEmpty()) {
                closeGroup();
            }
            if (current.ownsInstruction) {
                maskFieldType(current.instruction);
            }
            if (unpredictable) {
                removeAllFieldInstructions();
            }
            return masked;
        }

        private int character(int pos, int b) {
            if (current.hex) {
                if (Character.digit(b, 16) >= 0) {
                    hexValue = (hexValue << 4) + Character.digit(b, 16);
                }
                if (hexPositionCount < hexPositions.length) {
                    hexPositions[hexPositionCount++] = pos;
                }
                if (--hexRemaining == 0) {
                    char decoded = (char) (hexValue & 0xFF);
                    hexRemaining = 2;
                    hexValue = 0;
                    current.hex = false;
                    readChar(decoded, hexPositions, hexPositionCount);
                    hexPositionCount = 0;
                }
                return pos + 1;
            }
            if (shiftJisPossible && isShiftJisLeadByte(b) && pos + 1 < data.length) {
                int trail = data[pos + 1] & 0xFF;
                if (trail == '\\' || trail == '{' || trail == '}') {
                    unpredictable = true;
                }
            }
            single[0] = pos;
            readChar((char) b, single, 1);
            return pos + 1;
        }

        /** A char read as document text: dropped while a Unicode escape's fallback is pending. */
        private void readChar(char c, int[] sourcePositions, int sourceCount) {
            if (current.charsToSkip != 0) {
                current.charsToSkip--;
                return;
            }
            appendText(c, sourcePositions, sourceCount);
        }

        private void appendText(char c, int[] sourcePositions, int sourceCount) {
            if (current.instruction == null || current.skipping || isTransparent(c)) {
                return;
            }
            current.instruction.append(c, sourcePositions, sourceCount);
        }

        private void closeGroup() {
            if (current.hex) {
                unpredictable = true;
            }
            if (current.ownsInstruction) {
                maskFieldType(current.instruction);
            }
            if (!groups.isEmpty()) {
                current = groups.pop();
            }
        }

        /** Returns the position after the control word or symbol starting at pos. */
        private int controlSequence(int pos) {
            int next = pos + 1;
            if (next >= data.length) {
                return next;
            }
            int b = data[next] & 0xFF;
            if (isAsciiLetter(b)) {
                return controlWord(pos);
            }
            if (b == '*') {
                pendingStar = true;
                return next + 1;
            }
            pendingStar = false;
            switch (b) {
                case '\'' -> {
                    current.hex = true;
                    hexPositionCount = 0;
                    hexPositions[hexPositionCount++] = pos;
                    hexPositions[hexPositionCount++] = next;
                }
                case '\\', '{', '}', '~', '_' -> {
                    single[0] = pos;
                    appendText((char) b, single, 1);
                }
                default -> {}
            }
            return next + 1;
        }

        private int controlWord(int pos) {
            int wordStart = pos + 1;
            int cursor = wordStart;
            while (cursor < data.length && isAsciiLetter(data[cursor] & 0xFF)) {
                cursor++;
            }
            int wordEnd = cursor;
            String word =
                    new String(data, wordStart, wordEnd - wordStart, StandardCharsets.US_ASCII);

            if (cursor < data.length && data[cursor] == '-') {
                cursor++;
            }
            boolean negative = cursor > wordEnd;
            int digitsStart = cursor;
            long value = 0;
            boolean overflow = false;
            while (cursor < data.length && isAsciiDigit(data[cursor] & 0xFF)) {
                if (!overflow) {
                    value = value * 10 + (data[cursor] - '0');
                    overflow = value > Integer.MAX_VALUE;
                }
                cursor++;
            }
            boolean hasParameter = cursor > digitsStart;
            int parameter = overflow ? 0 : (int) value;
            if (negative) {
                parameter = -parameter;
            }
            if (cursor < data.length && data[cursor] == ' ') {
                cursor++;
            }

            boolean starred = pendingStar;
            pendingStar = false;
            String lower = word.toLowerCase(Locale.ROOT);

            if (OBJECT_LINK_WORDS.contains(lower)) {
                mask(wordStart, wordEnd);
                masked++;
            }
            if (lower.equals(FIELD_INSTRUCTION)) {
                maskLookaheadFieldType(cursor, wordStart);
                if (current.ownsInstruction) {
                    maskFieldType(current.instruction);
                }
                current.instruction = new Instruction(wordStart);
                current.ownsInstruction = true;
                current.skipping = false;
                current.picture = false;
                return cursor;
            }
            switch (word) {
                case "bin" -> {
                    if (parameter <= 0) {
                        unpredictable = true;
                        return cursor;
                    }
                    return (int) Math.min(data.length, (long) cursor + parameter);
                }
                case "u" -> {
                    if (parameter >= Short.MIN_VALUE && parameter <= 0xFFFF) {
                        int count = cursor - pos;
                        int[] token = new int[count];
                        for (int i = 0; i < count; i++) {
                            token[i] = pos + i;
                        }
                        appendText((char) parameter, token, count);
                        current.charsToSkip = current.unicodeSkip;
                    }
                }
                case "uc" -> {
                    int skip = hasParameter ? parameter : 1;
                    if (skip >= Short.MIN_VALUE && skip <= Short.MAX_VALUE) {
                        current.unicodeSkip = skip;
                    }
                }
                case "ansicpg", "cpg" -> shiftJisPossible |= parameter == 932;
                case "fcharset" -> shiftJisPossible |= parameter == 128;
                default -> {
                    if (DIVERTING_DESTINATIONS.contains(word)) {
                        current.skipping = true;
                        current.picture = word.equals("pict");
                    } else if (UNPREDICTABLE_DESTINATIONS.contains(word)
                            || (starred && !FLOWING_DESTINATIONS.contains(word))) {
                        // A starred word the importer does not know skips the group, one it
                        // knows keeps the group's text in the instruction.
                        if (current.instruction != null && !current.skipping) {
                            removeInstruction(current.instruction);
                        }
                        current.skipping = true;
                        current.picture = false;
                    }
                }
            }
            return cursor;
        }

        /**
         * Mirrors the lookahead LibreOffice's RTF importer runs straight after {@code \fldinst}: it
         * walks raw bytes, treats a backslash as opening a keyword that lasts until whitespace,
         * collects ASCII alphanumerics outside keywords, and takes the first run as the field type.
         * For INCLUDEPICTURE it then reads the named file, so the run is masked in place even where
         * it sits in a \bin payload or an ignorable group the scanner skips.
         */
        private void maskLookaheadFieldType(int start, int namePosition) {
            StringBuilder code = new StringBuilder();
            int[] codePositions = new int[64];
            boolean inKeyword = false;
            for (int i = start; i < data.length; i++) {
                int ch = data[i] & 0xFF;
                if (ch == '\\') {
                    inKeyword = true;
                }
                boolean alnum = isAsciiLetter(ch) || isAsciiDigit(ch);
                if (!inKeyword && alnum) {
                    if (code.length() == codePositions.length) {
                        codePositions = Arrays.copyOf(codePositions, codePositions.length * 2);
                    }
                    codePositions[code.length()] = i;
                    code.append((char) ch);
                } else if (inKeyword && isAsciiWhitespace(ch)) {
                    inKeyword = false;
                }
                if ((code.length() > 0 && !alnum) || ch == '}') {
                    break;
                }
            }
            if (isFieldKeyword(code)) {
                for (int i = 0; i < code.length(); i++) {
                    data[codePositions[i]] = MASK;
                }
                mask(namePosition, namePosition + FIELD_INSTRUCTION.length());
                masked++;
            }
        }

        /** Removes the instruction when its first letter run names a linking field type. */
        private void maskFieldType(Instruction instruction) {
            CharSequence text = instruction.text;
            int start = 0;
            while (start < text.length() && !isAsciiLetter(text.charAt(start))) {
                start++;
            }
            int end = start;
            while (end < text.length() && isAsciiLetter(text.charAt(end))) {
                end++;
            }
            if (end == start || !isFieldKeyword(text.subSequence(start, end))) {
                return;
            }
            for (int i = instruction.charStarts[start]; i < instruction.charStarts[end]; i++) {
                data[instruction.positions[i]] = MASK;
            }
            removeInstruction(instruction);
        }

        private void removeInstruction(Instruction instruction) {
            mask(instruction.namePosition, instruction.namePosition + FIELD_INSTRUCTION.length());
            masked++;
        }

        private void removeAllFieldInstructions() {
            for (int i = 0; i + FIELD_INSTRUCTION.length() < data.length; i++) {
                if (data[i] == '\\' && matchesIgnoreCase(i + 1, FIELD_INSTRUCTION)) {
                    mask(i + 1, i + 1 + FIELD_INSTRUCTION.length());
                    masked++;
                }
            }
        }

        private boolean matchesIgnoreCase(int from, String word) {
            if (from + word.length() > data.length) {
                return false;
            }
            for (int i = 0; i < word.length(); i++) {
                if (Character.toLowerCase((char) (data[from + i] & 0xFF)) != word.charAt(i)) {
                    return false;
                }
            }
            return true;
        }

        private void mask(int from, int to) {
            for (int i = Math.max(0, from); i < to && i < data.length; i++) {
                data[i] = MASK;
            }
        }
    }

    private static boolean isFieldKeyword(CharSequence word) {
        return word.length() > 0
                && FIELD_KEYWORDS.contains(word.toString().toUpperCase(Locale.ROOT));
    }

    /**
     * Chars that must not split a field type: escaped line breaks, which the importer drops from
     * text, and zero-width chars a reader may drop.
     */
    private static boolean isTransparent(char c) {
        return switch (c) {
            case '\r', '\n', 0x00AD, 0x200B, 0x200C, 0x200D, 0x2060, 0xFEFF -> true;
            default -> false;
        };
    }

    /** Bytes LibreOffice pairs with the next byte, whatever it is, when decoding Shift-JIS. */
    private static boolean isShiftJisLeadByte(int b) {
        return (b >= 0x80 && b <= 0x9F) || b >= 0xE0;
    }

    private static boolean isAsciiLetter(int c) {
        return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z');
    }

    private static boolean isAsciiDigit(int c) {
        return c >= '0' && c <= '9';
    }

    private static boolean isAsciiWhitespace(int c) {
        return c == ' ' || c == '\t' || c == '\n' || c == '\r' || c == '\f' || c == 0x0B;
    }
}
