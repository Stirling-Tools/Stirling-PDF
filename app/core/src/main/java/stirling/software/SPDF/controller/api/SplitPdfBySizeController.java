package stirling.software.SPDF.controller.api;

import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

import org.apache.pdfbox.pdmodel.PDDocument;
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
import stirling.software.common.enumeration.ResourceWeight;
import stirling.software.common.model.tool.ToolArity;
import stirling.software.common.model.tool.ToolFormat;
import stirling.software.common.model.tool.ToolIO;
import stirling.software.common.pdf.JpdfiumTempOutputs;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.ExceptionUtils;
import stirling.software.common.util.FormUtils;
import stirling.software.common.util.GeneralUtils;
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;
import stirling.software.common.util.WebResponseUtils;
import stirling.software.jpdfium.PdfDocument;
import stirling.software.jpdfium.PdfSplit;
import stirling.software.jpdfium.model.SaveOptions;
import stirling.software.jpdfium.model.StorageOptions;

@GeneralApi
@Slf4j
@RequiredArgsConstructor
public class SplitPdfBySizeController {

    // The source document is opened from the upload and never edited, so probes may read its file.
    private static final StorageOptions UNTOUCHED_SOURCE =
            StorageOptions.builder().reuseSourceFile(true).build();

    private final CustomPDFDocumentFactory pdfDocumentFactory;
    private final TempFileManager tempFileManager;

    @AutoJobPostMapping(
            value = "/split-by-size-or-count",
            consumes = MediaType.MULTIPART_FORM_DATA_VALUE,
            resourceWeight = ResourceWeight.MEDIUM_WEIGHT)
    @MultiFileResponse
    @ToolIO(produces = ToolFormat.PDF, arity = ToolArity.SIMO)
    @Operation(
            summary = "Auto split PDF pages into separate documents based on size or count",
            description =
                    "split PDF into multiple paged documents based on size/count, ie if 20 pages"
                            + " and split into 5, it does 5 documents each 4 pages\r\n if 10MB and each page"
                            + " is 1MB and you enter 2MB then 5 docs each 2MB (rounded so that it accepts"
                            + " 1.9MB but not 2.1MB)")
    public ResponseEntity<Resource> autoSplitPdf(
            @ModelAttribute SplitPdfBySizeOrCountRequest request) throws Exception {

        if (request.getSplitType() == 1 || request.getSplitType() == 2) {
            requirePositiveCount(request.getSplitValue());
        }
        MultipartFile file = request.getFileInput();
        String filename = GeneralUtils.generateFilename(file.getOriginalFilename(), "");

        TempFile zipTempFile = new TempFile(tempFileManager, ".zip");
        try {
            try (TempFile sourceTempFile = new TempFile(tempFileManager, ".pdf");
                    ZipOutputStream zipOut =
                            new ZipOutputStream(Files.newOutputStream(zipTempFile.getPath()))) {
                Files.copy(
                        file.getInputStream(),
                        sourceTempFile.getPath(),
                        StandardCopyOption.REPLACE_EXISTING);

                boolean hasForm;
                try (PDDocument acroDoc = pdfDocumentFactory.load(sourceTempFile.getFile(), true)) {
                    hasForm = acroDoc.getDocumentCatalog().getAcroForm(null) != null;
                }

                try (PdfDocument sourceDocument = PdfDocument.open(sourceTempFile.getPath())) {
                    List<int[]> ranges =
                            computeRanges(
                                    request, sourceDocument, Files.size(sourceTempFile.getPath()));

                    int fileIndex = 1;
                    for (int[] range : ranges) {
                        if (range.length == 0) {
                            continue;
                        }
                        writeRange(
                                sourceTempFile.getFile(),
                                range,
                                zipOut,
                                filename,
                                fileIndex++,
                                hasForm);
                    }
                }
            }

            return WebResponseUtils.zipFileToWebResponse(zipTempFile, filename + ".zip");
        } catch (Exception e) {
            ExceptionUtils.logException("PDF splitting process", e);
            zipTempFile.close();
            throw e;
        }
    }

    private static int requirePositiveCount(String value) {
        try {
            int count = Integer.parseInt(value);
            if (count > 0) return count;
        } catch (NumberFormatException ignored) {
        }
        throw ExceptionUtils.createIllegalArgumentException(
                ExceptionUtils.ErrorCode.INVALID_ARGUMENT,
                "splitValue",
                "must be a positive integer for page-count or document-count splitting");
    }

    private List<int[]> computeRanges(
            SplitPdfBySizeOrCountRequest request, PdfDocument sourceDoc, long sourceBytes)
            throws IOException {
        int type = request.getSplitType();
        String value = request.getSplitValue();
        if (type == 0) {
            return computeSizeRanges(
                    sourceDoc, GeneralUtils.convertSizeToBytes(value), sourceBytes);
        } else if (type == 1) {
            return computePageCountRanges(sourceDoc, requirePositiveCount(value));
        } else if (type == 2) {
            return computeDocCountRanges(sourceDoc, requirePositiveCount(value));
        }
        throw ExceptionUtils.createIllegalArgumentException(
                "error.invalidArgument", "Invalid argument: {0}", "split type: " + type);
    }

