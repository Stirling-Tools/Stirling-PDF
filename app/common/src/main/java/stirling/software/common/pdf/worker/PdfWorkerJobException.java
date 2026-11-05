package stirling.software.common.pdf.worker;

import java.io.IOException;

/** The job itself failed (for example a corrupt PDF); the worker that ran it is still healthy. */
public class PdfWorkerJobException extends IOException {

    public PdfWorkerJobException(String message, String causeChain) {
        super(
                message,
                causeChain == null || causeChain.isEmpty() ? null : new IOException(causeChain));
    }
}
