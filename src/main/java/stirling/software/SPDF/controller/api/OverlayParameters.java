package stirling.software.SPDF.controller.api;

import java.io.File;
import java.util.List;

public class OverlayParameters {

    private final int basePageCount;
    private final File[] overlayFiles;
    private final String mode;
    private final int[] counts;
    private final List<File> tempFiles;

    public OverlayParameters(
            int basePageCount,
            File[] overlayFiles,
            String mode,
            int[] counts,
            List<File> tempFiles) {
        this.basePageCount = basePageCount;
        this.overlayFiles = overlayFiles;
        this.mode = mode;
        this.counts = counts;
        this.tempFiles = tempFiles;
    }

    public int getBasePageCount() {
        return basePageCount;
    }

    public File[] getOverlayFiles() {
        return overlayFiles;
    }

    public String getMode() {
        return mode;
    }

    public int[] getCounts() {
        return counts;
    }

    public List<File> getTempFiles() {
        return tempFiles;
    }
}
