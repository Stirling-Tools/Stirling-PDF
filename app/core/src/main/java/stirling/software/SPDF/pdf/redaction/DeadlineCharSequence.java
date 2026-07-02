package stirling.software.SPDF.pdf.redaction;

/** Wraps a match subject so a runaway (catastrophic-backtracking) regex aborts instead of hanging the request thread: every {@link #charAt(int)} the matcher performs checks a wall-clock deadline and throws once it is exceeded. The thrown {@link RegexTimeoutException} is a {@link RuntimeException}, so the redaction match sites' existing fail-closed catches handle it. */
final class DeadlineCharSequence implements CharSequence {

    /** Per-match wall-clock budget. A legitimate whole-document match finishes far inside this. */
    static final long DEFAULT_BUDGET_MILLIS = 2_000L;

    static final class RegexTimeoutException extends RuntimeException {
        RegexTimeoutException(long budgetMillis) {
            super("Regex evaluation exceeded " + budgetMillis + " ms (possible ReDoS)");
        }
    }

    private final CharSequence inner;
    private final long deadlineNanos;
    private final long budgetMillis;

    private DeadlineCharSequence(CharSequence inner, long budgetMillis) {
        this.inner = inner;
        this.budgetMillis = budgetMillis;
        this.deadlineNanos = System.nanoTime() + budgetMillis * 1_000_000L;
    }

    /** Wrap {@code text} with the default budget; null becomes an empty sequence. */
    static DeadlineCharSequence of(String text) {
        return new DeadlineCharSequence(text == null ? "" : text, DEFAULT_BUDGET_MILLIS);
    }

    @Override
    public char charAt(int index) {
        if (System.nanoTime() > deadlineNanos) {
            throw new RegexTimeoutException(budgetMillis);
        }
        return inner.charAt(index);
    }

    @Override
    public int length() {
        return inner.length();
    }

    @Override
    public CharSequence subSequence(int start, int end) {
        return inner.subSequence(start, end);
    }

    @Override
    public String toString() {
        return inner.toString();
    }
}
