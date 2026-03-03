package stirling.software.SPDF.service.pdf.impl;

import java.io.ByteArrayOutputStream;
import java.lang.foreign.Arena;
import java.lang.foreign.MemorySegment;
import java.lang.foreign.ValueLayout;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.pdfium.binding.FPDF_FILEWRITE_;
import stirling.software.SPDF.pdfium.binding.PdfiumLib;
import stirling.software.SPDF.service.pdf.PdfiumService;

/**
 * PDFium-based PDF service using Java 25 FFM (Foreign Function & Memory) API.
 *
 * <p>Provides true content-stripping redaction that removes text objects from the content stream,
 * paints opaque rectangles, and rewrites the page. This is fundamentally different from cosmetic
 * overlay approaches that leave the original text extractable.
 *
 * <p>Thread safety: PDFium is NOT thread-safe per-document. Each {@code FPDF_DOCUMENT} must be
 * accessed from a single thread. Separate documents on separate threads is fine.
 *
 * <p>The jextract-generated bindings in {@code stirling.software.SPDF.pdfium.binding} provide
 * static method wrappers for every PDFium C function.
 */
@Slf4j
public class PdfiumServiceImpl implements PdfiumService {

    /** PDFium page object type constant for text objects. */
    private static final int FPDF_PAGEOBJ_TEXT = 1;

    /** PDFium fill mode: alternate (even-odd) rule. */
    private static final int FPDF_FILLMODE_ALTERNATE = 2;

    /** PDFium search flag: case-sensitive matching. */
    private static final int FPDF_MATCHCASE = 0x00000001;

    /** Pixels per point at 72 DPI (1:1 since PDF uses 72 points/inch). */
    private static final double POINTS_PER_INCH = 72.0;

    // One-time library initialization
    static {
        try {
            // FPDF_InitLibrary is generated as a variadic invoker by jextract
            PdfiumLib.FPDF_InitLibrary.makeInvoker().apply();
            log.info("[PDFium] FPDF_InitLibrary() called successfully.");
        } catch (Exception e) {
            log.error("[PDFium] Failed to initialize PDFium library.", e);
            throw new ExceptionInInitializerError(e);
        }
    }

    @Override
    public boolean isAvailable() {
        return true;
    }

