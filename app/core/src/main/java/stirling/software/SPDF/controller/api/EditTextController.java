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
 * <p>For cross-element matches the entire replacement is written into the first matched element,
 * any intermediate elements are emptied, and the suffix of the last matched element is preserved.
 * This anchors the new text at the leftmost match position and lets the font lay it out as one run,
 * which is more visually reliable than redistributing words to the original per-element X positions
 * (those positions are calibrated to the original word widths and rarely match the replacement
 * widths). Centered or tracked layouts will become left-aligned at the original first-word position
 * when their text is replaced - the trade-off is accepted in favour of avoiding glyph overlaps and
 * gaps from variable-width word distribution.
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
                            + " kerning-broken phrases). Cross-element matches are written as a"
                            + " single replacement run anchored at the leftmost matched position;"
                            + " centered or tracked text may shift left when its content changes."
                            + " Input:PDF Output:PDF Type:SISO")
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

        // Cross-element match: write the whole replacement into the first matched element, empty
        // any intermediate elements, and keep only the suffix of the last matched element. The
        // JSON->PDF rebuild concatenates per-token text, so the font lays out the replacement as
        // one continuous run anchored at the first element's X position.
        String firstText = nullToEmpty(elements.get(firstElement).getText());
        int firstSplit = span.start() - starts[firstElement];
        elements.get(firstElement).setText(firstText.substring(0, firstSplit) + span.replacement());
        modifiedIndices.add(firstElement);

        for (int mid = firstElement + 1; mid < lastElement; mid++) {
            elements.get(mid).setText("");
            modifiedIndices.add(mid);
        }

        String lastText = nullToEmpty(elements.get(lastElement).getText());
        int lastSplit = span.end() - starts[lastElement];
        elements.get(lastElement).setText(lastText.substring(lastSplit));
        modifiedIndices.add(lastElement);
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
