package stirling.software.SPDF.controller.api;

import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.interactive.form.PDAcroForm;
import org.springframework.core.io.Resource;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.multipart.MultipartFile;

import io.swagger.v3.oas.annotations.Operation;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.EqualsAndHashCode;
import lombok.NoArgsConstructor;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.config.swagger.MultiFileResponse;
import stirling.software.SPDF.model.api.SplitPdfByChaptersRequest;
import stirling.software.common.annotations.AutoJobPostMapping;
import stirling.software.common.annotations.api.GeneralApi;
import stirling.software.common.enumeration.ResourceWeight;
import stirling.software.common.model.PdfMetadata;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.service.PdfMetadataService;
import stirling.software.common.util.ExceptionUtils;
import stirling.software.common.util.FormUtils;
import stirling.software.common.util.GeneralUtils;
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;
import stirling.software.common.util.WebResponseUtils;
import stirling.software.jpdfium.PdfDocument;
import stirling.software.jpdfium.PdfSplit;

@GeneralApi
@Slf4j
@RequiredArgsConstructor
public class SplitPdfByChaptersController {

    private final PdfMetadataService pdfMetadataService;

    private final CustomPDFDocumentFactory pdfDocumentFactory;

    private final TempFileManager tempFileManager;

    private static void collectBookmarks(
            List<stirling.software.jpdfium.doc.Bookmark> source,
            List<Bookmark> out,
            int level,
            int maxLevel) {
        for (stirling.software.jpdfium.doc.Bookmark bm : source) {
            if (!bm.isInternal()) {
                continue;
            }
            String title = bm.title() == null ? "" : bm.title().replace("/", "");
            int firstPage = Math.max(0, bm.pageIndex());
            out.add(new Bookmark(title, firstPage, -2));
            if (bm.hasChildren() && level < maxLevel) {
                collectBookmarks(bm.children(), out, level + 1, maxLevel);
            }
        }
    }

    private static void assignEndPages(List<Bookmark> bookmarks, int totalPages) {
        for (int i = 0; i < bookmarks.size(); i++) {
            Bookmark current = bookmarks.get(i);
            int next = -1;
            for (int j = i + 1; j < bookmarks.size(); j++) {
                if (bookmarks.get(j).getStartPage() >= current.getStartPage()) {
                    next = bookmarks.get(j).getStartPage();
                    break;
                }
            }
            current.setEndPage(next == -1 ? totalPages : next);
        }
    }

