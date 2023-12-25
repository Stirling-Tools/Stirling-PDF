package stirling.software.SPDF.controller.api;

import java.io.*;
import java.nio.file.Files;
import java.nio.file.Paths;
import java.nio.file.attribute.BasicFileAttributes;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.List;

import org.apache.pdfbox.io.MemoryUsageSetting;
import org.apache.pdfbox.multipdf.PDFMergerUtility;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import stirling.software.SPDF.model.api.general.MergePdfsRequest;
import stirling.software.SPDF.utils.WebResponseUtils;

@RestController
@RequestMapping("/api/v1/general")
@Tag(name = "General", description = "General APIs")
public class MergeController {

    private static final Logger logger = LoggerFactory.getLogger(MergeController.class);


    private PDDocument mergeDocuments(List<PDDocument> documents) throws IOException {
        PDDocument mergedDoc = new PDDocument();
        for (PDDocument doc : documents) {
            for (PDPage page : doc.getPages()) {
                mergedDoc.addPage(page);
            }
        }
        return mergedDoc;
    }

    private Comparator<MultipartFile> getSortComparator(String sortType) {
        switch (sortType) {
            case "byFileName":
                return Comparator.comparing(MultipartFile::getOriginalFilename);
            case "byDateModified":
                return (file1, file2) -> {
                    try {
                        BasicFileAttributes attr1 = Files.readAttributes(Paths.get(file1.getOriginalFilename()), BasicFileAttributes.class);
                        BasicFileAttributes attr2 = Files.readAttributes(Paths.get(file2.getOriginalFilename()), BasicFileAttributes.class);
                        return attr1.lastModifiedTime().compareTo(attr2.lastModifiedTime());
                    } catch (IOException e) {
                        return 0;  // If there's an error, treat them as equal
                    }
                };
            case "byDateCreated":
                return (file1, file2) -> {
                    try {
                        BasicFileAttributes attr1 = Files.readAttributes(Paths.get(file1.getOriginalFilename()), BasicFileAttributes.class);
                        BasicFileAttributes attr2 = Files.readAttributes(Paths.get(file2.getOriginalFilename()), BasicFileAttributes.class);
                        return attr1.creationTime().compareTo(attr2.creationTime());
                    } catch (IOException e) {
                        return 0;  // If there's an error, treat them as equal
                    }
                };
            case "byPDFTitle":
                return (file1, file2) -> {
                    try (PDDocument doc1 = PDDocument.load(file1.getInputStream());
                         PDDocument doc2 = PDDocument.load(file2.getInputStream())) {
                        String title1 = doc1.getDocumentInformation().getTitle();
                        String title2 = doc2.getDocumentInformation().getTitle();
                        return title1.compareTo(title2);
                    } catch (IOException e) {
                        return 0;
                    }
                };
            case "orderProvided":
            default:
                return (file1, file2) -> 0;  // Default is the order provided
        }
    }

    @PostMapping(consumes = "multipart/form-data", value = "/merge-pdfs")
    @Operation(summary = "Merge multiple PDF files into one",
            description = "This endpoint merges multiple PDF files into a single PDF file. The merged file will contain all pages from the input files in the order they were provided. Input:PDF Output:PDF Type:MISO")
    public ResponseEntity<byte[]> mergePdfs(@ModelAttribute MergePdfsRequest form) throws IOException {

        try {
            MultipartFile[] files = form.getFileInput();
            Arrays.sort(files, getSortComparator(form.getSortType()));

            PDFMergerUtility mergedDoc = new PDFMergerUtility();
            ByteArrayOutputStream docOutputstream = new ByteArrayOutputStream();

            for (MultipartFile file : files) {
                mergedDoc.addSource(new ByteArrayInputStream(file.getBytes()));
            }

            mergedDoc.setDestinationFileName(files[0].getOriginalFilename().replaceFirst("[.][^.]+$", ""));
            mergedDoc.setDestinationStream(docOutputstream);
            mergedDoc.mergeDocuments(MemoryUsageSetting.setupMainMemoryOnly());

            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_PDF);

            // Here you have to set the actual filename of your pdf
            headers.setContentDispositionFormData(mergedDoc.getDestinationFileName(), mergedDoc.getDestinationFileName());
            headers.setCacheControl("must-revalidate, post-check=0, pre-check=0");
            return new ResponseEntity<>(docOutputstream.toByteArray(), headers, HttpStatus.OK);
        } catch (Exception ex) {
            logger.error("Error in merge pdf process", ex);
           throw ex;
        }
    }
}
