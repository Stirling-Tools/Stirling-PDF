package stirling.software.SPDF.controller.api.page;

import java.io.IOException;
import java.util.List;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageTree;
import org.springframework.core.io.Resource;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.multipart.MultipartFile;

import io.swagger.v3.oas.annotations.Operation;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.config.swagger.StandardPdfResponse;
import stirling.software.SPDF.model.api.page.DuplicatePagesRequest;
import stirling.software.common.annotations.AutoJobPostMapping;
import stirling.software.common.annotations.api.GeneralApi;
import stirling.software.common.enumeration.ResourceWeight;
import stirling.software.common.model.tool.ToolFormat;
import stirling.software.common.model.tool.ToolIO;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.ExceptionUtils;
import stirling.software.common.util.FormUtils;
import stirling.software.common.util.GeneralUtils;
import stirling.software.common.util.TempFileManager;
import stirling.software.common.util.WebResponseUtils;

@GeneralApi
@Slf4j
@RequiredArgsConstructor
public class DuplicatePagesController {

    private final CustomPDFDocumentFactory pdfDocumentFactory;
    private final TempFileManager tempFileManager;

    @AutoJobPostMapping(
            consumes = MediaType.MULTIPART_FORM_DATA_VALUE,
            value = "/duplicate-pages",
            resourceWeight = ResourceWeight.SMALL_WEIGHT)
    @StandardPdfResponse
    @ToolIO(produces = ToolFormat.PDF)
    @Operation(
            summary = "Duplicate pages in a PDF file",
            description =
                    "This endpoint duplicates specific pages in a PDF file based on the provided configuration.")
    public ResponseEntity<Resource> duplicatePages(@ModelAttribute DuplicatePagesRequest request)
            throws IOException {
        MultipartFile pdfFile = request.getFileInput();
        List<Integer> pageIndices = request.getPageIndices();
        int duplicateCount = request.getDuplicateCount();

        // Validate duplicate count
        if (duplicateCount < 1) {
            throw ExceptionUtils.createIllegalArgumentException(
                    "error.invalidFormat",
                    "Invalid {0} format: {1}",
                    "duplicateCount",
                    "must be at least 1");
        }

        int maxDuplicateCount = 100;
        if (duplicateCount > maxDuplicateCount) {
            throw ExceptionUtils.createIllegalArgumentException(
                    "error.invalidFormat",
                    "Invalid {0} format: {1}",
                    "duplicateCount",
                    "must not exceed " + maxDuplicateCount);
        }

        try (PDDocument document = pdfDocumentFactory.load(pdfFile)) {
            PDPageTree pages = document.getDocumentCatalog().getPages();
            int totalPages = pages.getCount();

            // Validate page indices
            for (Integer pageIndex : pageIndices) {
                if (pageIndex < 0 || pageIndex >= totalPages) {
                    throw ExceptionUtils.createIllegalArgumentException(
                            "error.invalidFormat",
                            "Invalid page index: {0}. Must be between 0 and {1}",
                            pageIndex,
                            totalPages - 1);
                }
            }

            // Process pages in reverse order to maintain correct indices
            // Sort page indices in descending order to avoid index shifting issues
            pageIndices.sort((a, b) -> Integer.compare(b, a));

            for (Integer pageIndex : pageIndices) {
                PDPage originalPage = pages.get(pageIndex);
                
                // Create duplicates
                for (int i = 0; i < duplicateCount; i++) {
                    // Clone the page by copying its COSDictionary
                    org.apache.pdfbox.cos.COSDictionary clonedDict = 
                        new org.apache.pdfbox.cos.COSDictionary();
                    clonedDict.addAll(originalPage.getCOSObject());
                    PDPage clonedPage = new PDPage(clonedDict);
                    
                    // Insert the cloned page right after the original
                    pages.add(pageIndex + 1, clonedPage);
                }
            }

            FormUtils.pruneOrphanedFormFields(document);

            return WebResponseUtils.pdfDocToWebResponse(
                    document,
                    GeneralUtils.generateFilename(
                            pdfFile.getOriginalFilename(), "_pages_duplicated.pdf"),
                    tempFileManager);
        }
    }
}