    @AutoJobPostMapping(
            value = "/split-pdf-by-chapters",
            consumes = MediaType.MULTIPART_FORM_DATA_VALUE,
            resourceWeight = ResourceWeight.MEDIUM_WEIGHT)
    @MultiFileResponse
    @Operation(
            summary = "Split PDFs by Chapters",
            description =
                    "Splits a PDF into chapters and returns a ZIP file. Input:PDF Output:ZIP-PDF"
                            + " Type:SISO")
    public ResponseEntity<Resource> splitPdf(@ModelAttribute SplitPdfByChaptersRequest request)
            throws Exception {
        MultipartFile file = request.getFileInput();

        boolean includeMetadata = Boolean.TRUE.equals(request.getIncludeMetadata());
        Integer bookmarkLevel = request.getBookmarkLevel();
        if (bookmarkLevel < 0) {
            throw ExceptionUtils.createIllegalArgumentException(
                    "error.invalidArgument", "Invalid argument: {0}", "bookmark level");
        }

        try (TempFile sourceTempFile = new TempFile(tempFileManager, ".pdf")) {
            Files.copy(
                    file.getInputStream(),
                    sourceTempFile.getPath(),
                    StandardCopyOption.REPLACE_EXISTING);

            List<Bookmark> bookmarks = new ArrayList<>();
            int totalPages;
            try (PdfDocument sourceDocument = PdfDocument.open(sourceTempFile.getPath())) {
                totalPages = sourceDocument.pageCount();
                List<stirling.software.jpdfium.doc.Bookmark> roots = sourceDocument.bookmarks();
                if (roots == null || roots.isEmpty()) {
                    log.warn("No outline found for {}", file.getOriginalFilename());
                    throw ExceptionUtils.createIllegalArgumentException(
                            "error.pdfBookmarksNotFound",
                            "No PDF bookmarks/outline found in document");
                }
                collectBookmarks(roots, bookmarks, 0, bookmarkLevel);
                if (bookmarks.isEmpty()) {
                    log.warn("No outline found for {}", file.getOriginalFilename());
                    throw ExceptionUtils.createIllegalArgumentException(
                            "error.pdfBookmarksNotFound",
                            "No PDF bookmarks/outline found in document");
                }
                assignEndPages(bookmarks, totalPages);
            }

            boolean allowDuplicates = Boolean.TRUE.equals(request.getAllowDuplicates());
            if (!allowDuplicates) {
                bookmarks = mergeBookmarksThatCorrespondToSamePage(bookmarks);
            }
            for (Bookmark bookmark : bookmarks) {
                log.info(
                        "{}::::{} to {}",
                        bookmark.getTitle(),
                        bookmark.getStartPage(),
                        bookmark.getEndPage());
            }

            PdfMetadata metadata = null;
            boolean hasForm = false;
            if (includeMetadata) {
                try (PDDocument metaDoc = pdfDocumentFactory.load(sourceTempFile.getFile())) {
                    metadata = pdfMetadataService.extractMetadataFromPdf(metaDoc);
                    PDAcroForm acroForm = metaDoc.getDocumentCatalog().getAcroForm(null);
                    hasForm = acroForm != null;
                }
            } else {
                try (PDDocument acroDoc = pdfDocumentFactory.load(sourceTempFile.getFile(), true)) {
                    hasForm = acroDoc.getDocumentCatalog().getAcroForm(null) != null;
                }
            }

            TempFile zipTempFile =
                    createZipFile(
                            sourceTempFile.getFile(), bookmarks, metadata, totalPages, hasForm);
            String filename = GeneralUtils.generateFilename(file.getOriginalFilename(), "");
            return WebResponseUtils.zipFileToWebResponse(zipTempFile, filename + ".zip");
        }
    }

    private List<Bookmark> mergeBookmarksThatCorrespondToSamePage(List<Bookmark> bookmarks) {
        String mergedTitle = "";
        List<Bookmark> chaptersToBeRemoved = new ArrayList<>();
        for (Bookmark bookmark : bookmarks) {
            if (bookmark.getStartPage() == bookmark.getEndPage()) {
                mergedTitle = mergedTitle.concat(bookmark.getTitle().concat(" "));
                chaptersToBeRemoved.add(bookmark);
            } else {
                if (!mergedTitle.isEmpty()) {
                    if (mergedTitle.length() > 255) {
                        mergedTitle = mergedTitle.substring(0, 253) + "...";
                    }

                    bookmarks.set(
                            bookmarks.indexOf(bookmark),
                            new Bookmark(
                                    mergedTitle, bookmark.getStartPage(), bookmark.getEndPage()));
                }
                mergedTitle = "";
            }
        }
        bookmarks.removeAll(chaptersToBeRemoved);
        return bookmarks;
    }

    private TempFile createZipFile(
            File sourceFile,
            List<Bookmark> bookmarks,
            PdfMetadata metadata,
            int totalPages,
            boolean hasForm)
            throws Exception {
        String fileNumberFormatter = "%0" + (Integer.toString(bookmarks.size()).length()) + "d ";
        TempFile zipTempFile = new TempFile(tempFileManager, ".zip");
        try (ZipOutputStream zipOut =
                new ZipOutputStream(Files.newOutputStream(zipTempFile.getPath()))) {
            if (hasForm) {
                // JPDFium's FPDF_ImportPagesByIndex drops the AcroForm dictionary. For form
                // PDFs, do the per-chapter extract via PDFBox so form fields survive the split.
                for (int i = 0; i < bookmarks.size(); i++) {
                    writeChapterViaPdfBox(
                            sourceFile,
                            bookmarks.get(i),
                            i,
                            fileNumberFormatter,
                            metadata,
                            zipOut,
                            totalPages);
                }
            } else {
                try (PdfDocument sourceDocument = PdfDocument.open(sourceFile.toPath())) {
                    for (int i = 0; i < bookmarks.size(); i++) {
                        writeChapterViaJpdfium(
                                sourceDocument,
                                bookmarks.get(i),
                                i,
                                fileNumberFormatter,
                                metadata,
                                zipOut,
                                totalPages);
                    }
                }
            }
            log.info(
                    "Successfully created zip file with split documents: {}",
                    zipTempFile.getPath());
            return zipTempFile;
        } catch (Exception e) {
            zipTempFile.close();
            throw e;
        }
    }

