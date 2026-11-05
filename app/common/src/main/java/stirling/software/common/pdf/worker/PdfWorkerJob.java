package stirling.software.common.pdf.worker;

import java.io.DataInputStream;
import java.io.DataOutputStream;
import java.io.IOException;

/**
 * A job-level PDFium operation that can run in this JVM or in a worker process. Requests and
 * results are file paths plus small values, never document bytes.
 */
public interface PdfWorkerJob<R> {

    /** Stable wire name; the worker looks up its handler by this. */
    String type();

    void writeRequest(DataOutputStream out) throws IOException;

    R readResult(DataInputStream in) throws IOException;

    /** Runs the job in this JVM, under this JVM's PDFium lock. */
    R run() throws IOException;
}
