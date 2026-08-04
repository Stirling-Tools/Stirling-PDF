package com.stirlingsoftware.pdfelite.controller;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/api/v1/duplicate-pages")
public class DuplicatePagesController {

    @PostMapping(consumes = "multipart/form-data")
    public ResponseEntity<byte[]> duplicatePages(@RequestPart("fileInput") MultipartFile file)
            throws IOException {
        if (file.isEmpty()) {
            return ResponseEntity.badRequest().body(null);
        }

        try (PDDocument document = PDDocument.load(file.getInputStream())) {
            int pageCount = document.getNumberOfPages();

            List<PDPage> originalPages = new ArrayList<>();
            for (int i = 0; i < pageCount; i++) {
                originalPages.add(document.getPage(i));
            }

            document.removeRange(0, pageCount);

            for (PDPage page : originalPages) {
                document.addPage(page);
                document.addPage(page);
            }

            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            document.save(baos);
            return ResponseEntity.ok()
                    .header("Content-Disposition", "attachment; filename=duplicated_pages.pdf")
                    .body(baos.toByteArray());
        }
    }
}
