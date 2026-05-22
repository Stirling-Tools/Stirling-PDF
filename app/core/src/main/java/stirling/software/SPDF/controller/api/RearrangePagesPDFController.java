package stirling.software.SPDF.controller.api;

import java.io.File;
import java.io.IOException;
import java.lang.foreign.MemorySegment;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Locale;

import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDDocumentCatalog;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.interactive.form.PDAcroForm;
import org.springframework.core.io.Resource;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.multipart.MultipartFile;

import io.swagger.v3.oas.annotations.Operation;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.config.swagger.StandardPdfResponse;
import stirling.software.SPDF.model.SortTypes;
import stirling.software.SPDF.model.api.PDFWithPageNums;
import stirling.software.SPDF.model.api.general.RearrangePagesRequest;
import stirling.software.common.annotations.AutoJobPostMapping;
import stirling.software.common.annotations.api.GeneralApi;
import stirling.software.common.enumeration.ResourceWeight;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.ExceptionUtils;
import stirling.software.common.util.FormUtils;
import stirling.software.common.util.GeneralUtils;
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;
import stirling.software.common.util.WebResponseUtils;
import stirling.software.jpdfium.PdfDocument;
import stirling.software.jpdfium.doc.PdfPageEditor;
import stirling.software.jpdfium.doc.PdfPageImporter;

@GeneralApi
@Slf4j
@RequiredArgsConstructor
public class RearrangePagesPDFController {

    private final CustomPDFDocumentFactory pdfDocumentFactory;
    private final TempFileManager tempFileManager;

    @AutoJobPostMapping(
            consumes = MediaType.MULTIPART_FORM_DATA_VALUE,
            value = "/remove-pages",
            resourceWeight = ResourceWeight.SMALL_WEIGHT)
    @StandardPdfResponse
    @Operation(
            summary = "Remove pages from a PDF file",
            description =
                    "This endpoint removes specified pages from a given PDF file. Users can provide"
                            + " a comma-separated list of page numbers or ranges to delete. Input:PDF"
                            + " Output:PDF Type:SISO")
    public ResponseEntity<Resource> deletePages(@ModelAttribute PDFWithPageNums request)
            throws IOException {

        MultipartFile pdfFile = request.getFileInput();
        String pagesToDelete = request.getPageNumbers();

        File source = tempFileManager.convertMultipartFileToFile(pdfFile);
        try {
            if (detectAcroForm(source)) {
                return deletePagesWithPdfBox(pdfFile, pagesToDelete);
            }
            return deletePagesWithJpdfium(pdfFile, source, pagesToDelete);
        } finally {
            tempFileManager.deleteTempFile(source);
        }
    }

    private ResponseEntity<Resource> deletePagesWithPdfBox(
            MultipartFile pdfFile, String pagesToDelete) throws IOException {
        try (PDDocument document = pdfDocumentFactory.load(pdfFile)) {
            String[] pageOrderArr = pagesToDelete.split(",");
            List<Integer> pagesToRemove =
                    GeneralUtils.parsePageList(pageOrderArr, document.getNumberOfPages(), false);
            Collections.sort(pagesToRemove);
            for (int i = pagesToRemove.size() - 1; i >= 0; i--) {
                document.removePage(pagesToRemove.get(i));
            }
            FormUtils.pruneOrphanedFormFields(document);
            return WebResponseUtils.pdfDocToWebResponse(
                    document,
                    GeneralUtils.generateFilename(
                            pdfFile.getOriginalFilename(), "_removed_pages.pdf"),
                    tempFileManager);
        }
    }

    private ResponseEntity<Resource> deletePagesWithJpdfium(
            MultipartFile pdfFile, File source, String pagesToDelete) throws IOException {
        TempFile outputTempFile = new TempFile(tempFileManager, ".pdf");
        try {
            Path src = source.toPath();
            Path out = outputTempFile.getFile().toPath();
            try (PdfDocument doc = PdfDocument.open(src)) {
                int total = doc.pageCount();
                String[] pageOrderArr = pagesToDelete.split(",");
                List<Integer> pagesToRemove =
                        GeneralUtils.parsePageList(pageOrderArr, total, false);
                Collections.sort(pagesToRemove);
                MemorySegment rawDoc = doc.rawHandle();
                for (int i = pagesToRemove.size() - 1; i >= 0; i--) {
                    int idx = pagesToRemove.get(i);
                    if (idx >= 0 && idx < doc.pageCount()) {
                        PdfPageEditor.deletePage(rawDoc, idx);
                    }
                }
                doc.save(out);
            } catch (RuntimeException e) {
                throw new IOException("JPDFium remove-pages failed", e);
            }
            return WebResponseUtils.pdfFileToWebResponse(
                    outputTempFile,
                    GeneralUtils.generateFilename(
                            pdfFile.getOriginalFilename(), "_removed_pages.pdf"));
        } catch (Exception e) {
            outputTempFile.close();
            throw e;
        }
    }

    private List<Integer> removeFirst(int totalPages) {
        if (totalPages <= 1) return new ArrayList<>();
        List<Integer> newPageOrder = new ArrayList<>();
        for (int i = 2; i <= totalPages; i++) {
            newPageOrder.add(i - 1);
        }
        return newPageOrder;
    }

