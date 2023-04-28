package stirling.software.SPDF.controller.api;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageTree;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import io.swagger.v3.oas.annotations.Hidden;
import stirling.software.SPDF.utils.PdfUtils;

@RestController
public class MergeController {

    private static final Logger logger = LoggerFactory.getLogger(MergeController.class);

    private PDDocument mergeDocuments(List<PDDocument> documents) throws IOException {
        // Create a new empty document
        PDDocument mergedDoc = new PDDocument();

        // Iterate over the list of documents and add their pages to the merged document
        for (PDDocument doc : documents) {
            // Get all pages from the current document
            PDPageTree pages = doc.getPages();
            // Iterate over the pages and add them to the merged document
            for (PDPage page : pages) {
                mergedDoc.addPage(page);
            }
        }

        // Return the merged document
        return mergedDoc;
    }

    @PostMapping(consumes = "multipart/form-data", value = "/merge-pdfs")
    public ResponseEntity<byte[]> mergePdfs(@RequestPart(required = true, value = "fileInput") MultipartFile[] files) throws IOException {
        // Read the input PDF files into PDDocument objects
        List<PDDocument> documents = new ArrayList<>();

        // Loop through the files array and read each file into a PDDocument
        for (MultipartFile file : files) {
            documents.add(PDDocument.load(file.getInputStream()));
        }

        PDDocument mergedDoc = mergeDocuments(documents);

        // Return the merged PDF as a response
        return PdfUtils.pdfDocToWebResponse(mergedDoc, files[0].getOriginalFilename().replaceFirst("[.][^.]+$", "") + "_merged.pdf");
    }

}