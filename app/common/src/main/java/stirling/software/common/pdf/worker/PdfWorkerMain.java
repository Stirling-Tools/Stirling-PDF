package stirling.software.common.pdf.worker;

import java.io.BufferedInputStream;
import java.io.BufferedOutputStream;
import java.io.DataInputStream;
import java.io.DataOutputStream;
import java.io.EOFException;
import java.io.FileDescriptor;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.PrintStream;
import java.util.Map;

import stirling.software.jpdfium.PdfDocument;
import stirling.software.jpdfium.panama.NativeLoader;

/**
 * Entry point of a PDF worker process: one job at a time over stdin/stdout. Exits when stdin
 * closes, so a worker never outlives the server that started it.
 */
public final class PdfWorkerMain {

    interface Handler {
        void handle(DataInputStream in, DataOutputStream out) throws IOException;
    }

    private static final Map<String, Handler> HANDLERS =
            Map.of(MergeJob.TYPE, PdfWorkerMain::handleMerge);

    private PdfWorkerMain() {}

    public static void main(String[] args) throws IOException {
        // Keep stdout for frames only; anything else that prints goes to stderr.
        FileOutputStream protocolOut = new FileOutputStream(FileDescriptor.out);
        System.setOut(new PrintStream(new FileOutputStream(FileDescriptor.err), true));
        warmUp();
        serve(
                new DataInputStream(new BufferedInputStream(System.in, 64 * 1024)),
                new DataOutputStream(new BufferedOutputStream(protocolOut, 64 * 1024)),
                HANDLERS);
    }

    static void serve(DataInputStream in, DataOutputStream out, Map<String, Handler> handlers)
            throws IOException {
        PdfWorkerProtocol.writeHeader(out);
        out.writeByte(PdfWorkerProtocol.STATUS_READY);
        out.flush();
        while (true) {
            String type;
            try {
                PdfWorkerProtocol.readHeader(in);
                type = PdfWorkerProtocol.readString(in);
            } catch (EOFException closed) {
                return;
            }
            Handler handler = handlers.get(type);
            if (handler == null) {
                // The payload can't be skipped without knowing its shape, so answer and stop.
                writeError(out, new IOException("Unknown PDF worker job: " + type));
                return;
            }
            handler.handle(in, out);
            out.flush();
        }
    }

    private static void handleMerge(DataInputStream in, DataOutputStream out) throws IOException {
        MergeJob job = MergeJob.readRequest(in);
        MergeJob.Result result;
        try {
            result = job.run();
        } catch (Exception | LinkageError e) {
            writeError(out, e);
            return;
        }
        PdfWorkerProtocol.writeHeader(out);
        out.writeByte(PdfWorkerProtocol.STATUS_OK);
        MergeJob.writeResult(out, result);
    }

    static void writeError(DataOutputStream out, Throwable error) throws IOException {
        PdfWorkerProtocol.writeHeader(out);
        out.writeByte(PdfWorkerProtocol.STATUS_ERROR);
        PdfWorkerProtocol.writeString(out, String.valueOf(error.getMessage()));
        PdfWorkerProtocol.writeString(out, PdfWorkerProtocol.describe(error));
        out.flush();
    }

    private static void warmUp() {
        // Fails before READY if the natives can't load, so the pool falls back in-process.
        NativeLoader.ensureLoaded();
        try (PdfDocument ignored = PdfDocument.open(new byte[0])) {
        } catch (Exception | LinkageError ignored) {
        }
    }
}
