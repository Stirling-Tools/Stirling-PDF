package stirling.software.SPDF.controller.api.security;

import java.io.IOException;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.Semaphore;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.text.PDFTextStripper;
import org.apache.pdfbox.text.TextPosition;

import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.model.PDFText;

/**
 * Scans a PDF document once and matches all provided patterns in a single pass, collecting
 * bounding-box positions for every match. Use in place of creating one {@code TextFinder} per
 * search term to avoid O(n) full-document scans.
 */
@Slf4j
final class MultiPatternTextFinder extends PDFTextStripper {

    private static final long REGEX_MATCH_TIMEOUT_SECONDS = 30;

    /**
     * Matcher.find() ignores interruption, so a cancelled evaluation keeps burning a thread until
     * the regex returns. Without a cap, a burst of expensive patterns piles up unbounded spinning
     * threads, which is why submissions are limited rather than merely timed out. Virtual threads
     * are daemons, so the executor needs no shutdown hook for JVM exit.
     */
    private static final int MAX_CONCURRENT_REGEX_EVALUATIONS =
            Math.max(2, Runtime.getRuntime().availableProcessors());

    private static final Semaphore REGEX_SLOTS = new Semaphore(MAX_CONCURRENT_REGEX_EVALUATIONS);

    private static final ExecutorService REGEX_EXECUTOR =
            Executors.newVirtualThreadPerTaskExecutor();

    private final List<Pattern> patterns;
    private final Map<Integer, List<PDFText>> foundTextsByPage = new HashMap<>();

    private final List<TextPosition> pageTextPositions = new ArrayList<>();
    private final StringBuilder pageTextBuilder = new StringBuilder();

    MultiPatternTextFinder(List<Pattern> patterns) throws IOException {
        this.patterns = patterns;
        this.setWordSeparator(" ");
        this.setLineSeparator("\n");
    }

    Map<Integer, List<PDFText>> getFoundTextsByPage() {
        return foundTextsByPage;
    }

    @Override
    protected void startPage(PDPage page) throws IOException {
        super.startPage(page);
        pageTextPositions.clear();
        pageTextBuilder.setLength(0);
    }

    @Override
    protected void writeString(String text, List<TextPosition> textPositions) {
        pageTextBuilder.append(text);
        pageTextPositions.addAll(textPositions);
    }

    @Override
    protected void writeWordSeparator() {
        pageTextBuilder.append(getWordSeparator());
        pageTextPositions.add(null);
    }

    @Override
    protected void writeLineSeparator() {
        pageTextBuilder.append(getLineSeparator());
        pageTextPositions.add(null);
    }

    @Override
    protected void endPage(PDPage page) throws IOException {
        String text = pageTextBuilder.toString();
        if (!text.isEmpty()) {
            int pageIndex = getCurrentPageNo() - 1;
            for (Pattern pattern : patterns) {
                Matcher matcher = pattern.matcher(text);
                while (safeFind(matcher)) {
                    PDFText pdfText = resolveMatchPosition(matcher, pageIndex);
                    if (pdfText != null) {
                        foundTextsByPage
                                .computeIfAbsent(pageIndex, k -> new ArrayList<>())
                                .add(pdfText);
                    }
                }
            }
        }
        super.endPage(page);
    }

