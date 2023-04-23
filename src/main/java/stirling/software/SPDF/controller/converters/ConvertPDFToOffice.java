package stirling.software.SPDF.controller.converters;

import java.io.IOException;

import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.servlet.ModelAndView;

import stirling.software.SPDF.utils.PDFToFile;

@Controller
public class ConvertPDFToOffice {

    @GetMapping("/pdf-to-html")
    public ModelAndView pdfToHTML() {
        ModelAndView modelAndView = new ModelAndView("convert/pdf-to-html");
        modelAndView.addObject("currentPage", "pdf-to-html");
        return modelAndView;
    }

    @GetMapping("/pdf-to-presentation")
    public ModelAndView pdfToPresentation() {
        ModelAndView modelAndView = new ModelAndView("convert/pdf-to-presentation");
        modelAndView.addObject("currentPage", "pdf-to-presentation");
        return modelAndView;
    }

    @GetMapping("/pdf-to-text")
    public ModelAndView pdfToText() {
        ModelAndView modelAndView = new ModelAndView("convert/pdf-to-text");
        modelAndView.addObject("currentPage", "pdf-to-text");
        return modelAndView;
    }

    @GetMapping("/pdf-to-word")
    public ModelAndView pdfToWord() {
        ModelAndView modelAndView = new ModelAndView("convert/pdf-to-word");
        modelAndView.addObject("currentPage", "pdf-to-word");
        return modelAndView;
    }

    @GetMapping("/pdf-to-xml")
    public ModelAndView pdfToXML() {
        ModelAndView modelAndView = new ModelAndView("convert/pdf-to-xml");
        modelAndView.addObject("currentPage", "pdf-to-xml");
        return modelAndView;
    }

    @PostMapping("/pdf-to-html")
    public ResponseEntity<byte[]> processPdfToHTML(@RequestParam("fileInput") MultipartFile inputFile) throws IOException, InterruptedException {
        PDFToFile pdfToFile = new PDFToFile();
        return pdfToFile.processPdfToOfficeFormat(inputFile, "html", "writer_pdf_import");
    }

    @PostMapping("/pdf-to-presentation")
    public ResponseEntity<byte[]> processPdfToPresentation(@RequestParam("fileInput") MultipartFile inputFile, @RequestParam("outputFormat") String outputFormat)
            throws IOException, InterruptedException {
        PDFToFile pdfToFile = new PDFToFile();
        return pdfToFile.processPdfToOfficeFormat(inputFile, outputFormat, "impress_pdf_import");
    }

    @PostMapping("/pdf-to-text")
    public ResponseEntity<byte[]> processPdfToRTForTXT(@RequestParam("fileInput") MultipartFile inputFile, @RequestParam("outputFormat") String outputFormat)
            throws IOException, InterruptedException {
        PDFToFile pdfToFile = new PDFToFile();
        return pdfToFile.processPdfToOfficeFormat(inputFile, outputFormat, "writer_pdf_import");
    }

    @PostMapping("/pdf-to-word")
    public ResponseEntity<byte[]> processPdfToWord(@RequestParam("fileInput") MultipartFile inputFile, @RequestParam("outputFormat") String outputFormat)
            throws IOException, InterruptedException {
        PDFToFile pdfToFile = new PDFToFile();
        return pdfToFile.processPdfToOfficeFormat(inputFile, outputFormat, "writer_pdf_import");
    }

    @PostMapping("/pdf-to-xml")
    public ResponseEntity<byte[]> processPdfToXML(@RequestParam("fileInput") MultipartFile inputFile) throws IOException, InterruptedException {
        PDFToFile pdfToFile = new PDFToFile();
        return pdfToFile.processPdfToOfficeFormat(inputFile, "xml", "writer_pdf_import");
    }

}