    private void writeRange(
            File sourceFile,
            int[] range,
            ZipOutputStream zipOut,
            String baseFilename,
            int fileIndex,
            boolean hasForm)
            throws IOException {
        if (hasForm) {
            // JPDFium's FPDF_ImportPagesByIndex drops the AcroForm dictionary, breaking form
            // fields downstream. For form-bearing PDFs, do the extract via PDFBox so the
            // AcroForm survives (pruneOrphanedFormFields removes references to dropped pages).
            writeRangeViaPdfBox(sourceFile, range, zipOut, baseFilename, fileIndex);
        } else {
            try (TempFile splitTemp = new TempFile(tempFileManager, ".pdf")) {
                extractRangeToFile(sourceFile.toPath(), range, splitTemp.getPath());
                writeEntry(zipOut, baseFilename, fileIndex, splitTemp.getPath());
            }
        }
    }

    private void writeRangeViaPdfBox(
            File sourceFile,
            int[] range,
            ZipOutputStream zipOut,
            String baseFilename,
            int fileIndex)
            throws IOException {
        Set<Integer> keep = new HashSet<>();
        for (int p : range) {
            keep.add(p);
        }
        try (PDDocument doc = pdfDocumentFactory.load(sourceFile)) {
            for (int i = doc.getNumberOfPages() - 1; i >= 0; i--) {
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

    private void extractRangeToFile(Path source, int[] range, Path outputPath) throws IOException {
        PdfSplit.extractPageRangeToFile(
                source, range[0], range[range.length - 1], outputPath, JpdfiumTempOutputs.STORAGE);
    }

    private void writeEntry(
            ZipOutputStream zipOut, String baseFilename, int fileIndex, Path pdfPath)
            throws IOException {
        zipOut.putNextEntry(new ZipEntry(baseFilename + "_" + fileIndex + ".pdf"));
        Files.copy(pdfPath, zipOut);
        zipOut.closeEntry();
    }

    /** Returns contiguous page-index ranges fitting within {@code maxBytes}. */
    private List<int[]> computeSizeRanges(PdfDocument sourceDoc, long maxBytes, long sourceBytes)
            throws IOException {
        List<int[]> ranges = new ArrayList<>();
        int totalPages = sourceDoc.pageCount();
        long bytesPerPage = Math.max(1, sourceBytes / Math.max(1, totalPages));
        try (TempFile probe = new TempFile(tempFileManager, ".pdf")) {
            int start = 0;
            while (start < totalPages) {
                int end =
                        largestFittingEnd(
                                sourceDoc,
                                start,
                                totalPages - 1,
                                maxBytes,
                                bytesPerPage,
                                probe.getPath());
                ranges.add(buildRange(start, end));
                start = end + 1;
            }
        }
        return ranges;
    }

    private int largestFittingEnd(
            PdfDocument sourceDoc,
            int start,
            int lastPage,
            long maxBytes,
            long bytesPerPage,
            Path probe)
            throws IOException {
        int fits = start - 1;
        int tooBig = lastPage + 1;
        int candidate = (int) Math.min(lastPage, start + Math.max(0, maxBytes / bytesPerPage - 1));
        while (tooBig - fits > 1) {
            if (rangeSize(sourceDoc, start, candidate, probe) <= maxBytes) {
                fits = candidate;
                candidate =
                        tooBig > lastPage
                                ? Math.min(lastPage, fits + (fits - start + 1))
                                : (fits + tooBig) / 2;
            } else {
                tooBig = candidate;
                candidate = (fits + tooBig) / 2;
            }
        }
        return Math.max(fits, start);
    }

    private long rangeSize(PdfDocument sourceDoc, int from, int to, Path probe) throws IOException {
        try (PdfDocument split = PdfSplit.extractPageRange(sourceDoc, from, to, UNTOUCHED_SOURCE)) {
            split.saveTo(probe, SaveOptions.ephemeral());
        }
        return Files.size(probe);
    }

    private List<int[]> computePageCountRanges(PdfDocument sourceDoc, int pageCount) {
        if (pageCount <= 0) {
            throw ExceptionUtils.createIllegalArgumentException(
                    "error.invalidArgument", "Invalid argument: {0}", "page count: " + pageCount);
        }
        int totalPages = sourceDoc.pageCount();
        List<int[]> ranges = new ArrayList<>();
        int start = 0;
        while (start < totalPages) {
            int end = Math.min(start + pageCount - 1, totalPages - 1);
            ranges.add(buildRange(start, end));
            start = end + 1;
        }
        return ranges;
    }

    private List<int[]> computeDocCountRanges(PdfDocument sourceDoc, int documentCount) {
        if (documentCount <= 0) {
            throw ExceptionUtils.createIllegalArgumentException(
                    "error.invalidArgument",
                    "Invalid argument: {0}",
                    "document count: " + documentCount);
        }
        int totalPages = sourceDoc.pageCount();
        int pagesPerDocument = totalPages / documentCount;
        int extraPages = totalPages % documentCount;
        List<int[]> ranges = new ArrayList<>();
        int cursor = 0;
        for (int i = 0; i < documentCount; i++) {
            int pagesToAdd = pagesPerDocument + (i < extraPages ? 1 : 0);
            if (pagesToAdd == 0) {
                continue;
            }
            int end = cursor + pagesToAdd - 1;
            ranges.add(buildRange(cursor, end));
            cursor = end + 1;
        }
        return ranges;
    }

    private static int[] buildRange(int start, int end) {
        int[] range = new int[end - start + 1];
        for (int i = 0; i < range.length; i++) {
            range[i] = start + i;
        }
        return range;
    }
}
