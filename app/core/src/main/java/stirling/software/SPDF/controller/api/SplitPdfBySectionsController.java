package stirling.software.SPDF.controller.api;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.file.Files;
import java.util.*;
import java.util.stream.IntStream;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

import org.apache.pdfbox.multipdf.LayerUtility;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.PDPageContentStream.AppendMode;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.graphics.form.PDFormXObject;
import org.apache.pdfbox.util.Matrix;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.multipart.MultipartFile;

import io.swagger.v3.oas.annotations.Operation;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.config.swagger.MultiFileResponse;
import stirling.software.SPDF.model.SplitTypes;
import stirling.software.SPDF.model.api.SplitPdfBySectionsRequest;
import stirling.software.common.annotations.AutoJobPostMapping;
import stirling.software.common.annotations.api.GeneralApi;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.ExceptionUtils;
import stirling.software.common.util.GeneralUtils;
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;
import stirling.software.common.util.WebResponseUtils;

@GeneralApi
@Slf4j
@RequiredArgsConstructor
public class SplitPdfBySectionsController {

    private final CustomPDFDocumentFactory pdfDocumentFactory;
    private final TempFileManager tempFileManager;

    @AutoJobPostMapping(
            consumes = MediaType.MULTIPART_FORM_DATA_VALUE,
            value = "/split-pdf-by-sections")
    @MultiFileResponse
    @Operation(
            summary = "Split PDF pages into smaller sections",
            description =
                    "Split each page of a PDF into smaller sections based on the user's choice"
                            + " which page to split, and how to split"
                            + " ( halves, thirds, quarters, etc.), both vertically and horizontally."
                            + " Input:PDF Output:ZIP-PDF Type:SISO")
    public ResponseEntity<byte[]> splitPdf(@ModelAttribute SplitPdfBySectionsRequest request)
            throws Exception {
        MultipartFile file = request.getFileInput();
        String pageNumbers = request.getPageNumbers();
        SplitTypes splitMode =
                Optional.ofNullable(request.getSplitMode())
                        .map(SplitTypes::valueOf)
                        .orElse(SplitTypes.SPLIT_ALL);

        try (PDDocument sourceDocument = pdfDocumentFactory.load(file)) {
            Set<Integer> pagesToSplit =
                    getPagesToSplit(pageNumbers, splitMode, sourceDocument.getNumberOfPages());

            // Process the PDF based on split parameters
            int horiz = request.getHorizontalDivisions() + 1;
            int verti = request.getVerticalDivisions() + 1;
            boolean merge = Boolean.TRUE.equals(request.getMerge());
            String filename = GeneralUtils.generateFilename(file.getOriginalFilename(), "_split");

            if (merge) {
                try (PDDocument mergedDoc =
                                pdfDocumentFactory.createNewDocumentBasedOnOldDocument(
                                        sourceDocument);
                        ByteArrayOutputStream baos = new ByteArrayOutputStream()) {
                    LayerUtility layerUtility = new LayerUtility(mergedDoc);
                    for (int pageIndex = 0;
                            pageIndex < sourceDocument.getNumberOfPages();
                            pageIndex++) {
                        if (pagesToSplit.contains(pageIndex)) {
                            addSplitPageToTarget(
                                    sourceDocument,
                                    pageIndex,
                                    mergedDoc,
                                    layerUtility,
                                    horiz,
                                    verti);
                        } else {
                            addPageToTarget(sourceDocument, pageIndex, mergedDoc, layerUtility);
                        }
                    }
                    mergedDoc.save(baos);
                    return WebResponseUtils.baosToWebResponse(baos, filename + ".pdf");
                }
            } else {
                try (TempFile zipTempFile = new TempFile(tempFileManager, ".zip")) {
                    try (ZipOutputStream zipOut =
                            new ZipOutputStream(Files.newOutputStream(zipTempFile.getPath()))) {
                        for (int pageIndex = 0;
                                pageIndex < sourceDocument.getNumberOfPages();
                                pageIndex++) {
                            int pageNum = pageIndex + 1;
                            if (pagesToSplit.contains(pageIndex)) {
                                for (int i = 0; i < horiz; i++) {
                                    for (int j = 0; j < verti; j++) {
                                        try (PDDocument subDoc =
                                                pdfDocumentFactory.createNewDocument()) {
                                            LayerUtility subLayerUtility = new LayerUtility(subDoc);
                                            addSingleSectionToTarget(
                                                    sourceDocument,
                                                    pageIndex,
                                                    subDoc,
                                                    subLayerUtility,
                                                    i,
                                                    j,
                                                    horiz,
                                                    verti);
                                            int sectionNum = i * verti + j + 1;
                                            String entryName =
                                                    filename
                                                            + "_"
                                                            + pageNum
                                                            + "_"
                                                            + sectionNum
                                                            + ".pdf";
                                            saveDocToZip(subDoc, zipOut, entryName);
                                        } catch (IOException e) {
                                            log.error(
                                                    "Error creating section {} for page {}",
                                                    (i * verti + j + 1),
                                                    pageNum,
                                                    e);
                                            throw e;
                                        }
                                    }
                                }
                            } else {
                                try (PDDocument subDoc = pdfDocumentFactory.createNewDocument()) {
                                    LayerUtility subLayerUtility = new LayerUtility(subDoc);
                                    addPageToTarget(
                                            sourceDocument, pageIndex, subDoc, subLayerUtility);
                                    String entryName = filename + "_" + pageNum + "_1.pdf";
                                    saveDocToZip(subDoc, zipOut, entryName);
                                } catch (IOException e) {
                                    log.error("Error processing unsplit page {}", pageNum, e);
                                    throw e;
                                }
                            }
                        }
                    } catch (IOException e) {
                        log.error("Error creating ZIP file with split PDF sections", e);
                        throw e;
                    }
                    byte[] zipBytes = Files.readAllBytes(zipTempFile.getPath());
                    return WebResponseUtils.bytesToWebResponse(
                            zipBytes, filename + ".zip", MediaType.APPLICATION_OCTET_STREAM);
                }
            }
        } catch (Exception e) {
            log.error("Error splitting PDF file: {}", file.getOriginalFilename(), e);
            throw e;
        }
    }

