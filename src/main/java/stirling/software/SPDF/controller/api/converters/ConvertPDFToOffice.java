package stirling.software.SPDF.controller.api.converters;

import java.io.IOException;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import stirling.software.SPDF.utils.PDFToFile;

@RestController
public class ConvertPDFToOffice {

 

    @PostMapping(consumes = "multipart/form-data", value = "/pdf-to-html")
    public ResponseEntity<byte[]> processPdfToHTML(@RequestPart(required = true, value = "fileInput") MultipartFile inputFile) throws IOException, InterruptedException {
        PDFToFile pdfToFile = new PDFToFile();
        return pdfToFile.processPdfToOfficeFormat(inputFile, "html", "writer_pdf_import");
    }

    @PostMapping(consumes = "multipart/form-data", value = "/pdf-to-presentation")
    public ResponseEntity<byte[]> processPdfToPresentation(@RequestPart(required = true, value = "fileInput") MultipartFile inputFile,
            @RequestParam("outputFormat") String outputFormat) throws IOException, InterruptedException {
        PDFToFile pdfToFile = new PDFToFile();
        return pdfToFile.processPdfToOfficeFormat(inputFile, outputFormat, "impress_pdf_import");
    }

    @PostMapping(consumes = "multipart/form-data", value = "/pdf-to-text")
    public ResponseEntity<byte[]> processPdfToRTForTXT(@RequestPart(required = true, value = "fileInput") MultipartFile inputFile,
            @RequestParam("outputFormat") String outputFormat) throws IOException, InterruptedException {
        PDFToFile pdfToFile = new PDFToFile();
        return pdfToFile.processPdfToOfficeFormat(inputFile, outputFormat, "writer_pdf_import");
    }

    @PostMapping(consumes = "multipart/form-data", value = "/pdf-to-word")
    public ResponseEntity<byte[]> processPdfToWord(@RequestPart(required = true, value = "fileInput") MultipartFile inputFile, @RequestParam("outputFormat") String outputFormat)
            throws IOException, InterruptedException {
        PDFToFile pdfToFile = new PDFToFile();
        return pdfToFile.processPdfToOfficeFormat(inputFile, outputFormat, "writer_pdf_import");
    }

    @PostMapping(consumes = "multipart/form-data", value = "/pdf-to-xml")
    public ResponseEntity<byte[]> processPdfToXML(@RequestPart(required = true, value = "fileInput") MultipartFile inputFile) throws IOException, InterruptedException {
        PDFToFile pdfToFile = new PDFToFile();
        return pdfToFile.processPdfToOfficeFormat(inputFile, "xml", "writer_pdf_import");
    }

}