    private void writeChapterViaJpdfium(
            PdfDocument sourceDocument,
            Bookmark bookmark,
            int index,
            String fileNumberFormatter,
            PdfMetadata metadata,
            ZipOutputStream zipOut,
            int totalPages)
            throws Exception {
        int[] range = clampRange(bookmark, totalPages);
        int from = range[0];
        int to = range[1];
        try (TempFile splitTemp = new TempFile(tempFileManager, ".pdf")) {
            try (PdfDocument splitDoc = PdfSplit.extractPageRange(sourceDocument, from, to)) {
                splitDoc.save(splitTemp.getPath());
            }
            Path finalPath = splitTemp.getPath();
            TempFile metaTemp = null;
            try {
                if (metadata != null) {
                    metaTemp = new TempFile(tempFileManager, ".pdf");
                    try (PDDocument doc = pdfDocumentFactory.load(splitTemp.getFile())) {
                        pdfMetadataService.setMetadataToPdf(doc, metadata);
                        doc.save(metaTemp.getFile());
                    }
                    finalPath = metaTemp.getPath();
                }
                writeZipEntry(zipOut, fileNumberFormatter, index, bookmark.getTitle(), finalPath);
            } finally {
                if (metaTemp != null) {
                    metaTemp.close();
                }
            }
        }
    }

    private void writeChapterViaPdfBox(
            File sourceFile,
            Bookmark bookmark,
            int index,
            String fileNumberFormatter,
            PdfMetadata metadata,
            ZipOutputStream zipOut,
            int totalPages)
            throws Exception {
        int[] range = clampRange(bookmark, totalPages);
        int from = range[0];
        int to = range[1];
        try (PDDocument doc = pdfDocumentFactory.load(sourceFile)) {
            for (int p = doc.getNumberOfPages() - 1; p >= 0; p--) {
                if (p < from || p > to) {
                    doc.removePage(p);
                }
            }
            FormUtils.pruneOrphanedFormFields(doc);
            if (metadata != null) {
                pdfMetadataService.setMetadataToPdf(doc, metadata);
            }
            String fileName =
                    String.format(Locale.ROOT, fileNumberFormatter, index)
                            + bookmark.getTitle()
                            + ".pdf";
            zipOut.putNextEntry(new ZipEntry(fileName));
            doc.save(zipOut);
            zipOut.closeEntry();
            log.debug("Wrote split document {} to zip file", fileName);
        }
    }

    private void writeZipEntry(
            ZipOutputStream zipOut,
            String fileNumberFormatter,
            int index,
            String title,
            Path pdfPath)
            throws IOException {
        String fileName = String.format(Locale.ROOT, fileNumberFormatter, index) + title + ".pdf";
        zipOut.putNextEntry(new ZipEntry(fileName));
        Files.copy(pdfPath, zipOut);
        zipOut.closeEntry();
        log.debug("Wrote split document {} to zip file", fileName);
    }

    private static int[] clampRange(Bookmark bookmark, int totalPages) {
        boolean isSinglePage = bookmark.getStartPage() == bookmark.getEndPage();
        int from = Math.min(Math.max(0, bookmark.getStartPage()), totalPages - 1);
        int rawEnd = isSinglePage ? bookmark.getEndPage() : bookmark.getEndPage() - 1;
        int to = Math.min(Math.max(from, rawEnd), totalPages - 1);
        return new int[] {from, to};
    }
}

@Data
@EqualsAndHashCode
@NoArgsConstructor
@AllArgsConstructor
class Bookmark {
    private String title;
    private int startPage;
    private int endPage;
}
