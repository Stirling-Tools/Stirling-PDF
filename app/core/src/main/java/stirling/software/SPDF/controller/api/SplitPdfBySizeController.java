package stirling.software.SPDF.controller.api;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.StandardCopyOption;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.springframework.core.io.Resource;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.multipart.MultipartFile;

import io.swagger.v3.oas.annotations.Operation;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.config.swagger.MultiFileResponse;
import stirling.software.SPDF.model.api.general.SplitPdfBySizeOrCountRequest;
import stirling.software.common.annotations.AutoJobPostMapping;
import stirling.software.common.annotations.api.GeneralApi;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.ExceptionUtils;
import stirling.software.common.util.FormUtils;
import stirling.software.common.util.GeneralUtils;
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;
import stirling.software.common.util.WebResponseUtils;

@GeneralApi
@Slf4j
@RequiredArgsConstructor
public class SplitPdfBySizeController {

    private final CustomPDFDocumentFactory pdfDocumentFactory;
    private final TempFileManager tempFileManager;

    @AutoJobPostMapping(
            value = "/split-by-size-or-count",
            consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @MultiFileResponse
    @Operation(
            summary = "Auto split PDF pages into separate documents based on size or count",
            description =
                    "split PDF into multiple paged documents based on size/count, ie if 20 pages"
                            + " and split into 5, it does 5 documents each 4 pages\r\n"
                            + " if 10MB and each page is 1MB and you enter 2MB then 5 docs each 2MB"
                            + " (rounded so that it accepts 1.9MB but not 2.1MB) Input:PDF"
                            + " Output:ZIP-PDF Type:SISO")
    public ResponseEntity<Resource> autoSplitPdf(
            @ModelAttribute SplitPdfBySizeOrCountRequest request) throws Exception {

        MultipartFile file = request.getFileInput();
        String filename = GeneralUtils.generateFilename(file.getOriginalFilename(), "");

        TempFile zipTempFile = new TempFile(tempFileManager, ".zip");
        try {
            // Persist the upload once so each output can be built from its own fresh load
            // (removePage + AcroForm prune mutate the doc).
            try (TempFile sourceTempFile = new TempFile(tempFileManager, ".pdf");
                    ZipOutputStream zipOut =
                            new ZipOutputStream(Files.newOutputStream(zipTempFile.getPath()))) {
                Files.copy(
                        file.getInputStream(),
                        sourceTempFile.getPath(),
                        StandardCopyOption.REPLACE_EXISTING);

                List<List<Integer>> ranges;
                try (PDDocument sourceDocument =
                        pdfDocumentFactory.load(sourceTempFile.getFile(), true)) {
                    int type = request.getSplitType();
                    String value = request.getSplitValue();
                    if (type == 0) {
                        ranges =
                                computeSizeRanges(
                                        sourceDocument, GeneralUtils.convertSizeToBytes(value));
                    } else if (type == 1) {
                        ranges = computePageCountRanges(sourceDocument, Integer.parseInt(value));
                    } else if (type == 2) {
                        ranges = computeDocCountRanges(sourceDocument, Integer.parseInt(value));
                    } else {
                        throw ExceptionUtils.createIllegalArgumentException(
                                "error.invalidArgument",
                                "Invalid argument: {0}",
                                "split type: " + type);
                    }
                }

                int fileIndex = 1;
                for (List<Integer> range : ranges) {
                    if (range.isEmpty()) {
                        continue;
                    }
                    writeRangeToZip(sourceTempFile.getFile(), range, zipOut, filename, fileIndex++);
                }
            }

            return WebResponseUtils.zipFileToWebResponse(zipTempFile, filename + ".zip");
        } catch (Exception e) {
            ExceptionUtils.logException("PDF splitting process", e);
            zipTempFile.close();
            throw e;
        }
    }

    private void writeRangeToZip(
            File sourceFile,
            List<Integer> keepIndices,
            ZipOutputStream zipOut,
            String baseFilename,
            int fileIndex)
            throws IOException {
        Set<Integer> keep = new HashSet<>(keepIndices);
        try (PDDocument doc = pdfDocumentFactory.load(sourceFile)) {
            int pageCount = doc.getNumberOfPages();
            for (int i = pageCount - 1; i >= 0; i--) {
                if (!keep.contains(i)) {
                    doc.removePage(i);
                }
            }
            FormUtils.pruneOrphanedFormFields(doc);

            zipOut.putNextEntry(new ZipEntry(baseFilename + "_" + fileIndex + ".pdf"));
            doc.save(zipOut);
            zipOut.closeEntry();
        }
    }

    /**
     * Run the iterative size-estimation algorithm against an in-memory scratch document built from
     * shared COS page references, and return the page-index ranges each output document should
     * contain. Output is written separately by {@link #writeRangeToZip} so that AcroForm pruning
     * can be applied. AcroForm overhead is not included in the estimation, so output size may
     * slightly exceed {@code maxBytes} for documents that carry an AcroForm.
     */
    private List<List<Integer>> computeSizeRanges(PDDocument sourceDocument, long maxBytes)
            throws IOException {
        List<List<Integer>> ranges = new ArrayList<>();
        List<Integer> currentRange = new ArrayList<>();
        int totalPages = sourceDocument.getNumberOfPages();
        int baseCheckFrequency = 5;

        PDDocument scratch = new PDDocument();
        try {
            for (int pageIndex = 0; pageIndex < totalPages; pageIndex++) {
                PDPage page = sourceDocument.getPage(pageIndex);
                scratch.addPage(new PDPage(page.getCOSObject()));
                currentRange.add(pageIndex);

                int pageAdded = currentRange.size();
                boolean shouldCheckSize =
                        (pageAdded % baseCheckFrequency == 0)
                                || (pageIndex == totalPages - 1)
                                || (pageAdded >= 20);
                if (!shouldCheckSize) {
                    continue;
                }

                long actualSize;
                try (ByteArrayOutputStream out = new ByteArrayOutputStream()) {
                    scratch.save(out);
                    actualSize = out.size();
                }

                if (actualSize > maxBytes) {
                    if (scratch.getNumberOfPages() > 1) {
                        scratch.removePage(scratch.getNumberOfPages() - 1);
                        currentRange.remove(currentRange.size() - 1);
                        pageIndex--; // retry this page in the next chunk
                    }
                    ranges.add(new ArrayList<>(currentRange));
                    currentRange.clear();
                    scratch.close();
                    scratch = new PDDocument();
                } else if (pageIndex < totalPages - 1 && actualSize < maxBytes * 0.75) {
                    int extraPagesAdded =
                            lookAheadFit(scratch, sourceDocument, pageIndex, maxBytes);
                    for (int i = 0; i < extraPagesAdded; i++) {
                        int extra = pageIndex + 1 + i;
                        scratch.addPage(new PDPage(sourceDocument.getPage(extra).getCOSObject()));
                        currentRange.add(extra);
                    }
                    pageIndex += extraPagesAdded;
                }
            }

            if (!currentRange.isEmpty()) {
                ranges.add(new ArrayList<>(currentRange));
            }
        } finally {
            scratch.close();
        }
        return ranges;
    }

    /**
     * Speculatively add up to 5 upcoming pages and return how many fit under {@code maxBytes}. Used
     * after a successful size check that came in well under cap to avoid running save+measure on
     * every single page.
     */
    private int lookAheadFit(PDDocument scratch, PDDocument source, int pageIndex, long maxBytes)
            throws IOException {
        int totalPages = source.getNumberOfPages();
        int pagesToLookAhead = Math.min(5, totalPages - pageIndex - 1);
        if (pagesToLookAhead == 0) {
            return 0;
        }

        int extraPagesAdded = 0;
        try (PDDocument testDoc = new PDDocument()) {
            for (int i = 0; i < scratch.getNumberOfPages(); i++) {
                testDoc.addPage(new PDPage(scratch.getPage(i).getCOSObject()));
            }
            for (int i = 0; i < pagesToLookAhead; i++) {
                testDoc.addPage(new PDPage(source.getPage(pageIndex + 1 + i).getCOSObject()));
                long testSize;
                try (ByteArrayOutputStream out = new ByteArrayOutputStream()) {
                    testDoc.save(out);
                    testSize = out.size();
                }
                if (testSize > maxBytes) {
                    break;
                }
                extraPagesAdded++;
            }
        }
        return extraPagesAdded;
    }

    private List<List<Integer>> computePageCountRanges(PDDocument sourceDocument, int pageCount) {
        if (pageCount <= 0) {
            throw ExceptionUtils.createIllegalArgumentException(
                    "error.invalidArgument", "Invalid argument: {0}", "page count: " + pageCount);
        }
        int totalPages = sourceDocument.getNumberOfPages();
        List<List<Integer>> ranges = new ArrayList<>();
        List<Integer> current = new ArrayList<>(pageCount);
        for (int i = 0; i < totalPages; i++) {
            current.add(i);
            if (current.size() == pageCount) {
                ranges.add(current);
                current = new ArrayList<>(pageCount);
            }
        }
        if (!current.isEmpty()) {
            ranges.add(current);
        }
        return ranges;
    }

    private List<List<Integer>> computeDocCountRanges(
            PDDocument sourceDocument, int documentCount) {
        if (documentCount <= 0) {
            throw ExceptionUtils.createIllegalArgumentException(
                    "error.invalidArgument",
                    "Invalid argument: {0}",
                    "document count: " + documentCount);
        }
        int totalPages = sourceDocument.getNumberOfPages();
        int pagesPerDocument = totalPages / documentCount;
        int extraPages = totalPages % documentCount;

        List<List<Integer>> ranges = new ArrayList<>();
        int cursor = 0;
        for (int i = 0; i < documentCount; i++) {
            int pagesToAdd = pagesPerDocument + (i < extraPages ? 1 : 0);
            List<Integer> range = new ArrayList<>(pagesToAdd);
            for (int j = 0; j < pagesToAdd; j++) {
                range.add(cursor++);
            }
            ranges.add(range);
        }
        return ranges;
    }
}