    private List<Integer> removeLast(int totalPages) {
        if (totalPages <= 1) return new ArrayList<>();
        List<Integer> newPageOrder = new ArrayList<>();
        for (int i = 1; i < totalPages; i++) {
            newPageOrder.add(i - 1);
        }
        return newPageOrder;
    }

    private List<Integer> removeFirstAndLast(int totalPages) {
        if (totalPages <= 2) return new ArrayList<>();
        List<Integer> newPageOrder = new ArrayList<>();
        for (int i = 2; i < totalPages; i++) {
            newPageOrder.add(i - 1);
        }
        return newPageOrder;
    }

    private List<Integer> reverseOrder(int totalPages) {
        List<Integer> newPageOrder = new ArrayList<>();
        for (int i = totalPages; i >= 1; i--) {
            newPageOrder.add(i - 1);
        }
        return newPageOrder;
    }

    private List<Integer> duplexSort(int totalPages) {
        List<Integer> newPageOrder = new ArrayList<>();
        int half = (totalPages + 1) / 2;
        for (int i = 1; i <= half; i++) {
            newPageOrder.add(i - 1);
            if (i <= totalPages - half) {
                newPageOrder.add(totalPages - i);
            }
        }
        return newPageOrder;
    }

    private List<Integer> bookletSort(int totalPages) {
        List<Integer> newPageOrder = new ArrayList<>();
        for (int i = 0; i < totalPages / 2; i++) {
            newPageOrder.add(i);
            newPageOrder.add(totalPages - i - 1);
        }
        return newPageOrder;
    }

    private List<Integer> sideStitchBooklet(int totalPages) {
        List<Integer> newPageOrder = new ArrayList<>();
        for (int i = 0; i < (totalPages + 3) / 4; i++) {
            int begin = i * 4;
            newPageOrder.add(Math.min(begin + 3, totalPages - 1));
            newPageOrder.add(Math.min(begin, totalPages - 1));
            newPageOrder.add(Math.min(begin + 1, totalPages - 1));
            newPageOrder.add(Math.min(begin + 2, totalPages - 1));
        }
        return newPageOrder;
    }

    private List<Integer> oddEvenSplit(int totalPages) {
        List<Integer> newPageOrder = new ArrayList<>();
        for (int i = 1; i <= totalPages; i += 2) {
            newPageOrder.add(i - 1);
        }
        for (int i = 2; i <= totalPages; i += 2) {
            newPageOrder.add(i - 1);
        }
        return newPageOrder;
    }

    private List<Integer> duplicate(int totalPages, String pageOrder) {
        List<Integer> newPageOrder = new ArrayList<>();
        int duplicateCount;
        try {
            duplicateCount =
                    pageOrder != null && !pageOrder.isEmpty()
                            ? Integer.parseInt(pageOrder.trim())
                            : 2;
        } catch (NumberFormatException e) {
            log.error("Invalid duplicate count specified", e);
            duplicateCount = 2;
        }
        if (duplicateCount < 1) {
            duplicateCount = 2;
        }
        int maxDuplicateCount = Math.max(100, totalPages * 3);
        if (duplicateCount > maxDuplicateCount) {
            throw ExceptionUtils.createIllegalArgumentException(
                    "error.invalidFormat",
                    "Invalid {0} format: {1}",
                    "duplicateCount",
                    "must not exceed " + maxDuplicateCount);
        }
        for (int pageNum = 0; pageNum < totalPages; pageNum++) {
            for (int dupCount = 0; dupCount < duplicateCount; dupCount++) {
                newPageOrder.add(pageNum);
            }
        }
        return newPageOrder;
    }

    private List<Integer> processSortTypes(String sortTypes, int totalPages, String pageOrder) {
        try {
            SortTypes mode = SortTypes.valueOf(sortTypes.toUpperCase(Locale.ROOT));
            return switch (mode) {
                case REVERSE_ORDER -> reverseOrder(totalPages);
                case DUPLEX_SORT -> duplexSort(totalPages);
                case BOOKLET_SORT -> bookletSort(totalPages);
                case SIDE_STITCH_BOOKLET_SORT -> sideStitchBooklet(totalPages);
                case ODD_EVEN_SPLIT -> oddEvenSplit(totalPages);
                case REMOVE_FIRST -> removeFirst(totalPages);
                case REMOVE_LAST -> removeLast(totalPages);
                case REMOVE_FIRST_AND_LAST -> removeFirstAndLast(totalPages);
                case DUPLICATE -> duplicate(totalPages, pageOrder);
                default ->
                        throw ExceptionUtils.createIllegalArgumentException(
                                "error.invalidFormat",
                                "Invalid {0} format: {1}",
                                "custom mode",
                                "unsupported");
            };
        } catch (IllegalArgumentException e) {
            log.error("Unsupported custom mode", e);
            return null;
        }
    }

