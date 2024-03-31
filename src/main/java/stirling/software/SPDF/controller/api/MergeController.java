package stirling.software.SPDF.controller.api;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Paths;
import java.nio.file.attribute.BasicFileAttributes;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.List;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.multipdf.PDFMergerUtility;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;

import stirling.software.SPDF.model.api.general.MergePdfsRequest;
import stirling.software.SPDF.utils.GeneralUtils;
import stirling.software.SPDF.utils.WebResponseUtils;

@RestController
@RequestMapping("/api/v1/general")
@Tag(name = "General", description = "General APIs")
public class MergeController {

    private static final Logger logger = LoggerFactory.getLogger(MergeController.class);

    public PDDocument mergeDocuments(List<PDDocument> documents) throws IOException {
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
                return Comparator.comparing(this::getLastModifiedDate);
            case "byDateCreated":
                return Comparator.comparing(this::getCreationDate);
            case "byPDFTitle":
                return Comparator.comparing(this::getPdfTitle);
            case "orderProvided":
            default:
                return (file1, file2) -> 0; // Default is the order provided
        }
    }

    private long getLastModifiedDate(MultipartFile file) {
        try {
            BasicFileAttributes attributes = getFileAttributes(file);
            return attributes.lastModifiedTime().toMillis();
        } catch (IOException e) {
            return 0;
        }
    }

    private long getCreationDate(MultipartFile file) {
        try {
            BasicFileAttributes attributes = getFileAttributes(file);
            return attributes.creationTime().toMillis();
        } catch (IOException e) {
            return 0;
        }
    }

    private String getPdfTitle(MultipartFile file) {
        try (PDDocument doc = Loader.loadPDF(file.getBytes())) {
            return doc.getDocumentInformation().getTitle();
        } catch (IOException e) {
            return "";
        }
    }

    private BasicFileAttributes getFileAttributes(MultipartFile file) throws IOException {
        return Files.readAttributes(
                Paths.get(file.getOriginalFilename()), BasicFileAttributes.class);
    }

    @PostMapping(consumes = "multipart/form-data", value = "/merge-pdfs")
    @Operation(
            summary = "Merge multiple PDF files into one",
            description =
                    "This endpoint merges multiple PDF files into a single PDF file. The merged file will contain all pages from the input files in the order they were provided. Input:PDF Output:PDF Type:MISO")
    public ResponseEntity<byte[]> mergePdfs(@ModelAttribute MergePdfsRequest form)
            throws IOException {
        List<File> tempFiles = new ArrayList<>();
        try {
            MultipartFile[] files = form.getFileInput();
            Arrays.sort(files, getSortComparator(form.getSortType()));

            PDFMergerUtility pdfMerger = new PDFMergerUtility();
            ByteArrayOutputStream mergedPdfStream = new ByteArrayOutputStream();

            for (MultipartFile multipartFile : files) {
                File tempFile = createTempFile(multipartFile);
                tempFiles.add(tempFile);
                pdfMerger.addSource(tempFile);
            }

            String mergedFileName = getMergedFileName(files);
            pdfMerger.setDestinationFileName(mergedFileName);
            pdfMerger.setDestinationStream(mergedPdfStream);
            pdfMerger.mergeDocuments(null);

            return WebResponseUtils.bytesToWebResponse(
                    mergedPdfStream.toByteArray(), mergedFileName);
        } catch (Exception ex) {
            logger.error("Error occurred during PDF merge", ex);
            throw ex;
        } finally {
            cleanupTempFiles(tempFiles);
        }
    }

    private File createTempFile(MultipartFile multipartFile) throws IOException {
        File tempFile = GeneralUtils.convertMultipartFileToFile(multipartFile);
        tempFile.deleteOnExit();
        return tempFile;
    }

    private String getMergedFileName(MultipartFile[] files) {
        return files[0].getOriginalFilename().replaceFirst("[.][^.]+$", "") + "_merged.pdf";
    }

    private void cleanupTempFiles(List<File> tempFiles) {
        for (File file : tempFiles) {
            file.delete();
        }
    }
}