    /**
     * {@inheritDoc}
     *
     * <p>Algorithm:
     *
     * <ol>
     *   <li>Load PDF from bytes into PDFium
     *   <li>For each page, find all text matches (literal via PDFium or regex via Java)
     *   <li>Collect bounding rectangles for each match
     *   <li>Remove text objects whose bounds overlap any redaction rectangle (reverse-order
     *       iteration)
     *   <li>Paint opaque colored rectangles over redacted regions
     *   <li>Rewrite page content stream via {@code FPDFPage_GenerateContent()}
     *   <li>Save modified document
     * </ol>
     */
    @Override
    public byte[] autoRedact(
            byte[] pdfBytes,
            List<String> patterns,
            boolean useRegex,
            boolean caseSensitive,
            int redactColor) {

        if (pdfBytes == null || pdfBytes.length == 0) {
            log.warn("[PDFium] autoRedact called with null/empty PDF bytes.");
            return pdfBytes;
        }
        if (patterns == null || patterns.isEmpty()) {
            log.warn("[PDFium] autoRedact called with no patterns.");
            return pdfBytes;
        }

        // Extract ARGB components from redactColor
        int alpha = (redactColor >> 24) & 0xFF;
        int red = (redactColor >> 16) & 0xFF;
        int green = (redactColor >> 8) & 0xFF;
        int blue = redactColor & 0xFF;

        // The arena holding pdfBytes must outlive the FPDF_DOCUMENT
        try (Arena arena = Arena.ofConfined()) {
            // Copy PDF bytes into native memory
            MemorySegment pdfBuf = arena.allocate(pdfBytes.length);
            MemorySegment.copy(
                    pdfBytes, 0, pdfBuf, ValueLayout.JAVA_BYTE, 0, pdfBytes.length);

            // Load document
            MemorySegment doc =
                    PdfiumLib.FPDF_LoadMemDocument(pdfBuf, pdfBytes.length, MemorySegment.NULL);
            if (doc.equals(MemorySegment.NULL)) {
                // FPDF_GetLastError is generated as a variadic invoker by jextract
                long err = PdfiumLib.FPDF_GetLastError.makeInvoker().apply();
                log.error("[PDFium] Failed to load PDF document, error code: {}", err);
                return pdfBytes;
            }

            try {
                int pageCount = PdfiumLib.FPDF_GetPageCount(doc);
                log.debug("[PDFium] Document has {} pages.", pageCount);

                int totalRedactions = 0;

                for (int pageIdx = 0; pageIdx < pageCount; pageIdx++) {
                    MemorySegment page = PdfiumLib.FPDF_LoadPage(doc, pageIdx);
                    if (page.equals(MemorySegment.NULL)) {
                        log.warn("[PDFium] Failed to load page {}.", pageIdx);
                        continue;
                    }

                    try {
                        MemorySegment textPage = PdfiumLib.FPDFText_LoadPage(page);
                        if (textPage.equals(MemorySegment.NULL)) {
                            log.warn("[PDFium] Failed to load text page {}.", pageIdx);
                            continue;
                        }

                        try {
                            // Phase 1: Find all match bounding boxes
                            List<float[]> redactRects = new ArrayList<>();

                            for (String pattern : patterns) {
                                if (pattern == null || pattern.trim().isEmpty()) {
                                    continue;
                                }
                                String trimmed = pattern.trim();

                                if (useRegex) {
                                    collectRegexMatchRects(
                                            arena,
                                            textPage,
                                            trimmed,
                                            caseSensitive,
                                            redactRects);
                                } else {
                                    collectLiteralMatchRects(
                                            arena,
                                            textPage,
                                            trimmed,
                                            caseSensitive,
                                            redactRects);
                                }
                            }

                            if (redactRects.isEmpty()) {
                                log.debug(
                                        "[PDFium] No matches found on page {}.", pageIdx);
                                continue;
                            }

                            log.debug(
                                    "[PDFium] Page {}: {} redaction rects found.",
                                    pageIdx,
                                    redactRects.size());

                            // Phase 2: Remove overlapping text objects (REVERSE ORDER)
                            int removed =
                                    removeOverlappingTextObjects(page, redactRects);
                            log.debug(
                                    "[PDFium] Page {}: removed {} text objects.",
                                    pageIdx,
                                    removed);

                            // Phase 3: Paint redaction rectangles
                            for (float[] rect : redactRects) {
                                float left = rect[0];
                                float bottom = rect[1];
                                float right = rect[2];
                                float top = rect[3];
                                float width = right - left;
                                float height = top - bottom;

                                MemorySegment rectObj =
                                        PdfiumLib.FPDFPageObj_CreateNewRect(
                                                left, bottom, width, height);
                                if (rectObj.equals(MemorySegment.NULL)) {
                                    log.warn(
                                            "[PDFium] Failed to create rect on page"
                                                    + " {}.",
                                            pageIdx);
                                    continue;
                                }

                                PdfiumLib.FPDFPageObj_SetFillColor(
                                        rectObj, red, green, blue, alpha);
                                // Fill with alternate rule, no stroke
                                PdfiumLib.FPDFPath_SetDrawMode(
                                        rectObj, FPDF_FILLMODE_ALTERNATE, 0);
                                PdfiumLib.FPDFPage_InsertObject(page, rectObj);
                            }

                            // Phase 4: Commit — rewrite content stream
                            if (PdfiumLib.FPDFPage_GenerateContent(page) == 0) {
                                log.error(
                                        "[PDFium] FPDFPage_GenerateContent failed on"
                                                + " page {}.",
                                        pageIdx);
                            }

                            totalRedactions += redactRects.size();

                        } finally {
                            PdfiumLib.FPDFText_ClosePage(textPage);
                        }
                    } finally {
                        PdfiumLib.FPDF_ClosePage(page);
                    }
                }

                if (totalRedactions == 0) {
                    log.info("[PDFium] No matches found in document — returning original.");
                    return pdfBytes;
                }

                log.info(
                        "[PDFium] Redacted {} regions across {} pages.",
                        totalRedactions,
                        pageCount);

                // Save document using FPDF_FILEWRITE upcall
                return saveDocument(arena, doc);

            } finally {
                PdfiumLib.FPDF_CloseDocument(doc);
            }
        } catch (Exception e) {
            log.error("[PDFium] autoRedact failed unexpectedly.", e);
            return pdfBytes;
        }
    }

