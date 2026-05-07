package stirling.software.SPDF.controller.api;

import java.io.IOException;
import java.nio.file.Files;
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
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.service.JobProgressService;
import stirling.software.common.util.ExceptionUtils;
import stirling.software.common.util.GeneralUtils;
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;
import stirling.software.common.util.WebResponseUtils;

@GeneralApi
@Slf4j
@RequiredArgsConstructor
public class SplitPDFController {

    private final CustomPDFDocumentFactory pdfDocumentFactory;
    private final TempFileManager tempFileManager;
    private final JobProgressService jobProgressService;

    @AutoJobPostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE, value = "/split-pages")
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
        jobProgressService.report(1, "Loading PDF");
        TempFile outputTempFile = new TempFile(tempFileManager, ".zip");
        try {
            try (PDDocument document = pdfDocumentFactory.load(file)) {
                int totalPages = document.getNumberOfPages();
                List<Integer> pageNumbers = request.getPageNumbersList(document, false);
                if (!pageNumbers.contains(totalPages - 1)) {
                    pageNumbers = new ArrayList<>(pageNumbers);
                    pageNumbers.add(totalPages - 1);
                }

                log.debug(
                        "Splitting PDF into pages: {}",
                        pageNumbers.stream().map(String::valueOf).collect(Collectors.joining(",")));

                String baseFilename = GeneralUtils.removeExtension(file.getOriginalFilename());
                int totalSplits = pageNumbers.size();
                try (ZipOutputStream zipOut =
                        new ZipOutputStream(Files.newOutputStream(outputTempFile.getPath()))) {
                    int previousPageNumber = 0;
                    for (int splitIndex = 0; splitIndex < totalSplits; splitIndex++) {
                        jobProgressService.report(
                                splitIndex + 1,
                                totalSplits,
                                "Writing split " + (splitIndex + 1) + " of " + totalSplits);
                        int splitPoint = pageNumbers.get(splitIndex);
                        try (PDDocument splitDocument =
                                pdfDocumentFactory.createNewDocumentBasedOnOldDocument(document)) {
                            for (int i = previousPageNumber; i <= splitPoint; i++) {
                                splitDocument.addPage(document.getPage(i));
                                log.debug("Adding page {} to split document", i);
                            }
                            previousPageNumber = splitPoint + 1;

                            String fileName = baseFilename + "_" + (splitIndex + 1) + ".pdf";
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
            }

            log.debug(
                    "Successfully created zip file with split documents: {}",
                    outputTempFile.getPath().toString());
            String zipFilename =
                    GeneralUtils.generateFilename(file.getOriginalFilename(), "_split.zip");
            return WebResponseUtils.zipFileToWebResponse(outputTempFile, zipFilename);
        } catch (Exception e) {
            outputTempFile.close();
            throw e;
        }
    }
}
