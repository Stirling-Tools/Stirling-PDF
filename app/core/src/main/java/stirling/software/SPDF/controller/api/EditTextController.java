package stirling.software.SPDF.controller.api;

import java.io.OutputStream;
import java.nio.file.Files;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.springframework.core.io.Resource;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.WebDataBinder;
import org.springframework.web.bind.annotation.InitBinder;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.multipart.MultipartFile;

import io.github.pixee.security.Filenames;
import io.swagger.v3.oas.annotations.Operation;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.config.swagger.StandardPdfResponse;
import stirling.software.SPDF.model.api.general.EditTextRequest;
import stirling.software.SPDF.model.json.PdfJsonDocument;
import stirling.software.SPDF.model.json.PdfJsonPage;
import stirling.software.SPDF.model.json.PdfJsonTextElement;
import stirling.software.SPDF.service.PdfJsonConversionService;
import stirling.software.common.annotations.AutoJobPostMapping;
import stirling.software.common.annotations.api.GeneralApi;
import stirling.software.common.model.api.general.EditTextOperation;
import stirling.software.common.util.ExceptionUtils;
import stirling.software.common.util.GeneralUtils;
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;
import stirling.software.common.util.WebResponseUtils;
import stirling.software.common.util.propertyeditor.StringToArrayListPropertyEditor;

/**
 * Find/replace text editing for PDFs. Round-trips through {@link PdfJsonConversionService}: the
 * input PDF is parsed into the editable JSON model, find/replace operations are applied to the
 * {@code text} field of each text element, and the mutated model is rebuilt into a PDF.
 *
 * <p>Matching joins all text elements on a page into a single string before searching, so find
 * strings can span multiple visual runs (titles split per word, kerning-broken phrases, etc.).
 *
 * <p>For cross-element matches, the algorithm picks one of two strategies based on whether the
 * matched original elements are roughly word-sized:
 *
 * <ul>
 *   <li><b>Word distribution</b> when the matched text contains at least as many words as elements:
 *       replacement words are spread across the original element X positions, preserving centering
 *       for titles and similar layouts.
 *   <li><b>Single-element placement</b> when elements are sub-word (e.g. character-by-character
 *       Type3 glyph runs): the entire replacement is written into the first matched element and all
 *       others are emptied. This avoids visual overlap from placing multiple wide words at
 *       closely-spaced glyph X positions, at the cost of some left-shift relative to the original
 *       (centered) layout.
 * </ul>
 */
@Slf4j
@GeneralApi
@RequiredArgsConstructor
public class EditTextController {

    private static final Pattern FILE_EXTENSION_PATTERN = Pattern.compile("[.][^.]+$");

    private final PdfJsonConversionService pdfJsonConversionService;
    private final TempFileManager tempFileManager;

    @InitBinder
    public void initBinder(WebDataBinder binder) {
        binder.registerCustomEditor(
                List.class,
                "edits",
                new StringToArrayListPropertyEditor<>(EditTextOperation.class));
    }

    @AutoJobPostMapping(consumes = "multipart/form-data", value = "/edit-text")
    @StandardPdfResponse
    @Operation(
            summary = "Edit text in a PDF via find and replace",
            description =
                    "Applies an ordered list of find/replace operations to the text in a PDF and"
                            + " returns the edited PDF. Useful for find-and-replace, bulk renames"
                            + " (e.g. updating a company name throughout a document), and copy"
                            + " editing where the AI agent has identified specific replacements."
                            + " Matching is performed against the joined text of each page, so"
                            + " find strings can span multiple visual runs (titles split per word,"
                            + " kerning-broken phrases). For cross-element matches, replacement"
                            + " words are distributed across the original element positions so"
                            + " that centered or tracked layouts (titles, headers, etc.) remain"
                            + " visually aligned: there is no need to pad the replacement with"
                            + " extra spaces. Input:PDF Output:PDF Type:SISO")
    public ResponseEntity<Resource> editText(@ModelAttribute EditTextRequest request)
            throws Exception {
        MultipartFile inputFile = request.getFileInput();
        if (inputFile == null) {
            throw ExceptionUtils.createFileNullOrEmptyException();
        }
        List<EditTextOperation> edits = request.getEdits();
        if (edits == null || edits.isEmpty()) {
            throw ExceptionUtils.createIllegalArgumentException(
                    "error.editText.no.edits",
                    "No find/replace operations provided for text editing");
        }
        for (EditTextOperation edit : edits) {
            if (edit == null || edit.getFind() == null || edit.getFind().isEmpty()) {
                throw ExceptionUtils.createIllegalArgumentException(
                        "error.editText.empty.find", "Each edit must have a non-empty find string");
            }
        }

        boolean wholeWordSearch = Boolean.TRUE.equals(request.getWholeWordSearch());
        List<CompiledEdit> compiledEdits = compileEdits(edits, wholeWordSearch);

        PdfJsonDocument document = pdfJsonConversionService.convertPdfToJsonDocument(inputFile);
        Set<Integer> pageFilter = resolvePageFilter(request, document);
        int modifiedSpans = applyEdits(document, compiledEdits, pageFilter);
        log.info(
                "edit-text: modified {} text span(s) using {} edit(s) on {} page(s)",
                modifiedSpans,
                compiledEdits.size(),
                pageFilter == null
                        ? document.getPages() == null ? 0 : document.getPages().size()
                        : pageFilter.size());

        String docName = buildOutputFilename(inputFile);
        TempFile tempOut = tempFileManager.createManagedTempFile(".pdf");
        try (OutputStream os = Files.newOutputStream(tempOut.getPath())) {
            pdfJsonConversionService.convertJsonToPdf(document, os);
        } catch (Exception e) {
            tempOut.close();
            throw e;
        }
        return WebResponseUtils.pdfFileToWebResponse(tempOut, docName);
    }

