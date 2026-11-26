package stirling.software.common.pdf.worker;

import java.io.BufferedInputStream;
import java.io.BufferedOutputStream;
import java.io.ByteArrayOutputStream;
import java.io.DataInputStream;
import java.io.DataOutputStream;
import java.io.FileDescriptor;
import java.io.FileOutputStream;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.stream.Stream;

/** Worker main for pool tests: speaks the real protocol with no PDFium behind it. */
public final class FakePdfWorkerMain {

    private static final Duration WAIT_LIMIT = Duration.ofSeconds(30);

    private FakePdfWorkerMain() {}

    public static void main(String[] args) throws IOException {
        FileOutputStream protocolOut = new FileOutputStream(FileDescriptor.out);
        PdfWorkerMain.serve(
                new DataInputStream(new BufferedInputStream(System.in)),
                new DataOutputStream(new BufferedOutputStream(protocolOut)),
                Integer.getInteger(PdfWorkerMain.INSTANCES_PROPERTY, 1),
                FakePdfWorkerMain::dispatch);
    }

    private static byte[] dispatch(String type, byte[] request) throws IOException {
        TestJob job =
                TestJob.readRequest(new DataInputStream(new java.io.ByteArrayInputStream(request)));
        String pid = String.valueOf(ProcessHandle.current().pid());
        switch (job.action()) {
            case "crash" -> Runtime.getRuntime().halt(3);
            case "fail" -> {
                return PdfWorkerTask.error(new IOException("Invalid PDF: " + job.value()));
            }
            case "noise" -> {
                FileOutputStream stray = new FileOutputStream(FileDescriptor.out);
                stray.write("not a frame".getBytes());
                stray.flush();
                return ok(pid + ":" + job.value());
            }
            case "barrier" -> {
                boolean met = awaitParties(Path.of(job.value()), job.sleepMillis());
                return ok(pid + ":" + (met ? "met" : "missed"));
            }
            case "wait" -> {
                Path dir = Path.of(job.value());
                Files.writeString(dir.resolve("started-" + pid), "");
                boolean released = awaitFile(dir.resolve("release"));
                return ok(pid + ":" + (released ? "released" : "stuck"));
            }
            default -> {}
        }
        try {
            Thread.sleep(job.sleepMillis());
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
        return ok(pid + ":" + job.value());
    }

    private static byte[] ok(String result) throws IOException {
        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        try (DataOutputStream out = new DataOutputStream(bytes)) {
            out.writeByte(PdfWorkerProtocol.STATUS_OK);
            PdfWorkerProtocol.writeString(out, result);
        }
        return bytes.toByteArray();
    }

    private static boolean awaitParties(Path directory, int parties) throws IOException {
        Files.createFile(
                directory.resolve(
                        ProcessHandle.current().pid() + "-" + Thread.currentThread().threadId()));
        return poll(
                () -> {
                    try (Stream<Path> arrived = Files.list(directory)) {
                        return arrived.count() >= parties;
                    }
                });
    }

    private static boolean awaitFile(Path file) throws IOException {
        return poll(() -> Files.exists(file));
    }

    private interface Check {
        boolean done() throws IOException;
    }

    private static boolean poll(Check check) throws IOException {
        long deadline = System.nanoTime() + WAIT_LIMIT.toNanos();
        while (System.nanoTime() - deadline < 0) {
            if (check.done()) {
                return true;
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
