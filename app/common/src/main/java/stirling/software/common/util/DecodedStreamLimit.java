package stirling.software.common.util;

import java.io.FilterOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.lang.reflect.Field;
import java.util.IdentityHashMap;
import java.util.Map;
import java.util.function.LongSupplier;

import org.apache.pdfbox.cos.COSDictionary;
import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.filter.DecodeOptions;
import org.apache.pdfbox.filter.DecodeResult;
import org.apache.pdfbox.filter.Filter;
import org.apache.pdfbox.filter.FilterFactory;
import org.springframework.stereotype.Component;

import jakarta.annotation.PostConstruct;

import lombok.extern.slf4j.Slf4j;

/**
 * Caps how far one PDF stream may decompress. PDFBox decodes every filter stage of a stream
 * completely into the heap with no bound, so a few kilobytes of Flate can expand past the heap, and
 * the server runs with ExitOnOutOfMemoryError.
 *
 * <p>PDFBox has no hook for this, so {@link #install()} wraps the filters in {@link
 * FilterFactory#INSTANCE} by reflection; every decode, from xref streams at load to images and
 * content at render, goes through them. The cap is the largest raster {@link ImageMemoryLimit}
 * allows, in bytes, so any image within that limit still decodes. It bounds each stream, not a
 * request: a page drawing one stream many times decodes it many times.
 */
@Slf4j
@Component
public class DecodedStreamLimit {

    @PostConstruct
    public void installAtStartup() {
        install();
    }

    /** Idempotent. Fails loudly in tests, not at runtime, if PDFBox's internals move. */
    public static synchronized void install() {
        Map<COSName, Filter> filters;
        try {
            filters = filterRegistry();
        } catch (ReflectiveOperationException | RuntimeException e) {
            log.error("Could not cap decoded PDF stream sizes; PDFBox's FilterFactory changed", e);
            return;
        }
        Map<Filter, Filter> bounded = new IdentityHashMap<>();
        // Values only: the map keeps its structure, so a concurrent lookup sees the old filter or
        // the new one, never a broken table.
        filters.replaceAll(
                (name, filter) ->
                        filter instanceof BoundedFilter
                                ? filter
                                : bounded.computeIfAbsent(
                                        filter,
                                        original ->
                                                new BoundedFilter(
                                                        original, DecodedStreamLimit::maxBytes)));
    }

    public static long maxBytes() {
        return ImageMemoryLimit.maxPixels() * ImageMemoryLimit.BYTES_PER_PIXEL;
    }

    @SuppressWarnings("unchecked")
    static Map<COSName, Filter> filterRegistry() throws ReflectiveOperationException {
        Field field = FilterFactory.class.getDeclaredField("filters");
        field.setAccessible(true);
        return (Map<COSName, Filter>) field.get(FilterFactory.INSTANCE);
    }

    /**
     * Delegates to a PDFBox filter, refusing output past the cap. One instance stands for each
     * original, as the original is shared between a name and its abbreviation, so PDFBox's removal
     * of duplicated filters still recognises them.
     */
    static final class BoundedFilter extends Filter {

        private final Filter delegate;
        private final LongSupplier maxBytes;

        BoundedFilter(Filter delegate, LongSupplier maxBytes) {
            this.delegate = delegate;
            this.maxBytes = maxBytes;
        }

        Filter delegate() {
            return delegate;
        }

        @Override
        public DecodeResult decode(
                InputStream encoded, OutputStream decoded, COSDictionary parameters, int index)
                throws IOException {
            return delegate.decode(encoded, bounded(decoded), parameters, index);
        }

        @Override
        public DecodeResult decode(
                InputStream encoded,
                OutputStream decoded,
                COSDictionary parameters,
                int index,
                DecodeOptions options)
                throws IOException {
            return delegate.decode(encoded, bounded(decoded), parameters, index, options);
        }

        @Override
        protected void encode(InputStream input, OutputStream encoded, COSDictionary parameters)
                throws IOException {
            // The public encode ignores its index and hands the delegate these same parameters.
            delegate.encode(input, encoded, parameters, 0);
        }

        private OutputStream bounded(OutputStream decoded) {
            return new BoundedOutputStream(decoded, maxBytes.getAsLong());
        }
    }

    private static final class BoundedOutputStream extends FilterOutputStream {

        private final long maxBytes;
        private long written;

        BoundedOutputStream(OutputStream out, long maxBytes) {
            super(out);
            this.maxBytes = maxBytes;
        }

        @Override
        public void write(int b) throws IOException {
            count(1);
            out.write(b);
        }

        @Override
        public void write(byte[] b, int off, int len) throws IOException {
            count(len);
            out.write(b, off, len);
        }

        private void count(int bytes) {
            written += bytes;
            if (written > maxBytes) {
                throw ExceptionUtils.createDecodedStreamTooLargeException(
                        Math.ceilDiv(maxBytes, 1024L * 1024));
            }
        }
    }
}