    /**
     * {@inheritDoc}
     *
     * <p>Renders the specified page at the given DPI using PDFium's {@code FPDF_RenderPageBitmap}.
     */
    @Override
    public byte[] renderPageToRgb(byte[] pdfBytes, int pageIndex, int dpi) {
        if (pdfBytes == null || pdfBytes.length == 0) {
            return new byte[0];
        }

        try (Arena arena = Arena.ofConfined()) {
            MemorySegment pdfBuf = arena.allocate(pdfBytes.length);
            MemorySegment.copy(
                    pdfBytes, 0, pdfBuf, ValueLayout.JAVA_BYTE, 0, pdfBytes.length);

            MemorySegment doc =
                    PdfiumLib.FPDF_LoadMemDocument(pdfBuf, pdfBytes.length, MemorySegment.NULL);
            if (doc.equals(MemorySegment.NULL)) {
                log.error("[PDFium] renderPageToRgb: Failed to load document.");
                return new byte[0];
            }

            try {
                int pageCount = PdfiumLib.FPDF_GetPageCount(doc);
                if (pageIndex < 0 || pageIndex >= pageCount) {
                    log.error(
                            "[PDFium] renderPageToRgb: page index {} out of range [0, {}).",
                            pageIndex,
                            pageCount);
                    return new byte[0];
                }

                MemorySegment page = PdfiumLib.FPDF_LoadPage(doc, pageIndex);
                if (page.equals(MemorySegment.NULL)) {
                    log.error("[PDFium] renderPageToRgb: Failed to load page {}.", pageIndex);
                    return new byte[0];
                }

                try {
                    double widthPts = PdfiumLib.FPDF_GetPageWidth(page);
                    double heightPts = PdfiumLib.FPDF_GetPageHeight(page);

                    int widthPx = (int) Math.ceil(widthPts * dpi / POINTS_PER_INCH);
                    int heightPx = (int) Math.ceil(heightPts * dpi / POINTS_PER_INCH);

                    // FPDFBitmap_BGRx = 4 bytes per pixel (BGRA, ignore alpha)
                    int stride = widthPx * 4;
                    MemorySegment bitmap =
                            PdfiumLib.FPDFBitmap_Create(widthPx, heightPx, 0);
                    if (bitmap.equals(MemorySegment.NULL)) {
                        log.error("[PDFium] Failed to create bitmap.");
                        return new byte[0];
                    }

                    try {
                        // Fill white background
                        PdfiumLib.FPDFBitmap_FillRect(
                                bitmap, 0, 0, widthPx, heightPx, 0xFFFFFFFFL);

                        // Render page (flags=0 for normal rendering)
                        PdfiumLib.FPDF_RenderPageBitmap(
                                bitmap, page, 0, 0, widthPx, heightPx, 0, 0);

                        // Extract pixel data
                        MemorySegment bufferPtr = PdfiumLib.FPDFBitmap_GetBuffer(bitmap);
                        long totalBytes = (long) stride * heightPx;
                        MemorySegment pixels = bufferPtr.reinterpret(totalBytes);

                        // Convert BGRA to RGB
                        byte[] rgb = new byte[widthPx * heightPx * 3];
                        byte[] bgra = pixels.toArray(ValueLayout.JAVA_BYTE);
                        for (int y = 0; y < heightPx; y++) {
                            for (int x = 0; x < widthPx; x++) {
                                int srcOff = y * stride + x * 4;
                                int dstOff = (y * widthPx + x) * 3;
                                rgb[dstOff] = bgra[srcOff + 2]; // R
                                rgb[dstOff + 1] = bgra[srcOff + 1]; // G
                                rgb[dstOff + 2] = bgra[srcOff]; // B
                            }
                        }

                        return rgb;
                    } finally {
                        PdfiumLib.FPDFBitmap_Destroy(bitmap);
                    }
                } finally {
                    PdfiumLib.FPDF_ClosePage(page);
                }
            } finally {
                PdfiumLib.FPDF_CloseDocument(doc);
            }
        } catch (Exception e) {
            log.error("[PDFium] renderPageToRgb failed.", e);
            return new byte[0];
        }
    }

