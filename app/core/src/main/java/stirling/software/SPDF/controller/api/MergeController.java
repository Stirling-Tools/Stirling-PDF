package stirling.software.SPDF.controller.api;

import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.List;
import java.util.regex.Pattern;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDDocumentCatalog;
import org.apache.pdfbox.pdmodel.PDDocumentInformation;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.common.PDMetadata;
import org.apache.pdfbox.pdmodel.interactive.documentnavigation.outline.PDDocumentOutline;
import org.apache.pdfbox.pdmodel.interactive.documentnavigation.outline.PDOutlineItem;
import org.apache.pdfbox.pdmodel.interactive.form.PDAcroForm;
import org.apache.pdfbox.pdmodel.interactive.form.PDField;
import org.apache.pdfbox.pdmodel.interactive.form.PDSignatureField;
import org.apache.xmpbox.XMPMetadata;
import org.apache.xmpbox.schema.XMPBasicSchema;
import org.apache.xmpbox.xml.DomXmpParser;
import org.springframework.core.io.Resource;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.multipart.MultipartFile;

import io.swagger.v3.oas.annotations.Operation;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.config.swagger.StandardPdfResponse;
import stirling.software.SPDF.model.api.general.MergePdfsRequest;
import stirling.software.common.annotations.AutoJobPostMapping;
import stirling.software.common.annotations.api.GeneralApi;
import stirling.software.common.enumeration.ResourceWeight;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.ExceptionUtils;
import stirling.software.common.util.GeneralUtils;
import stirling.software.common.util.PdfErrorUtils;
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;
import stirling.software.common.util.WebResponseUtils;
import stirling.software.jpdfium.PdfDocument;
import stirling.software.jpdfium.PdfMerge;
import stirling.software.jpdfium.doc.Bookmark;
import stirling.software.jpdfium.doc.PdfBookmarkEditor;
import stirling.software.jpdfium.doc.PdfBookmarkEditor.BookmarkTree;

@GeneralApi
@Slf4j
@RequiredArgsConstructor
public class MergeController {

    private static final Pattern QUOTE_WRAP_PATTERN = Pattern.compile("^\"|\"$");
    private final CustomPDFDocumentFactory pdfDocumentFactory;
    private final TempFileManager tempFileManager;

    public PDDocument mergeDocuments(List<PDDocument> documents) throws IOException {
        PDDocument mergedDoc = pdfDocumentFactory.createNewDocument();
        boolean success = false;
        try {
            for (PDDocument doc : documents) {
                for (PDPage page : doc.getPages()) {
                    mergedDoc.addPage(page);
                }
            }
            success = true;
            return mergedDoc;
        } finally {
            if (!success) {
                mergedDoc.close();
            }
        }
    }

    private static MultipartFile[] reorderFilesByProvidedOrder(
            MultipartFile[] files, String fileOrder) {
        String[] desired =
                stirling.software.common.util.RegexPatternUtils.getInstance()
                        .getNewlineSplitPattern()
                        .split(fileOrder);

        List<MultipartFile> remaining = new ArrayList<>(Arrays.asList(files));
        List<MultipartFile> ordered = new ArrayList<>(files.length);

        for (String name : desired) {
            name = name.trim();
            if (name.isEmpty()) {
                log.debug("Skipping empty entry");
                continue;
            }
            int idx = indexOfByOriginalFilename(remaining, name);
            if (idx >= 0) {
                ordered.add(remaining.remove(idx));
            } else {
                log.debug("Filename from order list not found in uploaded files: {}", name);
            }
        }

        ordered.addAll(remaining);
        return ordered.toArray(new MultipartFile[0]);
    }

