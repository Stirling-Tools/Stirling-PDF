package stirling.software.SPDF.controller;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.stream.Collectors;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.multipart.MultipartFile;

@Controller
public class SplitPDFController {

    private static final Logger logger = LoggerFactory.getLogger(SplitPDFController.class);

    @PostMapping("/split-pages")
    public ResponseEntity<Resource> splitPdf(@RequestParam("fileInput") MultipartFile file, @RequestParam("pages") String pages) throws IOException {
        // parse user input

        // open the pdf document
        InputStream inputStream = file.getInputStream();
        PDDocument document = PDDocument.load(inputStream);

        List<Integer> pageNumbers = new ArrayList<>();
        pages = pages.replaceAll("\\s+", ""); // remove whitespaces
        if (pages.toLowerCase().equals("all")) {
            for (int i = 0; i < document.getNumberOfPages(); i++) {
                pageNumbers.add(i);
            }
        } else {
            List<String> pageNumbersStr = new ArrayList<>(Arrays.asList(pages.split(",")));
            if (!pageNumbersStr.contains(String.valueOf(document.getNumberOfPages()))) {
                String lastpage = String.valueOf(document.getNumberOfPages());
                pageNumbersStr.add(lastpage);
            }
            for (String page : pageNumbersStr) {
                if (page.contains("-")) {
                    String[] range = page.split("-");
                    int start = Integer.parseInt(range[0]);
                    int end = Integer.parseInt(range[1]);
                    for (int i = start; i <= end; i++) {
                        pageNumbers.add(i);
                    }
                } else {
                    pageNumbers.add(Integer.parseInt(page));
                }
            }
        }

        logger.info("Splitting PDF into pages: {}", pageNumbers.stream().map(String::valueOf).collect(Collectors.joining(",")));

        // split the document
        List<ByteArrayOutputStream> splitDocumentsBoas = new ArrayList<>();
        int currentPage = 0;
        for (int pageNumber : pageNumbers) {
            try (PDDocument splitDocument = new PDDocument()) {
                for (int i = currentPage; i < pageNumber; i++) {
                    PDPage page = document.getPage(i);
                    splitDocument.addPage(page);
                    logger.debug("Adding page {} to split document", i);
                }
                currentPage = pageNumber;
                logger.debug("Setting current page to {}", currentPage);

                ByteArrayOutputStream baos = new ByteArrayOutputStream();
                splitDocument.save(baos);

                splitDocumentsBoas.add(baos);
            } catch (Exception e) {
                logger.error("Failed splitting documents and saving them", e);
                throw e;
            }
        }

        // closing the original document
        document.close();

        Path zipFile = Files.createTempFile("split_documents", ".zip");

        try (ZipOutputStream zipOut = new ZipOutputStream(Files.newOutputStream(zipFile))) {
            // loop through the split documents and write them to the zip file
            for (int i = 0; i < splitDocumentsBoas.size(); i++) {
                String fileName = "split_document_" + (i + 1) + ".pdf";
                ByteArrayOutputStream baos = splitDocumentsBoas.get(i);
                byte[] pdf = baos.toByteArray();

                // Add PDF file to the zip
                ZipEntry pdfEntry = new ZipEntry(fileName);
                zipOut.putNextEntry(pdfEntry);
                zipOut.write(pdf);
                zipOut.closeEntry();

                logger.info("Wrote split document {} to zip file", fileName);
            }
        } catch (Exception e) {
            logger.error("Failed writing to zip", e);
            throw e;
        }

        logger.info("Successfully created zip file with split documents: {}", zipFile.toString());
        byte[] data = Files.readAllBytes(zipFile);
        ByteArrayResource resource = new ByteArrayResource(data);
        Files.delete(zipFile);

        // return the Resource in the response
        return ResponseEntity.ok().header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=" + file.getOriginalFilename().replaceFirst("[.][^.]+$", "") + "_split.zip")
                .contentType(MediaType.APPLICATION_OCTET_STREAM).contentLength(resource.contentLength()).body(resource);
    }

    @GetMapping("/split-pdfs")
    public String splitPdfForm(Model model) {
        model.addAttribute("currentPage", "split-pdfs");
        return "split-pdfs";
    }
}
