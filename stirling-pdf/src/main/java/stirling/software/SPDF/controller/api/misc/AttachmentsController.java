package stirling.software.SPDF.controller.api.misc;

import java.io.IOException;
import java.util.List;

import org.apache.pdfbox.pdmodel.*;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import io.github.pixee.security.Filenames;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.service.PDFAttachmentServiceInterface;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.WebResponseUtils;

@Slf4j
@RestController
@RequiredArgsConstructor
@RequestMapping("/api/v1/misc")
@Tag(name = "Misc", description = "Miscellaneous APIs")
public class AttachmentsController {

    private final CustomPDFDocumentFactory pdfDocumentFactory;

    private final PDFAttachmentServiceInterface pdfAttachmentService;

    @SuppressWarnings("DataFlowIssue")
    @PostMapping(consumes = "multipart/form-data", value = "/add-attachments")
    @Operation(
            summary = "Add attachments to PDF",
            description =
                    "This endpoint adds embedded files (attachments) to a PDF and sets the PageMode to UseAttachments to make them visible. Input:PDF + Files Output:PDF Type:MISO")
    public ResponseEntity<byte[]> addAttachments(
            @RequestParam("fileInput") MultipartFile pdfFile,
            @RequestParam("attachments") List<MultipartFile> attachments)
            throws IOException {

        // Load the PDF document
        PDDocument document = pdfDocumentFactory.load(pdfFile, false);

        // Get or create the document catalog
        PDDocumentCatalog catalog = document.getDocumentCatalog();

        // Create embedded files name tree if it doesn't exist
        PDDocumentNameDictionary documentNames = catalog.getNames();
        PDEmbeddedFilesNameTreeNode embeddedFilesTree = new PDEmbeddedFilesNameTreeNode();

        if (documentNames != null) {
            embeddedFilesTree = documentNames.getEmbeddedFiles();
        } else {
            documentNames = new PDDocumentNameDictionary(catalog);
            documentNames.setEmbeddedFiles(embeddedFilesTree);
        }

        // Add attachments
        catalog.setNames(documentNames);
        byte[] output =
                pdfAttachmentService.addAttachment(document, embeddedFilesTree, attachments);

        return WebResponseUtils.bytesToWebResponse(
                output,
                Filenames.toSimpleFileName(pdfFile.getOriginalFilename())
                                .replaceFirst("[.][^.]+$", "")
                        + "_with_attachments.pdf");
    }

    @PostMapping(consumes = "multipart/form-data", value = "/remove-attachments")
    @Operation(
            summary = "Remove attachments from PDF",
            description =
                    "This endpoint removes all embedded files (attachments) from a PDF. Input:PDF Output:PDF Type:SISO")
    public ResponseEntity<byte[]> removeAttachments(
            @RequestParam("fileInput") MultipartFile pdfFile) throws IOException {

        // Load the PDF document and document catalog
        PDDocument document = pdfDocumentFactory.load(pdfFile);
        PDDocumentCatalog catalog = document.getDocumentCatalog();

        // Remove embedded files
        if (catalog.getNames() != null) {
            catalog.getNames().setEmbeddedFiles(null);
        }

        // Reset PageMode to UseNone (default)
        catalog.setPageMode(PageMode.USE_NONE);

        // Return the modified PDF
        return WebResponseUtils.pdfDocToWebResponse(
                document,
                Filenames.toSimpleFileName(pdfFile.getOriginalFilename())
                                .replaceFirst("[.][^.]+$", "")
                        + "_attachments_removed.pdf");
    }
}