    // ========================================================================
    // Text matching — literal (PDFium native) and regex (Java-side)
    // ========================================================================

    /**
     * Collect bounding rectangles for all literal matches of {@code searchText} on the given text
     * page using PDFium's built-in search ({@code FPDFText_FindStart}/{@code FindNext}).
     */
    private void collectLiteralMatchRects(
            Arena arena,
            MemorySegment textPage,
            String searchText,
            boolean caseSensitive,
            List<float[]> outRects) {

        // PDFium expects null-terminated UTF-16LE strings
        MemorySegment searchBuf = allocateUtf16Le(arena, searchText);

        long flags = caseSensitive ? FPDF_MATCHCASE : 0L;
        MemorySegment search =
                PdfiumLib.FPDFText_FindStart(textPage, searchBuf, flags, 0);
        if (search.equals(MemorySegment.NULL)) {
            log.debug("[PDFium] FPDFText_FindStart returned NULL for '{}'.", searchText);
            return;
        }

        try {
            while (PdfiumLib.FPDFText_FindNext(search) != 0) {
                int charIdx = PdfiumLib.FPDFText_GetSchResultIndex(search);
                int charCount = PdfiumLib.FPDFText_GetSchCount(search);

                collectRectsForCharRange(arena, textPage, charIdx, charCount, outRects);
            }
        } finally {
            PdfiumLib.FPDFText_FindClose(search);
        }
    }

    /**
     * Collect bounding rectangles for all regex matches on the given text page. Since PDFium's
     * {@code FPDFText_FindStart} only supports literal matching, we:
     *
     * <ol>
     *   <li>Extract full page text via {@code FPDFText_GetText()}
     *   <li>Run {@link java.util.regex.Pattern} matching in Java
     *   <li>Map each match's character index range back to page coordinates
     * </ol>
     */
    private void collectRegexMatchRects(
            Arena arena,
            MemorySegment textPage,
            String regex,
            boolean caseSensitive,
            List<float[]> outRects) {

        int charCount = PdfiumLib.FPDFText_CountChars(textPage);
        if (charCount <= 0) {
            return;
        }

        // Extract full page text as UTF-16LE, then convert to Java String
        // FPDFText_GetText writes (count+1) UTF-16 code units (includes null terminator)
        int bufChars = charCount + 1;
        MemorySegment textBuf =
                arena.allocate((long) bufChars * 2); // 2 bytes per UTF-16 code unit
        int written = PdfiumLib.FPDFText_GetText(textPage, 0, charCount, textBuf);
        if (written <= 0) {
            return;
        }

        // Convert from UTF-16LE to Java String (exclude null terminator)
        byte[] utf16bytes = textBuf.toArray(ValueLayout.JAVA_BYTE);
        // written includes the null terminator char, so actual text chars = written - 1
        int textByteLen = (written - 1) * 2;
        if (textByteLen <= 0 || textByteLen > utf16bytes.length) {
            return;
        }
        String pageText = new String(utf16bytes, 0, textByteLen, StandardCharsets.UTF_16LE);

        // Compile regex
        int regexFlags = caseSensitive ? 0 : Pattern.CASE_INSENSITIVE | Pattern.UNICODE_CASE;
        Pattern pattern;
        try {
            pattern = Pattern.compile(regex, regexFlags);
        } catch (Exception e) {
            log.warn("[PDFium] Invalid regex pattern '{}': {}", regex, e.getMessage());
            return;
        }

        Matcher matcher = pattern.matcher(pageText);
        while (matcher.find()) {
            int startIdx = matcher.start();
            int endIdx = matcher.end();
            int count = endIdx - startIdx;

            if (count > 0) {
                collectRectsForCharRange(arena, textPage, startIdx, count, outRects);
            }
        }
    }