    private List<CompiledEdit> compileEdits(
            List<EditTextOperation> edits, boolean wholeWordSearch) {
        return edits.stream().map(edit -> compileEdit(edit, wholeWordSearch)).toList();
    }

    private CompiledEdit compileEdit(EditTextOperation edit, boolean wholeWordSearch) {
        // Always treat the user-supplied find string as a literal: Pattern.quote escapes any
        // regex metacharacters, so the constructed pattern can only ever do a literal match
        // (optionally bounded by our own word-boundary anchors). This rules out catastrophic
        // backtracking from a malicious find string.
        String findRaw = edit.getFind();
        String replacement = Objects.toString(edit.getReplace(), "");
        String regex = Pattern.quote(findRaw);
        if (wholeWordSearch) {
            regex = "\\b(?:" + regex + ")\\b";
        }
        Pattern pattern = Pattern.compile(regex);
        String safeReplacement = Matcher.quoteReplacement(replacement);
        return new CompiledEdit(pattern, safeReplacement);
    }

    private Set<Integer> resolvePageFilter(EditTextRequest request, PdfJsonDocument document) {
        String pageNumbers = request.getPageNumbers();
        int totalPages = document.getPages() == null ? 0 : document.getPages().size();
        if (totalPages == 0) {
            return Collections.emptySet();
        }
        if (pageNumbers == null || pageNumbers.isBlank() || "all".equalsIgnoreCase(pageNumbers)) {
            return null;
        }
        List<Integer> pages = GeneralUtils.parsePageList(pageNumbers, totalPages, true);
        return new HashSet<>(pages);
    }

    private int applyEdits(
            PdfJsonDocument document, List<CompiledEdit> edits, Set<Integer> pageFilter) {
        if (document.getPages() == null) {
            return 0;
        }
        int modifiedSpans = 0;
        int pageIndex = 0;
        for (PdfJsonPage page : document.getPages()) {
            int pageNumber = page.getPageNumber() != null ? page.getPageNumber() : pageIndex + 1;
            pageIndex++;
            if (pageFilter != null && !pageFilter.contains(pageNumber)) {
                continue;
            }
            modifiedSpans += applyEditsToPage(page, edits);
        }
        return modifiedSpans;
    }

    private int applyEditsToPage(PdfJsonPage page, List<CompiledEdit> edits) {
        List<PdfJsonTextElement> elements = page.getTextElements();
        if (elements == null || elements.isEmpty()) {
            return 0;
        }
        Set<Integer> modifiedIndices = new HashSet<>();
        for (CompiledEdit edit : edits) {
            applyEditToPage(elements, edit, modifiedIndices);
        }
        for (Integer index : modifiedIndices) {
            // Char codes were captured for the original glyph sequence; clear them so the rebuild
            // re-encodes from the new text via the font.
            elements.get(index).setCharCodes(null);
        }
        return modifiedIndices.size();
    }

