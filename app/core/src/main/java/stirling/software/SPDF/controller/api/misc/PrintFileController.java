package stirling.software.SPDF.controller.api.misc;

import java.awt.*;
import java.awt.image.BufferedImage;
import java.awt.print.PageFormat;
import java.awt.print.Printable;
import java.awt.print.PrinterException;
import java.awt.print.PrinterJob;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.Arrays;
import java.util.Locale;

import javax.imageio.ImageIO;
import javax.print.PrintService;
import javax.print.PrintServiceLookup;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.printing.PDFPageable;
import org.jboss.resteasy.reactive.RestForm;
import org.jboss.resteasy.reactive.multipart.FileUpload;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.ws.rs.core.Response;

import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.model.api.misc.PrintFileRequest;
import stirling.software.common.annotations.api.MiscApi;
import stirling.software.common.model.multipart.FileUploadMultipartFile;
import stirling.software.common.util.ExceptionUtils;

@MiscApi
@ApplicationScoped
@jakarta.ws.rs.Path("/api/v1/misc")
@Slf4j
public class PrintFileController {

    // TODO: Migration required - endpoint mapping was commented out in the original Spring source
    // (the @PostMapping/@Operation were disabled), so this route remains intentionally inactive.
    // The conversion below preserves the disabled state: routing annotations are kept commented.
    // To enable, uncomment the JAX-RS annotations and provide a multipart-bound request.
    // @POST
    // @jakarta.ws.rs.Path("/print-file")
    // @jakarta.ws.rs.Consumes(MediaType.MULTIPART_FORM_DATA)
    // @io.swagger.v3.oas.annotations.Operation(
    //        summary = "Prints PDF/Image file to a set printer",
    //        description =
    //                "Input of PDF or Image along with a printer name/URL/IP to match against to
    // send it to (Fire and forget) Input:Any Output:N/A Type:SISO")
    public Response printFile(
            @RestForm("fileInput") FileUpload fileUpload,
            @RestForm("printerName") String printerName)
            throws IOException {
        PrintFileRequest request = new PrintFileRequest();
        request.setFileInput(FileUploadMultipartFile.of(fileUpload));
        request.setPrinterName(printerName);

        stirling.software.common.model.MultipartFile file = request.getFileInput();
        String originalFilename = file.getOriginalFilename();
        if (originalFilename != null
                && (originalFilename.contains("..") || Path.of(originalFilename).isAbsolute())) {
            throw ExceptionUtils.createIllegalArgumentException(
                    "error.invalid.filepath", "Invalid file path detected: " + originalFilename);
        }
        String resolvedPrinterName = request.getPrinterName();
        String contentType = file.getContentType();
        try {
            // Find matching printer
            PrintService[] services = PrintServiceLookup.lookupPrintServices(null, null);
            String normalizedPrinterName = resolvedPrinterName.toLowerCase(Locale.ROOT);
            PrintService selectedService =
                    Arrays.stream(services)
                            .filter(
                                    service ->
                                            service.getName()
                                                    .toLowerCase(Locale.ROOT)
                                                    .contains(normalizedPrinterName))
                            .findFirst()
                            .orElseThrow(
                                    () ->
                                            new IllegalArgumentException(
                                                    "No matching printer found"));

            log.info("Selected Printer: {}", selectedService.getName());

            if ("application/pdf".equals(contentType)) {
                // Use Stream-to-File pattern: write to temp file first, then load from file
                Path tempFile = Files.createTempFile("print-", ".pdf");
                try {
                    Files.copy(
                            file.getInputStream(), tempFile, StandardCopyOption.REPLACE_EXISTING);
                    try (PDDocument document = Loader.loadPDF(tempFile.toFile())) {
                        PrinterJob job = PrinterJob.getPrinterJob();
                        job.setPrintService(selectedService);
                        job.setPageable(new PDFPageable(document));
                        job.print();
                    }
                } finally {
                    Files.deleteIfExists(tempFile);
                }
            } else if (contentType.startsWith("image/")) {
                try (var inputStream = file.getInputStream()) {
                    BufferedImage image = ImageIO.read(inputStream);
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
            }
            return Response.ok("File printed successfully to " + selectedService.getName()).build();
        } catch (Exception e) {
            System.err.println("Failed to print: " + e.getMessage());
            return Response.status(Response.Status.BAD_REQUEST).entity(e.getMessage()).build();
        }
    }
}
