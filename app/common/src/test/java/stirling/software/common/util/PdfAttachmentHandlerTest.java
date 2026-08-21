package stirling.software.common.util;

import static org.junit.jupiter.api.Assertions.*;

import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.Date;
import java.util.GregorianCalendar;

import org.junit.jupiter.api.Test;

class PdfAttachmentHandlerTest {

    @Test
    void formatEmailDate_nullDate_returnsEmptyString() {
        assertEquals("", PdfAttachmentHandler.formatEmailDate((Date) null));
    }

    @Test
    void formatEmailDate_nullZonedDateTime_returnsEmptyString() {
        assertEquals("", PdfAttachmentHandler.formatEmailDate((ZonedDateTime) null));
    }

    @Test
    void formatEmailDate_validDate_returnsFormattedString() {
        // Create a date: January 15, 2024 10:30 AM UTC
        GregorianCalendar cal = new GregorianCalendar(java.util.TimeZone.getTimeZone("UTC"));
        cal.set(2024, 0, 15, 10, 30, 0);
        cal.set(java.util.Calendar.MILLISECOND, 0);
        Date date = cal.getTime();

        String result = PdfAttachmentHandler.formatEmailDate(date);
        assertNotNull(result);
        assertFalse(result.isEmpty());
        // Should contain the date components
        assertTrue(result.contains("2024"));
        assertTrue(result.contains("Jan"));
        assertTrue(result.contains("15"));
    }

    @Test
    void formatEmailDate_zonedDateTime_returnsUTCFormatted() {
        ZonedDateTime dateTime =
                ZonedDateTime.of(2024, 3, 15, 14, 30, 0, 0, ZoneId.of("America/New_York"));
        String result = PdfAttachmentHandler.formatEmailDate(dateTime);
        assertNotNull(result);
        assertFalse(result.isEmpty());
        // Should be converted to UTC
        assertTrue(result.contains("UTC"));
        assertTrue(result.contains("2024"));
    }

    @Test
    void processInlineImages_nullHtmlContent_returnsNull() {
        String result = PdfAttachmentHandler.processInlineImages(null, null);
        assertNull(result);
    }

    @Test
    void processInlineImages_nullEmailContent_returnsOriginal() {
        String html = "<html><body>test</body></html>";
        String result = PdfAttachmentHandler.processInlineImages(html, null);
        assertEquals(html, result);
    }

    @Test
    void processInlineImages_noCidReferences_returnsOriginal() {
        EmlParser.EmailContent emailContent = new EmlParser.EmailContent();
        String html = "<html><body><img src='test.png'/></body></html>";
        String result = PdfAttachmentHandler.processInlineImages(html, emailContent);
        assertEquals(html, result);
    }

    @Test
    void markerPosition_constructorAndGetters() {
        PdfAttachmentHandler.MarkerPosition pos =
                new PdfAttachmentHandler.MarkerPosition(2, 100.5f, 200.3f, "@", "test.pdf");
        assertEquals(2, pos.getPageIndex());
        assertEquals(100.5f, pos.getX(), 0.001f);
        assertEquals(200.3f, pos.getY(), 0.001f);
        assertEquals("@", pos.getCharacter());
        assertEquals("test.pdf", pos.getFilename());
    }

    @Test
    void markerPosition_setters() {
        PdfAttachmentHandler.MarkerPosition pos =
                new PdfAttachmentHandler.MarkerPosition(0, 0f, 0f, "@", null);
        pos.setPageIndex(5);
        pos.setX(50.0f);
        pos.setY(75.0f);
        pos.setFilename("doc.pdf");
        assertEquals(5, pos.getPageIndex());
        assertEquals(50.0f, pos.getX(), 0.001f);
        assertEquals(75.0f, pos.getY(), 0.001f);
        assertEquals("doc.pdf", pos.getFilename());
    }
}
