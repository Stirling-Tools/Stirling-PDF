package stirling.software.proprietary.model.docparse;

/** One sub-document page range (1-based, inclusive). Mirrors {@code docparse.py SplitPart}. */
public record SplitPart(int startPage, int endPage, String label, double confidence) {}
