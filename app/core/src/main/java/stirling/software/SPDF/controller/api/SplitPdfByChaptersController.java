package stirling.software.SPDF.controller.api;

import java.nio.file.Files;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.interactive.documentnavigation.outline.PDDocumentOutline;
import org.apache.pdfbox.pdmodel.interactive.documentnavigation.outline.PDOutlineItem;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody;

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
import stirling.software.common.model.PdfMetadata;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.service.PdfMetadataService;
import stirling.software.common.util.ExceptionUtils;
import stirling.software.common.util.GeneralUtils;
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;
import stirling.software.common.util.WebResponseUtils;

@GeneralApi
@Slf4j
@RequiredArgsConstructor
public class SplitPdfByChaptersController {

    private final PdfMetadataService pdfMetadataService;

    private final CustomPDFDocumentFactory pdfDocumentFactory;

    private final TempFileManager tempFileManager;

    private static List<Bookmark> extractOutlineItems(
            PDDocument sourceDocument,
            PDOutlineItem current,
            List<Bookmark> bookmarks,
            PDOutlineItem nextParent,
            int level,
            int maxLevel)
            throws Exception {

        while (current != null) {

            String currentTitle = current.getTitle().replace("/", "");
            int firstPage =
                    sourceDocument.getPages().indexOf(current.findDestinationPage(sourceDocument));
            PDOutlineItem child = current.getFirstChild();
            PDOutlineItem nextSibling = current.getNextSibling();
            int endPage;
            if (child != null && level < maxLevel) {
                endPage =
                        sourceDocument
                                .getPages()
                                .indexOf(child.findDestinationPage(sourceDocument));
            } else if (nextSibling != null) {
                endPage =
                        sourceDocument
                                .getPages()
                                .indexOf(nextSibling.findDestinationPage(sourceDocument));
            } else if (nextParent != null) {

                endPage =
                        sourceDocument
                                .getPages()
                                .indexOf(nextParent.findDestinationPage(sourceDocument));
            } else {
                endPage = -2;
                /*
                happens when we have something like this:
                Outline Item 2
                    Outline Item 2.1
                        Outline Item 2.1.1
                    Outline Item 2.2
                        Outline 2.2.1
                        Outline 2.2.2 <--- this item neither has an immediate next parent nor an immediate next sibling
                Outline Item 3
                 */
            }
            if (!bookmarks.isEmpty()
                    && bookmarks.get(bookmarks.size() - 1).getEndPage() == -2
                    && firstPage
                            >= bookmarks
                                    .get(bookmarks.size() - 1)
                                    .getStartPage()) { // for handling the above-mentioned case
                Bookmark previousBookmark = bookmarks.get(bookmarks.size() - 1);
                previousBookmark.setEndPage(firstPage);
            }
            bookmarks.add(new Bookmark(currentTitle, firstPage, endPage));

            // Recursively process children
            if (child != null && level < maxLevel) {
                extractOutlineItems(
                        sourceDocument, child, bookmarks, nextSibling, level + 1, maxLevel);
            }

            current = nextSibling;
        }
        return bookmarks;
    }

    @AutoJobPostMapping(
            value = "/split-pdf-by-chapters",
            consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @MultiFileResponse
    @Operation(
            summary = "Split PDFs by Chapters",
            description = "Splits a PDF into chapters and returns a ZIP file.")
    public ResponseEntity<StreamingResponseBody> splitPdf(
            @ModelAttribute SplitPdfByChaptersRequest request) throws Exception {
        MultipartFile file = request.getFileInput();

        boolean includeMetadata = Boolean.TRUE.equals(request.getIncludeMetadata());
        Integer bookmarkLevel =
                request.getBookmarkLevel(); // levels start from 0 (top most bookmarks)
        if (bookmarkLevel < 0) {
            throw ExceptionUtils.createIllegalArgumentException(
                    "error.invalidArgument", "Invalid argument: {0}", "bookmark level");
        }

        try (PDDocument sourceDocument = pdfDocumentFactory.load(file)) {
            PDDocumentOutline outline = sourceDocument.getDocumentCatalog().getDocumentOutline();

            if (outline == null) {
                log.warn("No outline found for {}", file.getOriginalFilename());
                throw ExceptionUtils.createIllegalArgumentException(
                        "error.pdfBookmarksNotFound", "No PDF bookmarks/outline found in document");
            }
            List<Bookmark> bookmarks = new ArrayList<>();
            try {
                bookmarks =
                        extractOutlineItems(
                                sourceDocument,
                                outline.getFirstChild(),
                                bookmarks,
                                outline.getFirstChild().getNextSibling(),
                                0,
                                bookmarkLevel);
                // to handle last page edge case
                bookmarks.get(bookmarks.size() - 1).setEndPage(sourceDocument.getNumberOfPages());

            } catch (Exception e) {
                ExceptionUtils.logException("outline extraction", e);
                throw e;
            }

            boolean allowDuplicates = Boolean.TRUE.equals(request.getAllowDuplicates());
            if (!allowDuplicates) {
                /*
                duplicates are generated when multiple bookmarks correspond to the same page,
                if the user doesn't want duplicates mergeBookmarksThatCorrespondToSamePage() method will merge the titles of all
                the bookmarks that correspond to the same page, and treat them as a single bookmark
                */
                bookmarks = mergeBookmarksThatCorrespondToSamePage(bookmarks);
            }
            for (Bookmark bookmark : bookmarks) {
                log.info(
                        "{}::::{} to {}",
                        bookmark.getTitle(),
                        bookmark.getStartPage(),
                        bookmark.getEndPage());
            }

            TempFile zipTempFile = createZipFile(sourceDocument, bookmarks, includeMetadata);
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
            PDDocument sourceDocument, List<Bookmark> bookmarks, boolean includeMetadata)
            throws Exception {
        PdfMetadata metadata =
                includeMetadata ? pdfMetadataService.extractMetadataFromPdf(sourceDocument) : null;
        String fileNumberFormatter = "%0" + (Integer.toString(bookmarks.size()).length()) + "d ";
        TempFile zipTempFile = new TempFile(tempFileManager, ".zip");
        try {
            try (ZipOutputStream zipOut =
                    new ZipOutputStream(Files.newOutputStream(zipTempFile.getPath()))) {
                for (int i = 0; i < bookmarks.size(); i++) {
                    Bookmark bookmark = bookmarks.get(i);
                    try (PDDocument splitDocument = new PDDocument()) {
                        boolean isSinglePage = (bookmark.getStartPage() == bookmark.getEndPage());

                        for (int pg = bookmark.getStartPage();
                                pg < bookmark.getEndPage() + (isSinglePage ? 1 : 0);
                                pg++) {
                            PDPage page = sourceDocument.getPage(pg);
                            splitDocument.addPage(page);
                            log.debug("Adding page {} to split document", pg);
                        }
                        if (includeMetadata) {
                            pdfMetadataService.setMetadataToPdf(splitDocument, metadata);
                        }

                        // split files will be named as "[FILE_NUMBER] [BOOKMARK_TITLE].pdf"
                        String fileName =
                                String.format(Locale.ROOT, fileNumberFormatter, i)
                                        + bookmark.getTitle()
                                        + ".pdf";
                        zipOut.putNextEntry(new ZipEntry(fileName));
                        splitDocument.save(zipOut);
                        zipOut.closeEntry();
                        log.debug("Wrote split document {} to zip file", fileName);
                    } catch (Exception e) {
                        ExceptionUtils.logException("document splitting and saving", e);
                        throw e;
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
