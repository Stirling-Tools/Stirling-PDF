package stirling.software.SPDF.controller.api.converters;

import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.multipart.MultipartFile;

import io.github.pixee.security.Filenames;
import io.swagger.v3.oas.annotations.Operation;

import stirling.software.SPDF.model.api.GeneralFile;
import stirling.software.SPDF.service.CustomPDDocumentFactory;
import stirling.software.SPDF.utils.FileToPdf;
import stirling.software.SPDF.utils.WebResponseUtils;

// Disabled for now
// @RestController
// @Tag(name = "Convert", description = "Convert APIs")
// @RequestMapping("/api/v1/convert")
public class ConvertBookToPDFController {

    private final boolean bookAndHtmlFormatsInstalled;

    private final CustomPDDocumentFactory pdfDocumentFactory;

    // @Autowired
    public ConvertBookToPDFController(
            CustomPDDocumentFactory pdfDocumentFactory,
            @Qualifier("bookAndHtmlFormatsInstalled") boolean bookAndHtmlFormatsInstalled) {
        this.pdfDocumentFactory = pdfDocumentFactory;
        this.bookAndHtmlFormatsInstalled = bookAndHtmlFormatsInstalled;
    }

    @PostMapping(consumes = "multipart/form-data", value = "/book/pdf")
    @Operation(
            summary =
                    "Convert a BOOK/comic (*.epub | *.mobi | *.azw3 | *.fb2 | *.txt | *.docx) to PDF",
            description =
                    "(Requires bookAndHtmlFormatsInstalled flag and Calibre installed) This endpoint takes an BOOK/comic (*.epub | *.mobi | *.azw3 | *.fb2 | *.txt | *.docx)  input and converts it to PDF format.")
    public ResponseEntity<byte[]> HtmlToPdf(@ModelAttribute GeneralFile request) throws Exception {
        MultipartFile fileInput = request.getFileInput();

        if (!bookAndHtmlFormatsInstalled) {
            throw new IllegalArgumentException(
                    "bookAndHtmlFormatsInstalled flag is False, this functionality is not available");
        }

        if (fileInput == null) {
            throw new IllegalArgumentException("Please provide a file for conversion.");
        }

        String originalFilename = Filenames.toSimpleFileName(fileInput.getOriginalFilename());

        if (originalFilename != null) {
            String originalFilenameLower = originalFilename.toLowerCase();
            if (!originalFilenameLower.endsWith(".epub")
                    && !originalFilenameLower.endsWith(".mobi")
                    && !originalFilenameLower.endsWith(".azw3")
                    && !originalFilenameLower.endsWith(".fb2")
                    && !originalFilenameLower.endsWith(".txt")
                    && !originalFilenameLower.endsWith(".docx")) {
                throw new IllegalArgumentException(
                        "File must be in .epub, .mobi, .azw3, .fb2, .txt, or .docx format.");
            }
        }
        byte[] pdfBytes = FileToPdf.convertBookTypeToPdf(fileInput.getBytes(), originalFilename);

        String outputFilename =
                originalFilename.replaceFirst("[.][^.]+$", "")
                        + ".pdf"; // Remove file extension and append .pdf

        return WebResponseUtils.bytesToWebResponse(pdfBytes, outputFilename);
    }
}
