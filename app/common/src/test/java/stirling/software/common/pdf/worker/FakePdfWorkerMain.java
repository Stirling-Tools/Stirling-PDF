package stirling.software.common.pdf.worker;

import java.io.BufferedInputStream;
import java.io.BufferedOutputStream;
import java.io.DataInputStream;
import java.io.DataOutputStream;
import java.io.FileDescriptor;
import java.io.FileOutputStream;
import java.io.IOException;
import java.util.Map;

/** Worker main for pool tests: speaks the real protocol with no PDFium behind it. */
public final class FakePdfWorkerMain {

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
            default -> {}
        }
        try {
            Thread.sleep(job.sleepMillis());
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
        PdfWorkerProtocol.writeHeader(out);
        out.writeByte(PdfWorkerProtocol.STATUS_OK);
        PdfWorkerProtocol.writeString(out, ProcessHandle.current().pid() + ":" + job.value());
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
            return PdfWorkerProtocol.readString(in);
        }

        @Override
        public String run() {
            return "in-process:" + value;
        }
    }
}