    /**
     * Collect the bounding rectangles covering a character range on a text page. Uses {@code
     * FPDFText_CountRects} and {@code FPDFText_GetRect} to get the minimal set of bounding boxes
     * that cover the specified characters.
     */
    private void collectRectsForCharRange(
            Arena arena,
            MemorySegment textPage,
            int startCharIdx,
            int charCount,
            List<float[]> outRects) {

        int rectCount = PdfiumLib.FPDFText_CountRects(textPage, startCharIdx, charCount);

        // Allocate output pointers for GetRect
        MemorySegment pLeft = arena.allocate(ValueLayout.JAVA_DOUBLE);
        MemorySegment pTop = arena.allocate(ValueLayout.JAVA_DOUBLE);
        MemorySegment pRight = arena.allocate(ValueLayout.JAVA_DOUBLE);
        MemorySegment pBottom = arena.allocate(ValueLayout.JAVA_DOUBLE);

        for (int r = 0; r < rectCount; r++) {
            if (PdfiumLib.FPDFText_GetRect(
                            textPage, r, pLeft, pTop, pRight, pBottom)
                    == 0) {
                continue;
            }

            float left = (float) pLeft.get(ValueLayout.JAVA_DOUBLE, 0);
            float top = (float) pTop.get(ValueLayout.JAVA_DOUBLE, 0);
            float right = (float) pRight.get(ValueLayout.JAVA_DOUBLE, 0);
            float bottom = (float) pBottom.get(ValueLayout.JAVA_DOUBLE, 0);

            // Normalize: ensure left < right, bottom < top
            if (left > right) {
                float tmp = left;
                left = right;
                right = tmp;
            }
            if (bottom > top) {
                float tmp = bottom;
                bottom = top;
                top = tmp;
            }

            outRects.add(new float[] {left, bottom, right, top});
        }
    }

    // ========================================================================
    // Object removal
    // ========================================================================

    /**
     * Remove all text objects on the page whose bounding box overlaps any of the redaction
     * rectangles. Iterates in <b>reverse index order</b> to avoid index shifting bugs when
     * removing.
     *
     * @return number of objects removed
     */
    private int removeOverlappingTextObjects(MemorySegment page, List<float[]> redactRects) {
        int objectCount = PdfiumLib.FPDFPage_CountObjects(page);
        int removed = 0;

        // Allocate bounds output pointers
        try (Arena boundsArena = Arena.ofConfined()) {
            MemorySegment pLeft = boundsArena.allocate(ValueLayout.JAVA_FLOAT);
            MemorySegment pBottom = boundsArena.allocate(ValueLayout.JAVA_FLOAT);
            MemorySegment pRight = boundsArena.allocate(ValueLayout.JAVA_FLOAT);
            MemorySegment pTop = boundsArena.allocate(ValueLayout.JAVA_FLOAT);

            for (int i = objectCount - 1; i >= 0; i--) {
                MemorySegment obj = PdfiumLib.FPDFPage_GetObject(page, i);
                if (obj.equals(MemorySegment.NULL)) {
                    continue;
                }

                int objType = PdfiumLib.FPDFPageObj_GetType(obj);
                if (objType != FPDF_PAGEOBJ_TEXT) {
                    continue;
                }

                // Get object bounds
                if (PdfiumLib.FPDFPageObj_GetBounds(obj, pLeft, pBottom, pRight, pTop) == 0) {
                    continue;
                }

                float objLeft = pLeft.get(ValueLayout.JAVA_FLOAT, 0);
                float objBottom = pBottom.get(ValueLayout.JAVA_FLOAT, 0);
                float objRight = pRight.get(ValueLayout.JAVA_FLOAT, 0);
                float objTop = pTop.get(ValueLayout.JAVA_FLOAT, 0);

                // Check overlap against all redaction rectangles
                for (float[] rect : redactRects) {
                    if (overlaps(rect, objLeft, objBottom, objRight, objTop)) {
                        if (PdfiumLib.FPDFPage_RemoveObject(page, obj) != 0) {
                            PdfiumLib.FPDFPageObj_Destroy(obj);
                            removed++;
                        }
                        break; // Object already removed, move to next
                    }
                }
            }
        }

        return removed;
    }

