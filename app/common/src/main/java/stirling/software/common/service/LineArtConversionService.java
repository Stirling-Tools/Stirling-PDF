package stirling.software.common.service;

import java.io.IOException;
import java.nio.file.Path;

/**
 * Converts every raster image in a PDF to bilevel line art. Present only in builds that ship the
 * proprietary module; callers must treat a missing bean as "line art unavailable".
 */
public interface LineArtConversionService {

    /**
     * Writes a copy of {@code input} to {@code output} with each image reduced to black and white.
     * {@code threshold} is the 0-100 cut-off percentage and {@code edgeLevel} the 1-3 edge
     * emphasis.
     */
    void convertToLineArt(Path input, Path output, double threshold, int edgeLevel)
            throws IOException;
}
