package stirling.software.SPDF.controller.api;

import java.io.ByteArrayOutputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.interactive.documentnavigation.outline.PDDocumentOutline;
import org.apache.pdfbox.pdmodel.interactive.documentnavigation.outline.PDOutlineItem;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import io.github.pixee.security.Filenames;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.EqualsAndHashCode;
import lombok.NoArgsConstructor;
import stirling.software.SPDF.model.PdfMetadata;
import stirling.software.SPDF.model.api.SplitPdfByChaptersRequest;
import stirling.software.SPDF.utils.PdfUtils;
import stirling.software.SPDF.utils.WebResponseUtils;

@RestController
@RequestMapping("/api/v1/general")
@Tag(name = "General", description = "General APIs")
public class SplitPdfByChaptersController {

    private static final Logger logger =
            LoggerFactory.getLogger(SplitPdfByChaptersController.class);

    @PostMapping(value = "/split-pdf-by-chapters", consumes = "multipart/form-data")
    @Operation(
            summary = "Split PDFs by Chapters",
            description = "Splits a PDF into chapters and returns a ZIP file.")
    public ResponseEntity<byte[]> splitPdf(@ModelAttribute SplitPdfByChaptersRequest request)
            throws Exception {
        MultipartFile file = request.getFileInput();
        boolean includeMetadata = request.getIncludeMetadata();
        Integer bookmarkLevel = request.getBookmarkLevel();
        PDDocument sourceDocument = Loader.loadPDF(file.getBytes());

        // check whether the document is encrypted by an empty user password
        if (sourceDocument.isEncrypted()) {
            try {
                sourceDocument.setAllSecurityToBeRemoved(true);
                logger.info("Removing security from the source document ");
            } catch (Exception e) {
                logger.warn("Cannot decrypt the pdf");
            }
        }
        PDDocumentOutline outline = sourceDocument.getDocumentCatalog().getDocumentOutline();

        if (outline == null) {
            logger.warn("No outline found for {}", file.getOriginalFilename());
            return ResponseEntity.badRequest().body("No outline found".getBytes());
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
            bookmarks.get(bookmarks.size() - 1).setEndPage(sourceDocument.getNumberOfPages());
            Bookmark lastBookmark = bookmarks.get(bookmarks.size() - 1);
            logger.info(
                    "{}::::{} to {}",
                    lastBookmark.getTitle(),
                    lastBookmark.getStartPage(),
                    lastBookmark.getEndPage());

        } catch (Exception e) {
            logger.error("Unable to extract outline items");
            return ResponseEntity.internalServerError()
                    .body("Unable to extract outline items".getBytes());
        }
        boolean allowDuplicates = request.getAllowDuplicates();
        if (!allowDuplicates) {
            bookmarks = mergeBookmarksThatCorrespondToSamePage(bookmarks);
        }
        List<ByteArrayOutputStream> splitDocumentsBoas =
                getSplitDocumentsBoas(sourceDocument, bookmarks, includeMetadata);

        Path zipFile = createZipFile(bookmarks, splitDocumentsBoas);

        byte[] data = Files.readAllBytes(zipFile);
        Files.deleteIfExists(zipFile);

        String filename =
                Filenames.toSimpleFileName(file.getOriginalFilename())
                        .replaceFirst("[.][^.]+$", "");
        sourceDocument.close();
        return WebResponseUtils.bytesToWebResponse(
                data, filename + ".zip", MediaType.APPLICATION_OCTET_STREAM);
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

    private static List<Bookmark> extractOutlineItems(
            PDDocument sourceDocument,
            PDOutlineItem current,
            List<Bookmark> bookmarks,
            PDOutlineItem nextParent,
            int level,
            int maxLevel)
            throws Exception {

        while (current != null) {
            if (level > maxLevel) {
                break;
            }
            String currentTitle = current.getTitle().replace("/", "");
            int firstPage =
                    sourceDocument.getPages().indexOf(current.findDestinationPage(sourceDocument));
            PDOutlineItem child = current.getFirstChild();
            PDOutlineItem nextSibling = current.getNextSibling();
            int endPage;
            if (child != null) {
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
            }
            if (!bookmarks.isEmpty() && bookmarks.get(bookmarks.size() - 1).getEndPage() == -2) {
                Bookmark previousBookmark = bookmarks.get(bookmarks.size() - 1);
                previousBookmark.setEndPage(firstPage);
                logger.info(
                        "{}::::{} to {}",
                        previousBookmark.getTitle(),
                        previousBookmark.getStartPage(),
                        previousBookmark.getEndPage());
            }
            bookmarks.add(new Bookmark(currentTitle, firstPage, endPage));
            if (endPage != -2) {
                logger.info("{}::::{} to {}", currentTitle, firstPage, endPage);
            }

            // Recursively process children
            if (child != null) {
                extractOutlineItems(
                        sourceDocument, child, bookmarks, nextSibling, level + 1, maxLevel);
            }

            current = nextSibling;
        }
        return bookmarks;
    }

    private Path createZipFile(
            List<Bookmark> bookmarks, List<ByteArrayOutputStream> splitDocumentsBoas)
            throws Exception {
        Path zipFile = Files.createTempFile("split_documents", ".zip");
        String fileNumberFormatter = "%0" + (Integer.toString(bookmarks.size()).length()) + "d ";
        try (ZipOutputStream zipOut = new ZipOutputStream(Files.newOutputStream(zipFile))) {
            for (int i = 0; i < splitDocumentsBoas.size(); i++) {
                String fileName =
                        String.format(fileNumberFormatter, i)
                                + bookmarks.get(i).getTitle()
                                + ".pdf";
                ByteArrayOutputStream baos = splitDocumentsBoas.get(i);
                byte[] pdf = baos.toByteArray();

                ZipEntry pdfEntry = new ZipEntry(fileName);
                zipOut.putNextEntry(pdfEntry);
                zipOut.write(pdf);
                zipOut.closeEntry();

                logger.info("Wrote split document {} to zip file", fileName);
            }
        } catch (Exception e) {
            logger.error("Failed writing to zip", e);
            throw e;
        }

        logger.info("Successfully created zip file with split documents: {}", zipFile);
        return zipFile;
    }

    public List<ByteArrayOutputStream> getSplitDocumentsBoas(
            PDDocument sourceDocument, List<Bookmark> bookmarks, boolean includeMetadata)
            throws Exception {
        List<ByteArrayOutputStream> splitDocumentsBoas = new ArrayList<>();
        PdfMetadata metadata = null;
        if (includeMetadata) {
            metadata = PdfUtils.extractMetadataFromPdf(sourceDocument);
        }
        for (Bookmark bookmark : bookmarks) {
            try (PDDocument splitDocument = new PDDocument()) {
                boolean isSinglePage = (bookmark.getStartPage() == bookmark.getEndPage());

                for (int i = bookmark.getStartPage();
                        i < bookmark.getEndPage() + (isSinglePage ? 1 : 0);
                        i++) {
                    PDPage page = sourceDocument.getPage(i);
                    splitDocument.addPage(page);
                    logger.info("Adding page {} to split document", i);
                }
                ByteArrayOutputStream baos = new ByteArrayOutputStream();
                if (includeMetadata) {
                    PdfUtils.setMetadataToPdf(splitDocument, metadata);
                }

                splitDocument.save(baos);

                splitDocumentsBoas.add(baos);
            } catch (Exception e) {
                logger.error("Failed splitting documents and saving them", e);
                throw e;
            }
        }
        return splitDocumentsBoas;
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
