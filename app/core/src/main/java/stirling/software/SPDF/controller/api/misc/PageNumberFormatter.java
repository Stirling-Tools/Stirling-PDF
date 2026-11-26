package stirling.software.SPDF.controller.api.misc;

import java.util.Locale;

final class PageNumberFormatter {

    private static final int MAX_FORMATTED_LABEL_LENGTH = 4096;

    private PageNumberFormatter() {}

    static String format(int value, String numberFormat) {
        String normalized =
                numberFormat == null ? "" : numberFormat.trim().toLowerCase(Locale.ROOT);
        return switch (normalized) {
            case "roman-uppercase" -> toRoman(value);
            case "roman-lowercase" -> toRoman(value).toLowerCase(Locale.ROOT);
            case "alpha-uppercase" -> toAlphabetic(value);
            case "alpha-lowercase" -> toAlphabetic(value).toLowerCase(Locale.ROOT);
            default -> Integer.toString(value);
        };
    }

    static String toAlphabetic(int value) {
        if (value <= 0) {
            return Integer.toString(value);
        }

        StringBuilder letters = new StringBuilder();
        while (value > 0) {
            value--;
            letters.append((char) ('A' + value % 26));
            value /= 26;
        }
        return letters.reverse().toString();
    }

    static String toRoman(int value) {
        if (value <= 0) {
            return Integer.toString(value);
        }

        int thousands = value / 1000;
        String remainder = toRomanBelowThousand(value % 1000);
        if (thousands + remainder.length() > MAX_FORMATTED_LABEL_LENGTH) {
            throw new IllegalArgumentException(
                    "Roman numeral label exceeds the maximum length of "
                            + MAX_FORMATTED_LABEL_LENGTH
                            + " characters");
        }
        return "M".repeat(thousands) + remainder;
    }

    private static String toRomanBelowThousand(int value) {
        int[] values = {900, 500, 400, 100, 90, 50, 40, 10, 9, 5, 4, 1};
        String[] symbols = {"CM", "D", "CD", "C", "XC", "L", "XL", "X", "IX", "V", "IV", "I"};
        StringBuilder roman = new StringBuilder();
        for (int i = 0; i < values.length; i++) {
            while (value >= values[i]) {
                roman.append(symbols[i]);
                value -= values[i];
            }
        }
        return roman.toString();
    }
}
