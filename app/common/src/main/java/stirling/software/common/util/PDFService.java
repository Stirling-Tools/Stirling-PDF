package stirling.software.common.util;

import java.io.IOException;
import java.util.List;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.springframework.stereotype.Service;

import lombok.RequiredArgsConstructor;

import stirling.software.common.service.CustomPDFDocumentFactory;

@Service
@RequiredArgsConstructor
public class PDFService {

    private final CustomPDFDocumentFactory pdfDocumentFactory;

    /**
     * Merges the given documents into a new PDDocument. Caller owns/should close the result.
     *
     * @param documents The list of PDDocuments to merge
     * @return A new PDDocument containing the merged pages
     * @throws IOException If an error occurs during merging
     */
    public PDDocument mergeDocuments(List<PDDocument> documents) throws IOException {
        PDDocument merged = pdfDocumentFactory.createNewDocument();
        for (PDDocument doc : documents) {
            for (PDPage page : doc.getPages()) {
                merged.addPage(page);
            }
        }
        return merged;
    }
}
