package stirling.software.SPDF.controller.api.misc;

import java.awt.*;
import java.awt.image.BufferedImage;
import java.awt.print.PageFormat;
import java.awt.print.Printable;
import java.awt.print.PrinterException;
import java.awt.print.PrinterJob;
import java.io.IOException;
import java.util.Arrays;

import javax.imageio.ImageIO;
import javax.print.PrintService;
import javax.print.PrintServiceLookup;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.printing.PDFPageable;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import io.swagger.v3.oas.annotations.tags.Tag;

import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.model.api.misc.PrintFileRequest;

@RestController
@RequestMapping("/api/v1/misc")
@Tag(name = "Misc", description = "Miscellaneous APIs")
@Slf4j
public class PrintFileController {

    // TODO
    // @PostMapping(value = "/print-file", consumes = "multipart/form-data")
    // @Operation(
    //        summary = "Prints PDF/Image file to a set printer",
    //        description =
    //                "Input of PDF or Image along with a printer name/URL/IP to match against to
    // send it to (Fire and forget) Input:Any Output:N/A Type:SISO")
    public ResponseEntity<String> printFile(@ModelAttribute PrintFileRequest request)
            throws IOException {
        MultipartFile file = request.getFileInput();
        String printerName = request.getPrinterName();
        String contentType = file.getContentType();
        try {
            // Find matching printer
            PrintService[] services = PrintServiceLookup.lookupPrintServices(null, null);
            PrintService selectedService =
                    Arrays.stream(services)
                            .filter(
                                    service ->
                                            service.getName().toLowerCase().contains(printerName))
                            .findFirst()
                            .orElseThrow(
                                    () ->
                                            new IllegalArgumentException(
                                                    "No matching printer found"));

            log.info("Selected Printer: " + selectedService.getName());

            if ("application/pdf".equals(contentType)) {
                PDDocument document = Loader.loadPDF(file.getBytes());
                PrinterJob job = PrinterJob.getPrinterJob();
                job.setPrintService(selectedService);
                job.setPageable(new PDFPageable(document));
                job.print();
                document.close();
            } else if (contentType.startsWith("image/")) {
                BufferedImage image = ImageIO.read(file.getInputStream());
                PrinterJob job = PrinterJob.getPrinterJob();
                job.setPrintService(selectedService);
                job.setPrintable(
                        new Printable() {
                            public int print(
                                    Graphics graphics, PageFormat pageFormat, int pageIndex)
                                    throws PrinterException {
                                if (pageIndex != 0) {
                                    return NO_SUCH_PAGE;
                                }
                                Graphics2D g2d = (Graphics2D) graphics;
                                g2d.translate(
                                        pageFormat.getImageableX(), pageFormat.getImageableY());
                                g2d.drawImage(
                                        image,
                                        0,
                                        0,
                                        (int) pageFormat.getImageableWidth(),
                                        (int) pageFormat.getImageableHeight(),
                                        null);
                                return PAGE_EXISTS;
                            }
                        });
                job.print();
            }
            return new ResponseEntity<>(
                    "File printed successfully to " + selectedService.getName(), HttpStatus.OK);
        } catch (Exception e) {
            System.err.println("Failed to print: " + e.getMessage());
            return new ResponseEntity<>(e.getMessage(), HttpStatus.BAD_REQUEST);
        }
    }
}
