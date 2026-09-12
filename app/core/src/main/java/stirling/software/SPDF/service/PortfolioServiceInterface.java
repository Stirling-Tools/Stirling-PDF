package stirling.software.SPDF.service;

import java.io.IOException;
import java.util.List;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.springframework.web.multipart.MultipartFile;

public interface PortfolioServiceInterface {

    /** Returns true when the document is an Adobe PDF Portfolio (has a /Collection dictionary). */
    boolean isPortfolio(PDDocument document);

    /** Builds a new PDF Portfolio wrapping the supplied files behind a cover page. */
    PDDocument createPortfolio(List<MultipartFile> files, String coverTitle) throws IOException;

    /** Removes the /Collection dictionary so a portfolio opens as a normal PDF with attachments. */
    PDDocument flattenPortfolio(PDDocument document);
}
