package stirling.software.SPDF.pdf.signature;

import java.time.DateTimeException;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.util.Calendar;

import org.apache.commons.lang3.StringUtils;

import stirling.software.common.util.ExceptionUtils;

/**
 * The words on a visible signature, fixed at signing time in the signer's language and time zone,
 * so every reader sees the stamp the signer saw. The date is always written as {@code 2026.11.24
 * 10:12:00 +01'00'}, whatever the language.
 *
 * @param watermark the logo drawn faded behind the whole stamp, or null for none
 * @param graphic what fills the half beside the details
 * @param image the signer's own image (a handwritten signature, a seal) for {@link Graphic#IMAGE}
 * @param signedByLabel the "signed by" line with a single {@value #NAME} where the certificate's
 *     name goes, so languages that put the name first can
 */
public record StampStyle(
        byte[] watermark,
        Graphic graphic,
        byte[] image,
        ZoneId zone,
        String signedByLabel,
        String dateLabel,
        String reasonLabel,
        String locationLabel) {

    /** What fills the half beside the details: the signer's name, their own image, or nothing. */
    public enum Graphic {
        NAME,
        IMAGE,
        NONE
    }

    public static final String NAME = "{name}";
    static final String DEFAULT_SIGNED_BY = "Digitally signed by " + NAME;
    static final String DEFAULT_DATE = "Date:";
    static final String DEFAULT_REASON = "Reason:";
    static final String DEFAULT_LOCATION = "Location:";
    private static final int MAX_LABEL_LENGTH = 200;
    private static final DateTimeFormatter STAMP_DATE =
            DateTimeFormatter.ofPattern("yyyy.MM.dd HH:mm:ss");

    public static StampStyle defaults(byte[] watermark) {
        return new StampStyle(
                watermark,
                Graphic.NAME,
                null,
                ZoneId.systemDefault(),
                DEFAULT_SIGNED_BY,
                DEFAULT_DATE,
                DEFAULT_REASON,
                DEFAULT_LOCATION);
    }

    /**
     * Reads the request's optional settings; each blank one keeps its English default.
     *
     * @throws IllegalArgumentException for an unknown graphic or time zone, an IMAGE graphic
     *     without an image, a label over 200 characters, or a signed-by label without exactly one
     *     {@value #NAME}
     */
    public static StampStyle of(
            byte[] watermark,
            String graphic,
            byte[] image,
            String timeZone,
            String signedByLabel,
            String dateLabel,
            String reasonLabel,
            String locationLabel) {
        Graphic resolvedGraphic;
        try {
            resolvedGraphic =
                    StringUtils.isBlank(graphic) ? Graphic.NAME : Graphic.valueOf(graphic);
        } catch (IllegalArgumentException e) {
            throw invalid("stampGraphic " + graphic + " - use NAME, IMAGE or NONE");
        }
        if (resolvedGraphic == Graphic.IMAGE && image == null) {
            throw invalid("signatureImage - stampGraphic IMAGE needs an image");
        }
        ZoneId zone;
        try {
            zone = StringUtils.isBlank(timeZone) ? ZoneId.systemDefault() : ZoneId.of(timeZone);
        } catch (DateTimeException e) {
            throw invalid("timeZone " + timeZone + " - not a known time zone");
        }
        String signedBy = label("signedByLabel", signedByLabel, DEFAULT_SIGNED_BY);
        if (StringUtils.countMatches(signedBy, NAME) != 1) {
            throw invalid("signedByLabel - needs exactly one " + NAME);
        }
        return new StampStyle(
                watermark,
                resolvedGraphic,
                resolvedGraphic == Graphic.IMAGE ? image : null,
                zone,
                signedBy,
                label("dateLabel", dateLabel, DEFAULT_DATE),
                label("reasonLabel", reasonLabel, DEFAULT_REASON),
                label("locationLabel", locationLabel, DEFAULT_LOCATION));
    }

    public String signedBy(String name) {
        return signedByLabel.replace(NAME, name);
    }

    public String date(Calendar signDate) {
        ZonedDateTime time = signDate.toInstant().atZone(zone);
        int offsetMinutes = time.getOffset().getTotalSeconds() / 60;
        String offset =
                String.format(
                        "%s%02d'%02d'",
                        offsetMinutes < 0 ? "-" : "+",
                        Math.abs(offsetMinutes) / 60,
                        Math.abs(offsetMinutes) % 60);
        return dateLabel + " " + STAMP_DATE.format(time) + " " + offset;
    }

    public String reason(String reason) {
        return reasonLabel + " " + reason;
    }

    public String location(String location) {
        return locationLabel + " " + location;
    }

    private static String label(String field, String value, String fallback) {
        if (StringUtils.isBlank(value)) {
            return fallback;
        }
        if (value.length() > MAX_LABEL_LENGTH) {
            throw invalid(field + " - at most 200 characters");
        }
        return value.strip();
    }

    private static IllegalArgumentException invalid(String detail) {
        return ExceptionUtils.createIllegalArgumentException(
                "error.invalidArgument", "Invalid argument: {0}", detail);
    }
}
