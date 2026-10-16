package stirling.software.proprietary.pdf;

/** An element plus the 1-based pages it came from; pageEnd widens when a page break is joined. */
record Element(Object value, int pageStart, int pageEnd) {}
