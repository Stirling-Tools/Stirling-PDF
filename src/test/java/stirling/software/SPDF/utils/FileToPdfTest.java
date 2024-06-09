package stirling.software.SPDF.utils;

import static org.junit.jupiter.api.Assertions.*;

import java.io.IOException;

import org.junit.jupiter.api.Test;

import stirling.software.SPDF.model.api.converters.HTMLToPdfRequest;

public class FileToPdfTest {

    @Test
    public void testConvertHtmlToPdf() {
        HTMLToPdfRequest request = new HTMLToPdfRequest();
        byte[] fileBytes = new byte[10]; // Sample file bytes
        String fileName = "test.html"; // Sample file name
        boolean htmlFormatsInstalled = true; // Sample boolean value

        // Check if the method throws IOException
        assertThrows(IOException.class, () -> {
            FileToPdf.convertHtmlToPdf(request, fileBytes, fileName, htmlFormatsInstalled);
        });
    }

    @Test
    public void testConvertBookTypeToPdf() {
        byte[] bytes = new byte[10]; // Sample bytes
        String originalFilename = "test.epub"; // Sample original filename

        // Check if the method throws IOException
        assertThrows(IOException.class, () -> {
            FileToPdf.convertBookTypeToPdf(bytes, originalFilename);
        });
    }
}
