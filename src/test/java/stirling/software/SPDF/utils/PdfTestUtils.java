package stirling.software.SPDF.utils;

import java.io.IOException;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.text.PDFTextStripper;

/**
 * Utility class for PDF testing. Provides methods to extract text from PDF files and compare their
 * content.
 */
public class PdfTestUtils {

    /**
     * Extracts text content from a PDF byte array.
     *
     * @param pdfBytes The PDF content as a byte array
     * @return The extracted text
     * @throws IOException If there's an error processing the PDF
     */
    public static String extractTextFromPdf(byte[] pdfBytes) throws IOException {
        try (PDDocument document = Loader.loadPDF(pdfBytes)) {
            PDFTextStripper stripper = new PDFTextStripper();
            return stripper.getText(document);
        }
    }

    /**
     * Checks if the PDF contains specific text.
     *
     * @param pdfBytes The PDF content as a byte array
     * @param expectedText The text to look for
     * @return true if the text is found, false otherwise
     * @throws IOException If there's an error processing the PDF
     */
    public static boolean pdfContainsText(byte[] pdfBytes, String expectedText) throws IOException {
        String extractedText = extractTextFromPdf(pdfBytes);
        return extractedText.contains(expectedText);
    }

    /**
     * Gets the number of pages in a PDF document.
     *
     * @param pdfBytes The PDF content as a byte array
     * @return The number of pages
     * @throws IOException If there's an error processing the PDF
     */
    public static int getPageCount(byte[] pdfBytes) throws IOException {
        try (PDDocument document = Loader.loadPDF(pdfBytes)) {
            return document.getNumberOfPages();
        }
    }

    /**
     * Checks if a byte array has a valid PDF header.
     *
     * @param content The byte array to check
     * @return true if it has a valid PDF header, false otherwise
     */
    public static boolean hasValidPdfHeader(byte[] content) {
        if (content == null || content.length < 5) {
            return false;
        }

        // Check for PDF magic number (%PDF-)
        return content[0] == '%'
                && content[1] == 'P'
                && content[2] == 'D'
                && content[3] == 'F'
                && content[4] == '-';
    }
}
