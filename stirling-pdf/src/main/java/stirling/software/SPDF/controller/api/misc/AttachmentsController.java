package stirling.software.SPDF.controller.api.misc;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.util.List;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDDocumentCatalog;
import org.apache.pdfbox.pdmodel.PDEmbeddedFilesNameTreeNode;
import org.apache.pdfbox.pdmodel.PageMode;
import org.apache.pdfbox.pdmodel.common.filespecification.PDComplexFileSpecification;
import org.apache.pdfbox.pdmodel.common.filespecification.PDEmbeddedFile;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import io.github.pixee.security.Filenames;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.WebResponseUtils;

@RestController
@RequiredArgsConstructor
@RequestMapping("/api/v1/misc")
@Tag(name = "Misc", description = "Miscellaneous APIs")
@Slf4j
public class AttachmentsController {

    private final CustomPDFDocumentFactory pdfDocumentFactory;

    @PostMapping(consumes = "multipart/form-data", value = "/add-attachments")
    @Operation(
            summary = "Add attachments to PDF",
            description = "This endpoint adds embedded files (attachments) to a PDF and sets the PageMode to UseAttachments to make them visible. Input:PDF + Files Output:PDF Type:MISO")
    public ResponseEntity<byte[]> addAttachments(
            @RequestParam("fileInput") MultipartFile pdfFile,
            @RequestParam("attachments") List<MultipartFile> attachments)
            throws IOException {

        // Load the PDF document
        PDDocument document = pdfDocumentFactory.load(pdfFile, true);
        
        // Get or create the document catalog
        PDDocumentCatalog catalog = document.getDocumentCatalog();
        
        // Create embedded files name tree if it doesn't exist
        PDEmbeddedFilesNameTreeNode efTree = catalog.getNames().getEmbeddedFiles();
        if (efTree == null) {
            efTree = new PDEmbeddedFilesNameTreeNode();
            catalog.getNames().setEmbeddedFiles(efTree);
        }

        // Add each attachment
        for (MultipartFile attachment : attachments) {
            if (attachment != null && !attachment.isEmpty()) {
                addEmbeddedFile(document, efTree, attachment);
            }
        }

        // Set PageMode to UseAttachments to show the attachments panel
        catalog.setPageMode(PageMode.USE_ATTACHMENTS);

        // Return the modified PDF
        return WebResponseUtils.pdfDocToWebResponse(
                document,
                Filenames.toSimpleFileName(pdfFile.getOriginalFilename())
                        .replaceFirst("[.][^.]+$", "") + "_with_attachments.pdf");
    }

    @PostMapping(consumes = "multipart/form-data", value = "/remove-attachments")
    @Operation(
            summary = "Remove attachments from PDF",
            description = "This endpoint removes all embedded files (attachments) from a PDF. Input:PDF Output:PDF Type:SISO")
    public ResponseEntity<byte[]> removeAttachments(
            @RequestParam("fileInput") MultipartFile pdfFile)
            throws IOException {

        // Load the PDF document
        PDDocument document = pdfDocumentFactory.load(pdfFile, true);
        
        // Get the document catalog
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
                        .replaceFirst("[.][^.]+$", "") + "_attachments_removed.pdf");
    }

    private void addEmbeddedFile(PDDocument document, PDEmbeddedFilesNameTreeNode efTree, MultipartFile file)
            throws IOException {
        
        // Create file specification
        PDComplexFileSpecification fs = new PDComplexFileSpecification();
        fs.setFile(file.getOriginalFilename());
        fs.setFileDescription("Embedded file: " + file.getOriginalFilename());

        // Create embedded file
        PDEmbeddedFile ef = new PDEmbeddedFile(document, new ByteArrayInputStream(file.getBytes()));
        ef.setSize((int) file.getSize());
        ef.setCreationDate(new java.util.GregorianCalendar());
        ef.setModDate(new java.util.GregorianCalendar());

        // Set MIME type if available
        String contentType = file.getContentType();
        if (contentType != null && !contentType.isEmpty()) {
            ef.setSubtype(contentType);
        }

        // Associate embedded file with file specification
        fs.setEmbeddedFile(ef);

        // Add to the name tree
        efTree.setNames(java.util.Collections.singletonMap(file.getOriginalFilename(), fs));
        
        log.info("Added embedded file: {} ({} bytes)", file.getOriginalFilename(), file.getSize());
    }
}
