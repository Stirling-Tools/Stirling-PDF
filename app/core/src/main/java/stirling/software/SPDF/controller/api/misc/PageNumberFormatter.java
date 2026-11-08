package stirling.software.SPDF.controller.api.misc;

import java.util.Locale;

final class PageNumberFormatter {

    private static final int MAX_ROMAN_VALUE = 3999;

    private PageNumberFormatter() {}

    static String format(int value, String numberFormat) {
        String normalized =
                numberFormat == null ? "" : numberFormat.trim().toLowerCase(Locale.ROOT);
        return switch (normalized) {
            case "roman-uppercase" -> toRoman(value);
            case "roman-lowercase" -> toRoman(value).toLowerCase(Locale.ROOT);
            default -> Integer.toString(value);
        };
    }

    static String toRoman(int value) {
        if (value <= 0 || value > MAX_ROMAN_VALUE) {
            return Integer.toString(value);
        }

        int[] values = {1000, 900, 500, 400, 100, 90, 50, 40, 10, 9, 5, 4, 1};
        String[] symbols = {"M", "CM", "D", "CD", "C", "XC", "L", "XL", "X", "IX", "V", "IV", "I"};
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
