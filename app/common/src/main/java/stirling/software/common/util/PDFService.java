package stirling.software.common.util;

import java.io.IOException;
import java.util.List;

import org.apache.pdfbox.multipdf.PDFMergerUtility;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.springframework.stereotype.Service;

import lombok.RequiredArgsConstructor;

import stirling.software.common.service.CustomPDFDocumentFactory;

@Service
@RequiredArgsConstructor
public class PDFService {

    private final CustomPDFDocumentFactory pdfDocumentFactory;

    /*
     * Merge multiple PDF documents into a single PDF document
     *
     * @param documents List of PDDocument to be merged
     * @return Merged PDDocument
     * @throws IOException If an error occurs during merging
     */
    public PDDocument mergeDocuments(List<PDDocument> documents) throws IOException {
        PDDocument merged = pdfDocumentFactory.createNewDocument();
        PDFMergerUtility merger = new PDFMergerUtility();
        for (PDDocument doc : documents) {
            merger.appendDocument(merged, doc);
        }
        return merged;
    }
}