    private void addPageToTarget(
            PDDocument sourceDoc, int pageIndex, PDDocument targetDoc, LayerUtility layerUtility)
            throws IOException {
        PDPage sourcePage = sourceDoc.getPage(pageIndex);
        PDPage newPage = new PDPage(sourcePage.getMediaBox());
        targetDoc.addPage(newPage);

        PDFormXObject form = layerUtility.importPageAsForm(sourceDoc, pageIndex);
        try (PDPageContentStream contentStream =
                new PDPageContentStream(targetDoc, newPage, AppendMode.APPEND, true, true)) {
            contentStream.drawForm(form);
        } catch (IOException e) {
            log.error("Error adding page {} to target document", pageIndex, e);
            throw e;
        }
    }

    private void addSplitPageToTarget(
            PDDocument sourceDoc,
            int pageIndex,
            PDDocument targetDoc,
            LayerUtility layerUtility,
            int totalHoriz,
            int totalVert)
            throws IOException {
        PDPage sourcePage = sourceDoc.getPage(pageIndex);
        PDRectangle mediaBox = sourcePage.getMediaBox();
        float width = mediaBox.getWidth();
        float height = mediaBox.getHeight();
        float subPageWidth = width / totalHoriz;
        float subPageHeight = height / totalVert;

        PDFormXObject form = layerUtility.importPageAsForm(sourceDoc, pageIndex);

        for (int i = 0; i < totalHoriz; i++) {
            for (int j = 0; j < totalVert; j++) {
                PDPage subPage = new PDPage(new PDRectangle(subPageWidth, subPageHeight));
                targetDoc.addPage(subPage);

                try (PDPageContentStream contentStream =
                        new PDPageContentStream(
                                targetDoc, subPage, AppendMode.APPEND, true, true)) {
                    float translateX = -subPageWidth * i;
                    float translateY = -subPageHeight * (totalVert - 1 - j);

                    contentStream.saveGraphicsState();
                    contentStream.addRect(0, 0, subPageWidth, subPageHeight);
                    contentStream.clip();
                    contentStream.transform(new Matrix(1, 0, 0, 1, translateX, translateY));
                    contentStream.drawForm(form);
                    contentStream.restoreGraphicsState();
                } catch (IOException e) {
                    log.error(
                            "Error adding split section ({}, {}) for page {}", i, j, pageIndex, e);
                    throw e;
                }
            }
        }
    }