    // ========================================================================
    // Document saving via FPDF_FILEWRITE upcall
    // ========================================================================

    /**
     * Save the PDFium document to a byte array using the {@code FPDF_SaveAsCopy} function with an
     * {@code FPDF_FILEWRITE} upcall stub.
     *
     * <p>The jextract-generated {@code FPDF_FILEWRITE} class provides struct layout accessors and
     * upcall allocation for the {@code WriteBlock} callback.
     */
    private byte[] saveDocument(Arena arena, MemorySegment doc) {
        ByteArrayOutputStream output = new ByteArrayOutputStream();

        MemorySegment fileWrite = FPDF_FILEWRITE_.allocate(arena);
        FPDF_FILEWRITE_.version(fileWrite, 1);

        MemorySegment writeBlockStub =
                FPDF_FILEWRITE_.WriteBlock.allocate(
                        (pThis, pData, size) -> {
                            if (size > 0 && !pData.equals(MemorySegment.NULL)) {
                                byte[] chunk =
                                        pData.reinterpret(size)
                                                .toArray(ValueLayout.JAVA_BYTE);
                                output.write(chunk, 0, chunk.length);
                            }
                            return 1; // success
                        },
                        arena);
        FPDF_FILEWRITE_.WriteBlock(fileWrite, writeBlockStub);

        int saveResult = PdfiumLib.FPDF_SaveAsCopy(doc, fileWrite, 0L);
        if (saveResult == 0) {
            log.error("[PDFium] FPDF_SaveAsCopy failed.");
            return new byte[0];
        }

        byte[] result = output.toByteArray();
        log.debug("[PDFium] Saved document: {} bytes.", result.length);
        return result;
    }

    // ========================================================================
    // Utility methods
    // ========================================================================

    /**
     * Allocate a null-terminated UTF-16LE string in the given arena. PDFium expects all string
     * parameters as null-terminated UTF-16LE.
     *
     * @param arena memory arena for allocation
     * @param text Java string to encode
     * @return MemorySegment containing the UTF-16LE encoded, null-terminated string
     */
    private static MemorySegment allocateUtf16Le(Arena arena, String text) {
        byte[] utf16 = text.getBytes(StandardCharsets.UTF_16LE);
        // +2 for null terminator (2 bytes for UTF-16)
        MemorySegment seg = arena.allocate(utf16.length + 2);
        MemorySegment.copy(utf16, 0, seg, ValueLayout.JAVA_BYTE, 0, utf16.length);
        // Last 2 bytes are zero-initialized by Arena.allocate → serves as null terminator
        return seg;
    }

    /**
     * Check if two axis-aligned bounding boxes overlap.
     *
     * @param redactRect redaction rectangle as [left, bottom, right, top]
     * @param objLeft left edge of the object
     * @param objBottom bottom edge of the object
     * @param objRight right edge of the object
     * @param objTop top edge of the object
     * @return {@code true} if the rectangles overlap
     */
    private static boolean overlaps(
            float[] redactRect,
            float objLeft,
            float objBottom,
            float objRight,
            float objTop) {
        // Two rectangles do NOT overlap if one is completely to the left, right, above, or below
        return !(objRight < redactRect[0]
                || objLeft > redactRect[2]
                || objTop < redactRect[1]
                || objBottom > redactRect[3]);
    }
}