    private Comparator<MultipartFile> getSortComparator(String sortType) {
        return switch (sortType) {
            case "byFileName" ->
                    Comparator.comparing(
                            (MultipartFile mf) -> {
                                String name = mf.getOriginalFilename();
                                return name == null ? "" : name;
                            },
                            String.CASE_INSENSITIVE_ORDER);
            case "byDateModified" ->
                    (file1, file2) -> {
                        long t1 = getPdfDateTimeSafe(file1);
                        long t2 = getPdfDateTimeSafe(file2);
                        return Long.compare(t2, t1);
                    };
            case "byDateCreated" ->
                    (file1, file2) -> {
                        long t1 = getPdfDateTimeSafe(file1);
                        long t2 = getPdfDateTimeSafe(file2);
                        return Long.compare(t2, t1);
                    };
            case "byPDFTitle" ->
                    (file1, file2) -> {
                        try (PDDocument doc1 = pdfDocumentFactory.load(file1);
                                PDDocument doc2 = pdfDocumentFactory.load(file2)) {
                            String title1 =
                                    doc1.getDocumentInformation() != null
                                            ? doc1.getDocumentInformation().getTitle()
                                            : null;
                            String title2 =
                                    doc2.getDocumentInformation() != null
                                            ? doc2.getDocumentInformation().getTitle()
                                            : null;
                            if (title1 == null && title2 == null) {
                                return 0;
                            }
                            if (title1 == null) {
                                return 1;
                            }
                            if (title2 == null) {
                                return -1;
                            }
                            return title1.compareToIgnoreCase(title2);
                        } catch (IOException e) {
                            return 0;
                        }
                    };
            case "orderProvided" -> (file1, file2) -> 0;
            default -> (file1, file2) -> 0;
        };
    }

