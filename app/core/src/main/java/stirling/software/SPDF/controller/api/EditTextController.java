package stirling.software.SPDF.controller.api;

import java.io.OutputStream;
import java.nio.file.Files;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.regex.PatternSyntaxException;

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
 * <p>Matching is per-element. A find string that spans multiple text spans (which can happen for
 * phrases broken across kerning, font runs, or layout boundaries) will not match: callers should
 * keep find strings short, ideally individual words, when reliability matters.
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
                            + " Matching is per-text-span, so find strings that span multiple"
                            + " visual runs may not match (prefer short find strings)."
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

        boolean useRegex = Boolean.TRUE.equals(request.getUseRegex());
        boolean wholeWordSearch = Boolean.TRUE.equals(request.getWholeWordSearch());

        List<CompiledEdit> compiledEdits;
        try {
            compiledEdits = compileEdits(edits, useRegex, wholeWordSearch);
        } catch (PatternSyntaxException ex) {
            log.warn("Invalid regex in edit-text request: {}", ex.getMessage());
            throw ExceptionUtils.createIllegalArgumentException(
                    "error.editText.invalid.regex",
                    "Invalid regular expression in find string: {0}",
                    ex.getDescription());
        }

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
            List<EditTextOperation> edits, boolean useRegex, boolean wholeWordSearch) {
        return edits.stream().map(edit -> compileEdit(edit, useRegex, wholeWordSearch)).toList();
    }

    private CompiledEdit compileEdit(
            EditTextOperation edit, boolean useRegex, boolean wholeWordSearch) {
        String findRaw = edit.getFind();
        String replacement = Objects.toString(edit.getReplace(), "");
        String regex = useRegex ? findRaw : Pattern.quote(findRaw);
        if (wholeWordSearch) {
            regex = "\\b(?:" + regex + ")\\b";
        }
        Pattern pattern = Pattern.compile(regex);
        String safeReplacement = useRegex ? replacement : Matcher.quoteReplacement(replacement);
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
            if (page.getTextElements() == null) {
                continue;
            }
            for (PdfJsonTextElement element : page.getTextElements()) {
                String original = element.getText();
                if (original == null || original.isEmpty()) {
                    continue;
                }
                String mutated = original;
                for (CompiledEdit edit : edits) {
                    mutated = edit.pattern().matcher(mutated).replaceAll(edit.replacement());
                }
                if (!mutated.equals(original)) {
                    element.setText(mutated);
                    // Char codes were captured for the original glyph sequence; clear them so the
                    // rebuild re-encodes from the new text via the font.
                    element.setCharCodes(null);
                    modifiedSpans++;
                }
            }
        }
        return modifiedSpans;
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
}