    /**
     * Apply a single edit across the page by matching against the concatenation of all element
     * texts, then writing the replacement back into the originating element(s).
     */
    private void applyEditToPage(
            List<PdfJsonTextElement> elements, CompiledEdit edit, Set<Integer> modifiedIndices) {
        StringBuilder joined = new StringBuilder();
        int[] starts = new int[elements.size()];
        int[] ends = new int[elements.size()];
        for (int i = 0; i < elements.size(); i++) {
            starts[i] = joined.length();
            String text = elements.get(i).getText();
            if (text != null) {
                joined.append(text);
            }
            ends[i] = joined.length();
        }

        Matcher matcher = edit.pattern().matcher(joined);
        List<MatchSpan> spans = new ArrayList<>();
        StringBuffer interpolation = new StringBuffer();
        int previousAppendPosition = 0;
        while (matcher.find()) {
            if (matcher.start() == matcher.end()) {
                // Skip zero-length matches (e.g. /a*/ on empty input) — they cannot be applied.
                continue;
            }
            int sizeBefore = interpolation.length();
            matcher.appendReplacement(interpolation, edit.replacement());
            int prefixLength = matcher.start() - previousAppendPosition;
            String actualReplacement =
                    interpolation.substring(sizeBefore + prefixLength, interpolation.length());
            spans.add(new MatchSpan(matcher.start(), matcher.end(), actualReplacement));
            previousAppendPosition = matcher.end();
        }

        // Apply right-to-left so earlier match positions stay valid as we mutate elements.
        for (int i = spans.size() - 1; i >= 0; i--) {
            MatchSpan span = spans.get(i);
            int firstElement = findElementForCharIndex(starts, ends, span.start());
            int lastElement = findElementForCharIndex(starts, ends, span.end() - 1);
            if (firstElement < 0 || lastElement < 0) {
                continue;
            }
            applyMatchToElements(
                    elements, starts, span, firstElement, lastElement, modifiedIndices);
        }
    }

    /**
     * Find the element whose text covers the character at {@code charIndex} in the joined string.
     * Returns -1 if no element covers that index (which should not happen for valid match spans).
     */
    private static int findElementForCharIndex(int[] starts, int[] ends, int charIndex) {
        for (int i = 0; i < starts.length; i++) {
            if (starts[i] <= charIndex && charIndex < ends[i]) {
                return i;
            }
        }
        return -1;
    }

    private static void applyMatchToElements(
            List<PdfJsonTextElement> elements,
            int[] starts,
            MatchSpan span,
            int firstElement,
            int lastElement,
            Set<Integer> modifiedIndices) {
        if (firstElement == lastElement) {
            PdfJsonTextElement element = elements.get(firstElement);
            String text = nullToEmpty(element.getText());
            int matchStartInElement = span.start() - starts[firstElement];
            int matchEndInElement = span.end() - starts[firstElement];
            element.setText(
                    text.substring(0, matchStartInElement)
                            + span.replacement()
                            + text.substring(matchEndInElement));
            modifiedIndices.add(firstElement);
            return;
        }

        // Cross-element match. Compute prefix/suffix once for both strategies.
        String firstText = nullToEmpty(elements.get(firstElement).getText());
        int firstSplit = span.start() - starts[firstElement];
        String firstPrefix = firstText.substring(0, firstSplit);

        String lastText = nullToEmpty(elements.get(lastElement).getText());
        int lastSplit = span.end() - starts[lastElement];
        String lastSuffix = lastText.substring(lastSplit);

        int numElements = lastElement - firstElement + 1;
        String replacement = span.replacement();
        String[] words = splitWordsForDistribution(replacement);

        // Decide between word distribution and single-element placement. When the matched text
        // has fewer words than elements (typical of character-level glyph runs in Type3 fonts),
        // distributing replacement words to the spread-out element X positions causes overlap
        // because each word is much wider than the gap between adjacent glyph positions. In
        // that case we fall back to placing the entire replacement in the first matched element.
        int matchedWordCount = countWords(joinedSubstring(elements, starts, span));
        if (words.length == 0 || matchedWordCount < numElements) {
            applyAsSingleBlock(
                    elements,
                    firstElement,
                    lastElement,
                    firstPrefix,
                    lastSuffix,
                    replacement,
                    modifiedIndices);
            return;
        }

        applyAsDistributedWords(
                elements,
                firstElement,
                numElements,
                firstPrefix,
                lastSuffix,
                words,
                modifiedIndices);
    }