    private String[] parseClientFileIds(String clientFileIds) {
        if (clientFileIds == null || clientFileIds.trim().isEmpty()) {
            return new String[0];
        }
        try {
            String trimmed = clientFileIds.trim();
            if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
                String inside = trimmed.substring(1, trimmed.length() - 1).trim();
                if (inside.isEmpty()) {
                    return new String[0];
                }
                String[] parts = inside.split(",");
                String[] result = new String[parts.length];
                for (int i = 0; i < parts.length; i++) {
                    result[i] = QUOTE_WRAP_PATTERN.matcher(parts[i].trim()).replaceAll("");
                }
                return result;
            }
        } catch (Exception e) {
            log.warn("Failed to parse client file IDs: {}", clientFileIds, e);
        }
        return new String[0];
    }

    private void addTableOfContents(PDDocument mergedDocument, MultipartFile[] files) {
        PDDocumentOutline outline = new PDDocumentOutline();
        mergedDocument.getDocumentCatalog().setDocumentOutline(outline);

        int pageIndex = 0;
        for (MultipartFile file : files) {
            String filename = file.getOriginalFilename();
            String title = GeneralUtils.removeExtension(filename);

            PDOutlineItem item = new PDOutlineItem();
            item.setTitle(title);

            if (pageIndex < mergedDocument.getNumberOfPages()) {
                PDPage page = mergedDocument.getPage(pageIndex);
                item.setDestination(page);
            }
            outline.addLast(item);

            try (PDDocument doc = pdfDocumentFactory.load(file)) {
                pageIndex += doc.getNumberOfPages();
            } catch (IOException e) {
                ExceptionUtils.logException("document loading for TOC generation", e);
                pageIndex++;
            }
        }
    }

    private long getPdfDateTimeSafe(MultipartFile file) {
        try {
            try (PDDocument doc = pdfDocumentFactory.load(file)) {
                PDDocumentInformation info = doc.getDocumentInformation();
                if (info != null) {
                    if (info.getModificationDate() != null) {
                        return info.getModificationDate().getTimeInMillis();
                    }
                    if (info.getCreationDate() != null) {
                        return info.getCreationDate().getTimeInMillis();
                    }
                }

                PDMetadata metadata = doc.getDocumentCatalog().getMetadata();
                if (metadata != null) {
                    try (InputStream is = metadata.createInputStream()) {
                        DomXmpParser parser = new DomXmpParser();
                        XMPMetadata xmp = parser.parse(is);
                        XMPBasicSchema basic = xmp.getXMPBasicSchema();
                        if (basic != null) {
                            if (basic.getModifyDate() != null) {
                                return basic.getModifyDate().getTimeInMillis();
                            }
                            if (basic.getCreateDate() != null) {
                                return basic.getCreateDate().getTimeInMillis();
                            }
                        }
                    } catch (Exception e) {
                        log.debug(
                                "Unable to read XMP metadata dates from uploaded file: {}",
                                e.getMessage());
                    }
                }
            }
        } catch (IOException e) {
            log.debug("Unable to read PDF dates from uploaded file: {}", e.getMessage());
        }
        return 0L;
    }

    private static int indexOfByOriginalFilename(List<MultipartFile> list, String name) {
        for (int i = 0; i < list.size(); i++) {
            MultipartFile f = list.get(i);
            if (name.equals(f.getOriginalFilename())) return i;
        }
        return -1;
    }

    @AutoJobPostMapping(
            consumes = MediaType.MULTIPART_FORM_DATA_VALUE,
            value = "/merge-pdfs",
            resourceWeight = ResourceWeight.MEDIUM_WEIGHT)
    @StandardPdfResponse
    @Operation(
            summary = "Merge multiple PDF files into one",
            description =
                    "This endpoint merges multiple PDF files into a single PDF file. The merged"
                            + " file will contain all pages from the input files in the order they were"
                            + " provided. Input:PDF Output:PDF Type:MISO")
    public ResponseEntity<Resource> mergePdfs(
            @ModelAttribute MergePdfsRequest request,
            @RequestParam(value = "fileOrder", required = false) String fileOrder)
            throws IOException {
        List<File> filesToDelete = new ArrayList<>();
        TempFile outputTempFile = null;

        boolean removeCertSign = Boolean.TRUE.equals(request.getRemoveCertSign());
        boolean generateToc = request.isGenerateToc();

        MultipartFile[] files = request.getFileInput();
        if (files == null) {
            files = new MultipartFile[0];
        }

        if (fileOrder != null && !fileOrder.isBlank()) {
            log.info("Reordering files based on fileOrder parameter");
            files = reorderFilesByProvidedOrder(files, fileOrder);
        } else {
            log.info("Sorting files based on sortType: {}", request.getSortType());
            Arrays.sort(files, getSortComparator(request.getSortType()));
        }

        try (TempFile mt = new TempFile(tempFileManager, ".pdf")) {

            List<Path> inputPaths = new ArrayList<>(files.length);
            List<Integer> invalidIndexes = new ArrayList<>();
            for (int index = 0; index < files.length; index++) {
                MultipartFile multipartFile = files[index];
                File tempFile = tempFileManager.convertMultipartFileToFile(multipartFile);
                filesToDelete.add(tempFile);
                inputPaths.add(tempFile.toPath());

                try (PdfDocument ignored = PdfDocument.open(tempFile.toPath())) {
                } catch (Exception e) {
                    ExceptionUtils.logException("PDF pre-validate", e);
                    invalidIndexes.add(index);
                }
            }

            int[] pageCounts;
            try {
                pageCounts =
                        mergeWithJpdfium(inputPaths, files, generateToc, mt.getFile().toPath());
            } catch (IOException e) {
                ExceptionUtils.logException("PDF merge", e);
                if (PdfErrorUtils.isCorruptedPdfError(e)) {
                    throw ExceptionUtils.createMultiplePdfCorruptedException(e);
                }
                throw e;
            }

            boolean sigFlattenNeeded = false;
            if (removeCertSign) {
                try (PdfDocument check = PdfDocument.open(mt.getFile().toPath())) {
                    sigFlattenNeeded = !check.signatures().isEmpty();
                } catch (Exception e) {
                    log.debug(
                            "JPDFium signature pre-check failed; falling back to PDFBox flatten:"
                                    + " {}",
                            e.getMessage());
                    sigFlattenNeeded = true;
                }
                if (!sigFlattenNeeded) {
                    log.info(
                            "removeCertSign requested but merged document has no signature"
                                    + " fields; skipping PDFBox flatten pass");
                }
            }

            if (sigFlattenNeeded) {
                try (PDDocument mergedDocument = pdfDocumentFactory.load(mt.getFile())) {
                    PDDocumentCatalog catalog = mergedDocument.getDocumentCatalog();
                    PDAcroForm acroForm = catalog.getAcroForm();
                    if (acroForm != null) {
                        List<PDField> fieldsToRemove =
                                acroForm.getFields().stream()
                                        .filter(PDSignatureField.class::isInstance)
                                        .toList();
                        if (!fieldsToRemove.isEmpty()) {
                            acroForm.flatten(fieldsToRemove, false);
                        }
                    }
                    outputTempFile = new TempFile(tempFileManager, ".pdf");
                    try {
                        mergedDocument.save(outputTempFile.getFile());
                    } catch (Exception e) {
                        outputTempFile.close();
                        outputTempFile = null;
                        throw e;
                    }
                }
            } else {
                outputTempFile = new TempFile(tempFileManager, ".pdf");
                try {
                    Files.copy(
                            mt.getFile().toPath(),
                            outputTempFile.getFile().toPath(),
                            java.nio.file.StandardCopyOption.REPLACE_EXISTING);
                } catch (Exception e) {
                    outputTempFile.close();
                    outputTempFile = null;
                    throw e;
                }
            }
        } catch (Exception ex) {
            if (outputTempFile != null) {
                outputTempFile.close();
            }
            if (ex instanceof IOException && PdfErrorUtils.isCorruptedPdfError((IOException) ex)) {
                log.warn("Corrupted PDF detected in merge pdf process: {}", ex.getMessage());
            } else {
                log.error("Error in merge pdf process", ex);
            }
            throw ex;
        } finally {
            for (File file : filesToDelete) {
                tempFileManager.deleteTempFile(file);
            }
        }

        String firstFilename = files.length > 0 ? files[0].getOriginalFilename() : null;
        String mergedFileName =
                GeneralUtils.generateFilename(firstFilename, "_merged_unsigned.pdf");

        return WebResponseUtils.pdfFileToWebResponse(outputTempFile, mergedFileName);
    }

    private int[] mergeWithJpdfium(
            List<Path> inputPaths, MultipartFile[] files, boolean generateToc, Path outputPath)
            throws IOException {
        if (inputPaths.isEmpty()) {
            try (PdfDocument empty = PdfDocument.open(new byte[0])) {
                empty.save(outputPath);
            } catch (Exception ignored) {
                Files.write(outputPath, new byte[0]);
            }
            return new int[0];
        }

        List<PdfDocument> docs = new ArrayList<>(inputPaths.size());
        int[] pageCounts = new int[inputPaths.size()];
        int[] pageOffsets = new int[inputPaths.size()];
        List<List<Bookmark>> sourceBookmarks = new ArrayList<>(inputPaths.size());
        int runningOffset = 0;
        try {
            for (int i = 0; i < inputPaths.size(); i++) {
                Path p = inputPaths.get(i);
                PdfDocument doc = PdfDocument.open(p);
                docs.add(doc);
                pageCounts[i] = doc.pageCount();
                pageOffsets[i] = runningOffset;
                sourceBookmarks.add(doc.bookmarks());
                runningOffset += pageCounts[i];
            }

            BookmarkTree combinedTree =
                    buildCombinedBookmarkTree(files, pageOffsets, sourceBookmarks, generateToc);

            try (PdfDocument merged = PdfMerge.merge(docs)) {
                if (combinedTree.entries().isEmpty()) {
                    merged.save(outputPath);
                } else {
                    PdfBookmarkEditor.setBookmarks(merged, combinedTree, outputPath);
                }
            }
        } catch (RuntimeException e) {
            throw new IOException("JPDFium merge failed", e);
        } finally {
            for (PdfDocument doc : docs) {
                try {
                    doc.close();
                } catch (Exception ignored) {
                }
            }
        }
        return pageCounts;
    }

    private BookmarkTree buildCombinedBookmarkTree(
            MultipartFile[] files,
            int[] pageOffsets,
            List<List<Bookmark>> sourceBookmarks,
            boolean generateToc) {
        BookmarkTree.Builder builder = BookmarkTree.builder();

        if (generateToc) {
            for (int i = 0; i < files.length; i++) {
                String filename = files[i].getOriginalFilename();
                String title = GeneralUtils.removeExtension(filename);
                if (title == null || title.isBlank()) {
                    title = "Document " + (i + 1);
                }
                builder.add(title, pageOffsets[i]);
            }
        }

        for (int i = 0; i < sourceBookmarks.size(); i++) {
            int offset = pageOffsets[i];
            for (Bookmark bm : sourceBookmarks.get(i)) {
                addBookmarkFlat(builder, bm, offset);
            }
        }

        return builder.build();
    }

    private void addBookmarkFlat(BookmarkTree.Builder builder, Bookmark root, int offset) {
        final int maxNodes = 100_000;
        java.util.Deque<Bookmark> stack = new java.util.ArrayDeque<>();
        java.util.Set<Bookmark> visited =
                java.util.Collections.newSetFromMap(new java.util.IdentityHashMap<>());
        stack.push(root);
        int processed = 0;
        while (!stack.isEmpty() && processed < maxNodes) {
            Bookmark bm = stack.pop();
            if (!visited.add(bm)) {
                continue;
            }
            processed++;
            if (bm.isInternal() && bm.title() != null) {
                builder.add(bm.title(), offset + bm.pageIndex());
            }
            if (bm.hasChildren()) {
                List<Bookmark> children = bm.children();
                for (int i = children.size() - 1; i >= 0; i--) {
                    stack.push(children.get(i));
                }
            }
        }
        if (processed >= maxNodes) {
            log.warn(
                    "Source bookmark traversal hit {}-node cap; remaining bookmarks dropped",
                    maxNodes);
        }
    }
}
