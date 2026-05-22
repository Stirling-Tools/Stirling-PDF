package stirling.software.SPDF.controller.api;

import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.ArrayList;
import java.util.List;
import java.util.stream.Collectors;
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
import stirling.software.SPDF.model.api.SplitPagesRequest;
import stirling.software.common.annotations.AutoJobPostMapping;
import stirling.software.common.annotations.api.GeneralApi;
import stirling.software.common.enumeration.ResourceWeight;
import stirling.software.common.service.CustomPDFDocumentFactory;
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
public class SplitPDFController {

    private final CustomPDFDocumentFactory pdfDocumentFactory;
    private final TempFileManager tempFileManager;

    @AutoJobPostMapping(
            consumes = MediaType.MULTIPART_FORM_DATA_VALUE,
            value = "/split-pages",
            resourceWeight = ResourceWeight.MEDIUM_WEIGHT)
    @MultiFileResponse
    @Operation(
            summary = "Split a PDF file into separate documents",
            description =
                    "This endpoint splits a given PDF file into separate documents based on the"
                            + " specified page numbers or ranges. Users can specify pages using"
                            + " individual numbers, ranges, or 'all' for every page. Input:PDF"
                            + " Output:PDF Type:SIMO")
    public ResponseEntity<Resource> splitPdf(@ModelAttribute SplitPagesRequest request)
            throws IOException {

        MultipartFile file = request.getFileInput();
        TempFile outputTempFile = new TempFile(tempFileManager, ".zip");
        try {
            try (TempFile sourceTempFile = new TempFile(tempFileManager, ".pdf")) {
                Files.copy(
                        file.getInputStream(),
                        sourceTempFile.getPath(),
                        StandardCopyOption.REPLACE_EXISTING);

                int totalPages;
                List<Integer> pageNumbers;
                boolean hasForm;
                try (PDDocument document =
                        pdfDocumentFactory.load(sourceTempFile.getFile(), true)) {
                    totalPages = document.getNumberOfPages();
                    pageNumbers = request.getPageNumbersList(document, false);
                    hasForm = document.getDocumentCatalog().getAcroForm(null) != null;
                }
                if (!pageNumbers.contains(totalPages - 1)) {
                    pageNumbers = new ArrayList<>(pageNumbers);
                    pageNumbers.add(totalPages - 1);
                }

                log.debug(
                        "Splitting PDF into pages: {}",
                        pageNumbers.stream().map(String::valueOf).collect(Collectors.joining(",")));

                String baseFilename = GeneralUtils.removeExtension(file.getOriginalFilename());
                try (ZipOutputStream zipOut =
                        new ZipOutputStream(Files.newOutputStream(outputTempFile.getPath()))) {
                    writeSplits(
                            sourceTempFile.getFile(), pageNumbers, baseFilename, zipOut, hasForm);
                }
            }

            String zipFilename =
                    GeneralUtils.generateFilename(file.getOriginalFilename(), "_split.zip");
            return WebResponseUtils.zipFileToWebResponse(outputTempFile, zipFilename);
        } catch (Exception e) {
            outputTempFile.close();
            throw e;
        }
    }

    private void writeSplits(
            File source,
            List<Integer> pageNumbers,
            String baseFilename,
            ZipOutputStream zipOut,
            boolean hasForm)
            throws IOException {
        try (PdfDocument sourceDoc = PdfDocument.open(source.toPath())) {
            int previousPageNumber = 0;
            for (int splitIndex = 0; splitIndex < pageNumbers.size(); splitIndex++) {
                int splitPoint = pageNumbers.get(splitIndex);
                writeSplit(
                        sourceDoc,
                        previousPageNumber,
                        splitPoint,
                        baseFilename,
                        splitIndex + 1,
                        zipOut,
                        hasForm);
                previousPageNumber = splitPoint + 1;
            }
        }
    }

    private void writeSplit(
            PdfDocument sourceDoc,
            int fromIndex,
            int toIndex,
            String baseFilename,
            int splitNumber,
            ZipOutputStream zipOut,
            boolean hasForm)
            throws IOException {
        try (TempFile splitTemp = new TempFile(tempFileManager, ".pdf")) {
            try (PdfDocument splitDoc = PdfSplit.extractPageRange(sourceDoc, fromIndex, toIndex)) {
                splitDoc.save(splitTemp.getPath());
            }
            Path finalPath = splitTemp.getPath();
            TempFile prunedTemp = null;
            try {
                if (hasForm) {
                    prunedTemp = new TempFile(tempFileManager, ".pdf");
                    pruneForms(splitTemp.getFile(), prunedTemp.getFile());
                    finalPath = prunedTemp.getPath();
                }
                writeEntry(zipOut, baseFilename, splitNumber, finalPath);
            } finally {
                if (prunedTemp != null) {
                    prunedTemp.close();
                }
            }
        }
    }

    private void pruneForms(File splitFile, File outputFile) throws IOException {
        try (PDDocument doc = pdfDocumentFactory.load(splitFile)) {
            FormUtils.pruneOrphanedFormFields(doc);
            doc.save(outputFile);
        }
    }

    private void writeEntry(ZipOutputStream zipOut, String baseFilename, int index, Path pdfPath)
            throws IOException {
        zipOut.putNextEntry(new ZipEntry(baseFilename + "_" + index + ".pdf"));
        Files.copy(pdfPath, zipOut);
        zipOut.closeEntry();
    }
}
