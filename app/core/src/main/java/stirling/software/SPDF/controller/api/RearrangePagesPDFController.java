package com.stirlingsoftware.pdfelite.controller;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/api/v1/rearrange-pages")
public class RearrangePagesPDFController {

    @PostMapping(consumes = "multipart/form-data")
    public ResponseEntity<byte[]> rearrangePages(
            @RequestPart("fileInput") MultipartFile file,
            @RequestPart("pageOrder") String pageOrder)
            throws IOException {

        if (file.isEmpty()) {
            return ResponseEntity.badRequest().body(null);
        }

        try (PDDocument document = Loader.loadPDF(file.getInputStream())) {
            int totalPages = document.getNumberOfPages();
            List<Integer> newPageIndices = parsePageOrder(pageOrder, totalPages);

            List<PDPage> orderedPages = new ArrayList<>();
            for (int index : newPageIndices) {
                if (index >= 0 && index < totalPages) {
                    orderedPages.add(document.getPage(index));
                }
            }

            PDDocument newDocument = new PDDocument();
            for (PDPage page : orderedPages) {
                newDocument.addPage(page);
            }

            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            newDocument.save(baos);
            newDocument.close();
            return ResponseEntity.ok()
                    .header("Content-Disposition", "attachment; filename=rearranged_pages.pdf")
                    .body(baos.toByteArray());
        }
    }

    private List<Integer> parsePageOrder(String pageOrder, int totalPages) {
        List<Integer> indices = new ArrayList<>();
        if (pageOrder == null || pageOrder.trim().isEmpty()) {
            for (int i = 0; i < totalPages; i++) indices.add(i);
            return indices;
        }

        String[] parts = pageOrder.split(",");
        for (String part : parts) {
            part = part.trim();
            if (part.matches("\d+")) {
                indices.add(Integer.parseInt(part) - 1);
            }
        }
        return indices.isEmpty() ? parsePageOrder(null, totalPages) : indices;
    }
}
