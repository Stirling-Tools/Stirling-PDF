package stirling.software.SPDF.service.toolscore;

/** Percentages from 0 to 200, where 100 leaves that property unchanged. */
public record ColorAdjustments(
        double contrast,
        double brightness,
        double saturation,
        double red,
        double green,
        double blue) {}
