package stirling.software.SPDF.controller;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageTree;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.multipart.MultipartFile;

import stirling.software.SPDF.utils.PdfUtils;

@Controller
public class MergeController {

    private static final Logger logger = LoggerFactory.getLogger(MergeController.class);

    @GetMapping("/merge-pdfs")
    public String hello(Model model) {
        model.addAttribute("currentPage", "merge-pdfs");
        return "merge-pdfs";
    }

    @PostMapping("/merge-pdfs")
    public ResponseEntity<byte[]> mergePdfs(@RequestParam("fileInput") MultipartFile[] files) throws IOException {
        // Read the input PDF files into PDDocument objects
        List<PDDocument> documents = new ArrayList<>();

        // Loop through the files array and read each file into a PDDocument
        for (MultipartFile file : files) {
            documents.add(PDDocument.load(file.getInputStream()));
        }

        PDDocument mergedDoc = mergeDocuments(documents);

        // Return the merged PDF as a response
        return PdfUtils.pdfDocToWebResponse(mergedDoc, files[0].getOriginalFilename().replaceFirst("[.][^.]+$", "")+ "_merged.pdf");
    }

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

}