    @AutoJobPostMapping(
            consumes = MediaType.MULTIPART_FORM_DATA_VALUE,
            value = "/rearrange-pages",
            resourceWeight = ResourceWeight.SMALL_WEIGHT)
    @StandardPdfResponse
    @Operation(
            summary = "Rearrange pages in a PDF file",
            description =
                    "This endpoint rearranges pages in a given PDF file based on the specified page"
                            + " order or custom mode. Users can provide a page order as a"
                            + " comma-separated list of page numbers or page ranges, or a custom mode."
                            + " Input:PDF Output:PDF")
    public ResponseEntity<Resource> rearrangePages(@ModelAttribute RearrangePagesRequest request)
            throws IOException {
        MultipartFile pdfFile = request.getFileInput();
        String pageOrder = request.getPageNumbers();
        String sortType = request.getCustomMode();

        File source = tempFileManager.convertMultipartFileToFile(pdfFile);
        try {
            if (detectAcroForm(source)) {
                return rearrangeWithPdfBox(pdfFile, pageOrder, sortType);
            }
            return rearrangeWithJpdfium(pdfFile, source, pageOrder, sortType);
        } finally {
            tempFileManager.deleteTempFile(source);
        }
    }

    private ResponseEntity<Resource> rearrangeWithJpdfium(
            MultipartFile pdfFile, File source, String pageOrder, String sortType)
            throws IOException {
        TempFile outputTempFile = new TempFile(tempFileManager, ".pdf");
        try {
            Path src = source.toPath();
            Path out = outputTempFile.getFile().toPath();
            try (PdfDocument doc = PdfDocument.open(src)) {
                int totalPages = doc.pageCount();
                List<Integer> newPageOrder = computeNewPageOrder(pageOrder, sortType, totalPages);
                log.info("newPageOrder = {}", newPageOrder);
                log.info("totalPages = {}", totalPages);

                int[] indices = newPageOrder.stream().mapToInt(Integer::intValue).toArray();
                MemorySegment rawDoc = doc.rawHandle();
                PdfPageImporter.importPagesByIndex(rawDoc, rawDoc, indices, totalPages);
                for (int i = totalPages - 1; i >= 0; i--) {
                    PdfPageEditor.deletePage(rawDoc, i);
                }
                doc.save(out);
            } catch (RuntimeException e) {
                throw new IOException("JPDFium rearrange failed", e);
            }
            return WebResponseUtils.pdfFileToWebResponse(
                    outputTempFile,
                    GeneralUtils.generateFilename(
                            pdfFile.getOriginalFilename(), "_rearranged.pdf"));
        } catch (Exception e) {
            outputTempFile.close();
            ExceptionUtils.logException("document rearrangement", e);
            throw e;
        }
    }

    private ResponseEntity<Resource> rearrangeWithPdfBox(
            MultipartFile pdfFile, String pageOrder, String sortType) throws IOException {
        try (PDDocument document = pdfDocumentFactory.load(pdfFile)) {
            int totalPages = document.getNumberOfPages();
            List<Integer> newPageOrder = computeNewPageOrder(pageOrder, sortType, totalPages);
            log.info("newPageOrder = {}", newPageOrder);
            log.info("totalPages = {}", totalPages);

            List<PDPage> newPages = new ArrayList<>();
            for (Integer i : newPageOrder) {
                newPages.add(document.getPage(i));
            }

            try (PDDocument rearrangedDocument =
                    pdfDocumentFactory.createNewDocumentBasedOnOldDocument(document)) {
                for (PDPage page : newPages) {
                    rearrangedDocument.addPage(page);
                }
                PDDocumentCatalog sourceCatalog = document.getDocumentCatalog();
                if (sourceCatalog != null) {
                    PDAcroForm sourceForm = sourceCatalog.getAcroForm(null);
                    if (sourceForm != null) {
                        rearrangedDocument
                                .getDocumentCatalog()
                                .getCOSObject()
                                .setItem(COSName.ACRO_FORM, sourceForm.getCOSObject());
                    }
                }
                return WebResponseUtils.pdfDocToWebResponse(
                        rearrangedDocument,
                        GeneralUtils.generateFilename(
                                pdfFile.getOriginalFilename(), "_rearranged.pdf"),
                        tempFileManager);
            }
        } catch (IOException e) {
            ExceptionUtils.logException("document rearrangement", e);
            throw e;
        }
    }

    private List<Integer> computeNewPageOrder(String pageOrder, String sortType, int totalPages) {
        String[] pageOrderArr = pageOrder != null ? pageOrder.split(",") : new String[0];
        if (sortType != null
                && !sortType.isEmpty()
                && !"custom".equals(sortType.toLowerCase(Locale.ROOT))) {
            return processSortTypes(sortType, totalPages, pageOrder);
        }
        return GeneralUtils.parsePageList(pageOrderArr, totalPages, false);
    }

    private boolean detectAcroForm(File pdf) {
        try (PDDocument document = pdfDocumentFactory.load(pdf, true)) {
            PDDocumentCatalog catalog = document.getDocumentCatalog();
            if (catalog == null) return false;
            return catalog.getAcroForm(null) != null;
        } catch (IOException e) {
            log.debug("AcroForm detect failed; defaulting to JPDFium path: {}", e.getMessage());
            return false;
        }
    }
}