    private static String joinedSubstring(
            List<PdfJsonTextElement> elements, int[] starts, MatchSpan span) {
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < elements.size(); i++) {
            String text = elements.get(i).getText();
            if (text == null || text.isEmpty()) {
                continue;
            }
            int elementStart = starts[i];
            int elementEnd = elementStart + text.length();
            int captureStart = Math.max(elementStart, span.start());
            int captureEnd = Math.min(elementEnd, span.end());
            if (captureStart < captureEnd) {
                sb.append(text, captureStart - elementStart, captureEnd - elementStart);
            }
        }
        return sb.toString();
    }

    private static int countWords(String text) {
        if (text == null || text.isEmpty()) {
            return 0;
        }
        String trimmed = text.trim();
        if (trimmed.isEmpty()) {
            return 0;
        }
        return trimmed.split("\\s+").length;
    }

    private static void applyAsSingleBlock(
            List<PdfJsonTextElement> elements,
            int firstElement,
            int lastElement,
            String firstPrefix,
            String lastSuffix,
            String replacement,
            Set<Integer> modifiedIndices) {
        elements.get(firstElement).setText(firstPrefix + replacement);
        modifiedIndices.add(firstElement);
        for (int mid = firstElement + 1; mid < lastElement; mid++) {
            elements.get(mid).setText("");
            modifiedIndices.add(mid);
        }
        elements.get(lastElement).setText(lastSuffix);
        modifiedIndices.add(lastElement);
    }

    private static void applyAsDistributedWords(
            List<PdfJsonTextElement> elements,
            int firstElement,
            int numElements,
            String firstPrefix,
            String lastSuffix,
            String[] words,
            Set<Integer> modifiedIndices) {
        int totalWords = words.length;
        int[] wordsPerSlot = computeWordsPerSlot(totalWords, numElements);
        boolean[] hasLaterWords = new boolean[numElements];
        for (int i = numElements - 2; i >= 0; i--) {
            hasLaterWords[i] = wordsPerSlot[i + 1] > 0 || hasLaterWords[i + 1];
        }

        int wordIndex = 0;
        for (int i = 0; i < numElements; i++) {
            int targetIndex = firstElement + i;
            int wordsForThisSlot = wordsPerSlot[i];

            StringBuilder sb = new StringBuilder();
            if (i == 0) {
                sb.append(firstPrefix);
            }
            for (int j = 0; j < wordsForThisSlot; j++) {
                if (j > 0) {
                    sb.append(' ');
                }
                sb.append(words[wordIndex++]);
            }
            if (wordsForThisSlot > 0 && hasLaterWords[i]) {
                sb.append(' ');
            }
            if (i == numElements - 1) {
                sb.append(lastSuffix);
            }

            elements.get(targetIndex).setText(sb.toString());
            modifiedIndices.add(targetIndex);
        }
    }

    /**
     * Decide how many words to place in each of {@code numElements} slots when distributing {@code
     * totalWords} replacement words. Aim is to keep the new text visually centered within the
     * original element bounding box, since the original layout typically reflects centering or
     * tracking on a line. When the replacement has fewer words than slots, the words are placed in
     * the central run of slots (with ties resolved toward the right). When it has more words than
     * slots, words spread evenly with overflow going to the right-most slots.
     */
    private static int[] computeWordsPerSlot(int totalWords, int numElements) {
        int[] wordsPerSlot = new int[numElements];
        if (numElements == 0 || totalWords == 0) {
            return wordsPerSlot;
        }
        int baseCount = totalWords / numElements;
        int extras = totalWords - baseCount * numElements;
        int firstExtraSlot;
        if (totalWords <= numElements) {
            // Centered placement; tie-break toward the right slot.
            firstExtraSlot = (numElements - extras + 1) / 2;
        } else {
            // Overflow: extras land in the last slots so the start of the line stays anchored.
            firstExtraSlot = numElements - extras;
        }
        for (int i = 0; i < numElements; i++) {
            wordsPerSlot[i] = baseCount;
            if (i >= firstExtraSlot && i < firstExtraSlot + extras) {
                wordsPerSlot[i]++;
            }
        }
        return wordsPerSlot;
    }

    /**
     * Split a replacement string on whitespace runs, dropping empty tokens. Returns an empty array
     * for replacements that are empty or whitespace-only — the caller treats this as "no words to
     * distribute" and uses prefix/suffix only.
     */
    private static String[] splitWordsForDistribution(String replacement) {
        if (replacement == null || replacement.isEmpty()) {
            return new String[0];
        }
        String[] parts = replacement.trim().split("\\s+");
        if (parts.length == 1 && parts[0].isEmpty()) {
            return new String[0];
        }
        return parts;
    }

    private static String nullToEmpty(String value) {
        return value != null ? value : "";
    }

    private String buildOutputFilename(MultipartFile inputFile) {
        String originalName = inputFile.getOriginalFilename();
        String baseName =
                (originalName != null && !originalName.isBlank())
                        ? FILE_EXTENSION_PATTERN
                                .matcher(Filenames.toSimpleFileName(originalName))
                                .replaceFirst("")
                        : "document";
        return baseName + "_edited.pdf";
    }

    private record CompiledEdit(Pattern pattern, String replacement) {}

    private record MatchSpan(int start, int end, String replacement) {}
}