    private void addSingleSectionToTarget(
            PDDocument sourceDoc,
            int pageIndex,
            PDDocument targetDoc,
            LayerUtility layerUtility,
            int horizIndex,
            int vertIndex,
            int totalHoriz,
            int totalVert)
            throws IOException {
        PDPage sourcePage = sourceDoc.getPage(pageIndex);
        PDRectangle mediaBox = sourcePage.getMediaBox();
        float subPageWidth = mediaBox.getWidth() / totalHoriz;
        float subPageHeight = mediaBox.getHeight() / totalVert;

        PDPage subPage = new PDPage(new PDRectangle(subPageWidth, subPageHeight));
        targetDoc.addPage(subPage);

        PDFormXObject form = layerUtility.importPageAsForm(sourceDoc, pageIndex);

        try (PDPageContentStream contentStream =
                new PDPageContentStream(targetDoc, subPage, AppendMode.APPEND, true, true)) {
            float translateX = -subPageWidth * horizIndex;
            float translateY = -subPageHeight * (totalVert - 1 - vertIndex);

            contentStream.saveGraphicsState();
            contentStream.addRect(0, 0, subPageWidth, subPageHeight);
            contentStream.clip();
            contentStream.transform(new Matrix(1, 0, 0, 1, translateX, translateY));
            contentStream.drawForm(form);
            contentStream.restoreGraphicsState();
        } catch (IOException e) {
            log.error(
                    "Error adding single section ({}, {}) for page {} to target",
                    horizIndex,
                    vertIndex,
                    pageIndex,
                    e);
            throw e;
        }
    }

    private void saveDocToZip(PDDocument doc, ZipOutputStream zipOut, String entryName)
            throws IOException {
        ZipEntry entry = new ZipEntry(entryName);
        zipOut.putNextEntry(entry);
        doc.save(zipOut);
        zipOut.closeEntry();
    }

    // Based on the mode, get the pages that need to be split and return the pages set
    private Set<Integer> getPagesToSplit(String pageNumbers, SplitTypes splitMode, int totalPages) {
        Set<Integer> pagesToSplit = new HashSet<>();

        switch (splitMode) {
            case CUSTOM:
                if (pageNumbers == null || pageNumbers.isBlank()) {
                    throw ExceptionUtils.createIllegalArgumentException(
                            "error.argumentRequired",
                            "{0} is required for {1} mode",
                            "page numbers",
                            "custom");
                }
                String[] pageOrderArr = pageNumbers.split(",");
                List<Integer> pageListToSplit =
                        GeneralUtils.parsePageList(pageOrderArr, totalPages, false);
                pagesToSplit.addAll(pageListToSplit);
                break;

            case SPLIT_ALL:
                pagesToSplit.addAll(IntStream.range(0, totalPages).boxed().toList());
                break;

            case SPLIT_ALL_EXCEPT_FIRST:
                pagesToSplit.addAll(IntStream.range(1, totalPages).boxed().toList());
                break;

            case SPLIT_ALL_EXCEPT_LAST:
                pagesToSplit.addAll(IntStream.range(0, totalPages - 1).boxed().toList());
                break;

            case SPLIT_ALL_EXCEPT_FIRST_AND_LAST:
                pagesToSplit.addAll(IntStream.range(1, totalPages - 1).boxed().toList());
                break;

            default:
                throw ExceptionUtils.createIllegalArgumentException(
                        "error.invalidFormat", "Invalid {0} format: {1}", "split mode", splitMode);
        }

        return pagesToSplit;
    }
}
