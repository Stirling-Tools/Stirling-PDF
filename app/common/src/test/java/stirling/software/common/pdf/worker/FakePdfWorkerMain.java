package stirling.software.common.pdf.worker;

import java.io.BufferedInputStream;
import java.io.BufferedOutputStream;
import java.io.DataInputStream;
import java.io.DataOutputStream;
import java.io.FileDescriptor;
import java.io.FileOutputStream;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.Map;
import java.util.stream.Stream;

/** Worker main for pool tests: speaks the real protocol with no PDFium behind it. */
public final class FakePdfWorkerMain {

    private static final Duration BARRIER_TIMEOUT = Duration.ofSeconds(30);

    private FakePdfWorkerMain() {}

    public static void main(String[] args) throws IOException {
        FileOutputStream protocolOut = new FileOutputStream(FileDescriptor.out);
        PdfWorkerMain.serve(
                new DataInputStream(new BufferedInputStream(System.in)),
                new DataOutputStream(new BufferedOutputStream(protocolOut)),
                Map.of(TestJob.TYPE, FakePdfWorkerMain::handle));
    }

    private static void handle(DataInputStream in, DataOutputStream out) throws IOException {
        TestJob job = TestJob.readRequest(in);
        switch (job.action()) {
            case "crash" -> Runtime.getRuntime().halt(3);
            case "fail" -> {
                PdfWorkerMain.writeError(out, new IOException("Invalid PDF: " + job.value()));
                return;
            }
            case "noise" -> {
                out.writeBytes("not a frame");
                out.flush();
                return;
            }
            case "barrier" -> {
                boolean met = awaitParties(Path.of(job.value()), job.sleepMillis());
                writeOk(out, ProcessHandle.current().pid() + ":" + (met ? "met" : "missed"));
                return;
            }
            default -> {}
        }
        try {
            Thread.sleep(job.sleepMillis());
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
        writeOk(out, ProcessHandle.current().pid() + ":" + job.value());
    }

    private static void writeOk(DataOutputStream out, String result) throws IOException {
        PdfWorkerProtocol.writeHeader(out);
        out.writeByte(PdfWorkerProtocol.STATUS_OK);
        PdfWorkerProtocol.writeString(out, result);
    }

    private static boolean awaitParties(Path directory, int parties) throws IOException {
        Files.createFile(directory.resolve(String.valueOf(ProcessHandle.current().pid())));
        long deadline = System.nanoTime() + BARRIER_TIMEOUT.toNanos();
        while (System.nanoTime() - deadline < 0) {
            try (Stream<Path> arrived = Files.list(directory)) {
                if (arrived.count() >= parties) {
                    return true;
                }
            }
            try {
                Thread.sleep(10);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                return false;
            }
        }
        return false;
    }

    /** Echo job; the result is "pid:value", or "in-process:value" when run in this JVM. */
    record TestJob(String action, String value, int sleepMillis) implements PdfWorkerJob<String> {
        static final String TYPE = "test";

        @Override
        public String type() {
            return TYPE;
        }

        @Override
        public void writeRequest(DataOutputStream out) throws IOException {
            PdfWorkerProtocol.writeString(out, action);
            PdfWorkerProtocol.writeString(out, value);
            out.writeInt(sleepMillis);
        }

        static TestJob readRequest(DataInputStream in) throws IOException {
            return new TestJob(
                    PdfWorkerProtocol.readString(in),
                    PdfWorkerProtocol.readString(in),
                    in.readInt());
        }

        @Override
        public String readResult(DataInputStream in) throws IOException {
            String result = PdfWorkerProtocol.readString(in);
            if ("unreadable".equals(action)) {
                throw new IllegalStateException("Result rejected: " + result);
            }
            return result;
        }

        @Override
        public String run() {
            return "in-process:" + value;
        }
    }
}