    /**
     * Wraps a single {@code matcher.find()} call with a {@value #REGEX_MATCH_TIMEOUT_SECONDS}
     * second timeout. Prevents pathological regex backtracking from blocking the request
     * indefinitely; per-match timeout so fast legitimate scans are unaffected.
     */
    private static boolean safeFind(Matcher matcher) throws IOException {
        boolean acquired;
        try {
            acquired = REGEX_SLOTS.tryAcquire(REGEX_MATCH_TIMEOUT_SECONDS, TimeUnit.SECONDS);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IOException("Regex match interrupted while queueing", e);
        }
        if (!acquired) {
            throw new IOException(
                    "Too many concurrent regex evaluations in flight (limit "
                            + MAX_CONCURRENT_REGEX_EVALUATIONS
                            + ")");
        }
        // The slot is released exactly once, either by the worker task or by the cancellation
        // path below: Matcher.find() ignores interruption, so a timed-out caller must not hand the
        // slot on while the cancelled evaluation is still spinning, but a worker that never started
        // releases nothing on its own. The started flag keeps that backpressure: the caller
        // releases only when the worker never ran. A start racing the cancel can still free the
        // slot under a spinning orphan; releaseOnce keeps that to a single release.
        AtomicBoolean started = new AtomicBoolean(false);
        AtomicBoolean released = new AtomicBoolean(false);
        Runnable releaseOnce =
                () -> {
                    if (released.compareAndSet(false, true)) {
                        REGEX_SLOTS.release();
                    }
                };
        return runBounded(matcher, started, releaseOnce);
    }

    private static boolean runBounded(Matcher matcher, AtomicBoolean started, Runnable releaseOnce)
            throws IOException {
        Future<Boolean> future;
        try {
            future =
                    REGEX_EXECUTOR.submit(
                            (java.util.concurrent.Callable<Boolean>)
                                    () -> {
                                        started.set(true);
                                        try {
                                            return matcher.find();
                                        } finally {
                                            releaseOnce.run();
                                        }
                                    });
        } catch (RuntimeException | Error e) {
            releaseOnce.run();
            throw e;
        }
        try {
            return future.get(REGEX_MATCH_TIMEOUT_SECONDS, TimeUnit.SECONDS);
        } catch (TimeoutException e) {
            future.cancel(true);
            if (!started.get()) {
                releaseOnce.run();
            }
            throw new IOException(
                    "Regex match timed out after "
                            + REGEX_MATCH_TIMEOUT_SECONDS
                            + "s — pattern may cause catastrophic backtracking");
        } catch (InterruptedException e) {
            future.cancel(true);
            if (!started.get()) {
                releaseOnce.run();
            }
            Thread.currentThread().interrupt();
            throw new IOException("Regex match interrupted", e);
        } catch (ExecutionException e) {
            Throwable cause = e.getCause();
            if (cause instanceof IOException ioEx) throw ioEx;
            throw new IOException("Regex match failed: " + cause.getMessage(), cause);
        }
    }

    private PDFText resolveMatchPosition(Matcher matcher, int pageIndex) {
        int matchStart = matcher.start();
        int matchEnd = matcher.end();

        float minX = Float.MAX_VALUE;
        float minY = Float.MAX_VALUE;
        float maxX = Float.MIN_VALUE;
        float maxY = Float.MIN_VALUE;
        boolean foundPosition = false;

        for (int i = matchStart; i < matchEnd; i++) {
            if (i >= pageTextPositions.size()) break;
            TextPosition pos = pageTextPositions.get(i);
            if (pos != null) {
                foundPosition = true;
                minX = Math.min(minX, pos.getX());
                maxX = Math.max(maxX, pos.getX() + pos.getWidth());
                minY = Math.min(minY, pos.getY() - pos.getHeight());
                maxY = Math.max(maxY, pos.getY());
            }
        }

        if (!foundPosition && matchStart < pageTextPositions.size()) {
            for (int i = Math.max(0, matchStart - 5);
                    i < Math.min(pageTextPositions.size(), matchEnd + 5);
                    i++) {
                TextPosition pos = pageTextPositions.get(i);
                if (pos != null) {
                    foundPosition = true;
                    minX = Math.min(minX, pos.getX());
                    maxX = Math.max(maxX, pos.getX() + pos.getWidth());
                    minY = Math.min(minY, pos.getY() - pos.getHeight());
                    maxY = Math.max(maxY, pos.getY());
                    break;
                }
            }
        }

        if (!foundPosition) {
            log.warn(
                    "Found text match '{}' but no valid position data at {}-{}",
                    matcher.group(),
                    matchStart,
                    matchEnd);
            return null;
        }

        return new PDFText(pageIndex, minX, minY, maxX, maxY, matcher.group());
    }
}
