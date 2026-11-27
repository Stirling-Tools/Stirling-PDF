package stirling.software.SPDF.pdf.signature;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.time.Instant;
import java.util.Calendar;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

class StampStyleTest {

    private static final Calendar SIGNED = calendar("2026-11-24T10:12:05Z");

    private static Calendar calendar(String instant) {
        Calendar calendar = Calendar.getInstance();
        calendar.setTimeInMillis(Instant.parse(instant).toEpochMilli());
        return calendar;
    }

    @Test
    void withNothingSetTheLabelsAreTheEnglishOnes() {
        StampStyle style = StampStyle.of(null, null, null, "UTC", null, null, null, null);
        assertEquals("Digitally signed by Ada Lovelace", style.signedBy("Ada Lovelace"));
        assertEquals("Date: 2026.11.24 10:12:05 +00'00'", style.date(SIGNED));
        assertEquals("Reason: Approved", style.reason("Approved"));
        assertEquals("Location: Leeds", style.location("Leeds"));
    }

    @Test
    void theDateIsWrittenInTheSignersTimeZoneWithItsOffset() {
        assertTrue(
                StampStyle.of(null, null, null, "Asia/Kolkata", null, null, null, null)
                        .date(SIGNED)
                        .endsWith("2026.11.24 15:42:05 +05'30'"));
        assertTrue(
                StampStyle.of(null, null, null, "America/New_York", null, null, null, null)
                        .date(SIGNED)
                        .endsWith("2026.11.24 05:12:05 -05'00'"));
    }

    @Test
    void theLabelsComeFromTheSignersLanguage() {
        StampStyle style =
                StampStyle.of(null, null, null, "UTC", "{name} が署名", "日付:", "理由:", "場所:");
        assertEquals("山田 が署名", style.signedBy("山田"));
        assertTrue(style.date(SIGNED).startsWith("日付: 2026.11.24"));
        assertEquals("理由: 承認", style.reason("承認"));
    }

    @Test
    void anUnknownTimeZoneIsRefused() {
        IllegalArgumentException error =
                assertThrows(
                        IllegalArgumentException.class,
                        () ->
                                StampStyle.of(
                                        null, null, null, "Mars/Olympus", null, null, null, null));
        assertTrue(error.getMessage().contains("timeZone"), error.getMessage());
    }

    @ParameterizedTest
    @ValueSource(strings = {"Signed by", "{name} and {name}"})
    void theSignedByLabelNeedsTheNameExactlyOnce(String label) {
        IllegalArgumentException error =
                assertThrows(
                        IllegalArgumentException.class,
                        () -> StampStyle.of(null, null, null, "UTC", label, null, null, null));
        assertTrue(error.getMessage().contains("signedByLabel"), error.getMessage());
    }

    @Test
    void anOverlongLabelIsRefused() {
        String label = "x".repeat(201);
        IllegalArgumentException error =
                assertThrows(
                        IllegalArgumentException.class,
                        () -> StampStyle.of(null, null, null, "UTC", null, label, null, null));
        assertTrue(error.getMessage().contains("dateLabel"), error.getMessage());
    }

    @Test
    void anImageGraphicNeedsAnImage() {
        IllegalArgumentException error =
                assertThrows(
                        IllegalArgumentException.class,
                        () -> StampStyle.of(null, "IMAGE", null, "UTC", null, null, null, null));
        assertTrue(error.getMessage().contains("signatureImage"), error.getMessage());
    }

    @Test
    void anUnknownGraphicIsRefused() {
        IllegalArgumentException error =
                assertThrows(
                        IllegalArgumentException.class,
                        () -> StampStyle.of(null, "LOGO", null, "UTC", null, null, null, null));
        assertTrue(error.getMessage().contains("stampGraphic"), error.getMessage());
    }

    @Test
    void theImageIsKeptOnlyForTheImageGraphic() {
        byte[] png = {1};
        assertEquals(
                StampStyle.Graphic.NAME,
                StampStyle.of(null, null, png, "UTC", null, null, null, null).graphic());
        assertEquals(null, StampStyle.of(null, "NONE", png, "UTC", null, null, null, null).image());
    }
}
