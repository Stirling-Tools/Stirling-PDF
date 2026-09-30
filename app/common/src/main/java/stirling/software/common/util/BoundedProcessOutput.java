package stirling.software.common.util;

/** Keeps the beginning and end of a process stream without retaining an unbounded log. */
final class BoundedProcessOutput {
    static final int LIMIT = 1 << 20;
    private static final int HALF = LIMIT / 2;
    private final StringBuilder head = new StringBuilder();
    private char[] tail;
    private int position;
    private int tailSize;
    private long characters;
    private boolean hasLines;

    /** Returns whether the stream is still within the live-log budget. */
    boolean add(String line) {
        boolean log = characters < LIMIT;
        if (hasLines) append("\n");
        hasLines = true;
        append(line);
        return log;
    }

    private void append(String value) {
        characters += value.length();
        int prefix = Math.min(HALF - head.length(), value.length());
        head.append(value, 0, prefix);
        if (prefix == value.length()) return;
        if (tail == null) tail = new char[HALF];
        int start = Math.max(prefix, value.length() - HALF);
        int length = value.length() - start;
        int first = Math.min(length, HALF - position);
        value.getChars(start, start + first, tail, position);
        value.getChars(start + first, value.length(), tail, 0);
        position = (position + length) % HALF;
        tailSize = Math.min(HALF, tailSize + length);
    }

    boolean isEmpty() {
        return !hasLines;
    }

    @Override
    public String toString() {
        StringBuilder result = new StringBuilder(head);
        if (characters > LIMIT) result.append("\n[... process output truncated ...]\n");
        if (tailSize < HALF) {
            if (tailSize > 0) result.append(tail, 0, tailSize);
        } else {
            result.append(tail, position, HALF - position);
            result.append(tail, 0, position);
        }
        return result.toString();
    }
}
