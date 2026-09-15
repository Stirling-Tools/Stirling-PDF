package stirling.software.SPDF.pdf.redaction;

/**
 * Wraps a match subject so a runaway (catastrophic-backtracking) regex aborts instead of hanging
 * the request thread: every {@link #charAt(int)} the matcher performs checks a wall-clock deadline
 * and throws once it is exceeded. The thrown {@link RegexTimeoutException} is a {@link
 * RuntimeException}, so the redaction match sites' existing fail-closed catches handle it.
 *
 * <p>Pipeline phases call {@link #armSharedBudget()} so every match in the phase draws from ONE
 * budget; otherwise each token would get its own budget and the guard would not bound the request.
 */
final class DeadlineCharSequence implements CharSequence {

    /** Per-match wall-clock budget used when no shared phase budget is armed. */
    static final long DEFAULT_BUDGET_MILLIS = 2_000L;

    /** Whole-phase budget; a legitimate whole-document pass finishes far inside this. */
    static final long SHARED_BUDGET_MILLIS = 30_000L;

    static final class RegexTimeoutException extends RuntimeException {
        RegexTimeoutException(long budgetMillis) {
            super("Regex evaluation exceeded " + budgetMillis + " ms (possible ReDoS)");
        }
    }

    /** Scope handle for an armed phase budget; close() restores the previous state. */
    interface BudgetScope extends AutoCloseable {
        @Override
        void close();
    }

    private static final ThreadLocal<Long> SHARED_DEADLINE = new ThreadLocal<>();

    private final CharSequence inner;
    private final long deadlineNanos;
    private final long budgetMillis;
    private int accessCount;

    private DeadlineCharSequence(CharSequence inner, long deadlineNanos, long budgetMillis) {
        this.inner = inner;
        this.deadlineNanos = deadlineNanos;
        this.budgetMillis = budgetMillis;
    }

    /**
     * Arm one shared budget for every subsequent {@link #of} on this thread until close(). An
     * already-armed outer scope wins so nesting keeps the outermost deadline.
     */
    static BudgetScope armSharedBudget() {
        Long prev = SHARED_DEADLINE.get();
        if (prev == null) {
            SHARED_DEADLINE.set(System.nanoTime() + SHARED_BUDGET_MILLIS * 1_000_000L);
            return SHARED_DEADLINE::remove;
        }
        return () -> {};
    }

    /** Wrap {@code text} with the armed shared budget, or a fresh default budget; null = empty. */
    static DeadlineCharSequence of(String text) {
        CharSequence inner = text == null ? "" : text;
        Long shared = SHARED_DEADLINE.get();
        if (shared != null) {
            return new DeadlineCharSequence(inner, shared, SHARED_BUDGET_MILLIS);
        }
        return new DeadlineCharSequence(
                inner,
                System.nanoTime() + DEFAULT_BUDGET_MILLIS * 1_000_000L,
                DEFAULT_BUDGET_MILLIS);
    }

    @Override
    public char charAt(int index) {
        // Poll the clock every 1024 accesses: keeps hot regex loops cheap while a
        // backtracking blow-up (millions of reads/ms) still trips almost instantly.
        if ((++accessCount & 1023) == 0 && System.nanoTime() > deadlineNanos) {
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
