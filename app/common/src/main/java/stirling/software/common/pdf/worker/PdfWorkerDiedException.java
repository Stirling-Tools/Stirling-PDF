package stirling.software.common.pdf.worker;

import java.io.IOException;

/** The worker process ended or broke protocol while the job was in flight. */
final class PdfWorkerDiedException extends IOException {

    PdfWorkerDiedException(String message) {
        super(message);
    }

    PdfWorkerDiedException(String message, Throwable cause) {
        super(message, cause);
    }
}
