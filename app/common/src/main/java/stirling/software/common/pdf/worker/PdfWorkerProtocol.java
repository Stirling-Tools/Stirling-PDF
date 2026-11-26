package stirling.software.common.pdf.worker;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.DataInputStream;
import java.io.DataOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;

/**
 * Framing for the worker pipes. Every frame starts with a magic number and version, so stray bytes
 * on the pipe fail loudly instead of being misread. Requests and responses carry a job id, so a
 * worker can run several jobs at once and answer them in any order.
 */
final class PdfWorkerProtocol {

    static final int MAGIC = 0x53504457; // "SPDW"
    static final byte VERSION = 2;

    static final byte STATUS_OK = 0;
    static final byte STATUS_ERROR = 1;
    static final byte STATUS_READY = 2;

    static final int READY_JOB_ID = 0;

    static final int MAX_STRING_BYTES = 256 << 20;
    static final int MAX_PAYLOAD_BYTES = 512 << 20;
    static final int MAX_COUNT = 10_000_000;

    record Request(int jobId, String type, byte[] payload) {}

    record Response(int jobId, byte status, byte[] payload) {}

    private PdfWorkerProtocol() {}

    static void writeHeader(DataOutputStream out) throws IOException {
        out.writeInt(MAGIC);
        out.writeByte(VERSION);
    }

    static void readHeader(DataInputStream in) throws IOException {
        int magic = in.readInt();
        byte version = in.readByte();
        if (magic != MAGIC || version != VERSION) {
            throw new IOException(
                    "PDF worker protocol mismatch (magic=0x"
                            + Integer.toHexString(magic)
                            + ", version="
                            + version
                            + ")");
        }
    }

    static void writeRequest(DataOutputStream out, Request request) throws IOException {
        writeHeader(out);
        out.writeInt(request.jobId());
        writeString(out, request.type());
        writePayload(out, request.payload());
    }

    static Request readRequest(DataInputStream in) throws IOException {
        readHeader(in);
        int jobId = in.readInt();
        String type = readString(in);
        return new Request(jobId, type, readPayload(in));
    }

    static void writeResponse(DataOutputStream out, Response response) throws IOException {
        writeHeader(out);
        out.writeInt(response.jobId());
        out.writeByte(response.status());
        writePayload(out, response.payload());
    }

    static Response readResponse(DataInputStream in) throws IOException {
        readHeader(in);
        int jobId = in.readInt();
        byte status = in.readByte();
        return new Response(jobId, status, readPayload(in));
    }

    static Response ready(int capacity) {
        return new Response(
                READY_JOB_ID,
                STATUS_READY,
                new byte[] {
                    (byte) (capacity >>> 24),
                    (byte) (capacity >>> 16),
                    (byte) (capacity >>> 8),
                    (byte) capacity
                });
    }

    static int capacityOf(Response ready) throws IOException {
        byte[] p = ready.payload();
        if (ready.jobId() != READY_JOB_ID || ready.status() != STATUS_READY || p.length != 4) {
            throw new IOException("PDF worker did not report ready");
        }
        int capacity =
                ((p[0] & 0xff) << 24)
                        | ((p[1] & 0xff) << 16)
                        | ((p[2] & 0xff) << 8)
                        | (p[3] & 0xff);
        if (capacity < 1) {
            throw new IOException("PDF worker reported capacity " + capacity);
        }
        return capacity;
    }

    static byte[] errorPayload(Throwable error) {
        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        try (DataOutputStream out = new DataOutputStream(bytes)) {
            writeString(out, String.valueOf(error.getMessage()));
            writeString(out, describe(error));
        } catch (IOException e) {
            throw new IllegalStateException("in-memory write failed", e);
        }
        return bytes.toByteArray();
    }

    static PdfWorkerJobException jobException(byte[] errorPayload) throws IOException {
        DataInputStream in = new DataInputStream(new ByteArrayInputStream(errorPayload));
        String message = readString(in);
        return new PdfWorkerJobException(message, readString(in));
    }

    static void writeString(DataOutputStream out, String value) throws IOException {
        byte[] bytes = (value == null ? "" : value).getBytes(StandardCharsets.UTF_8);
        out.writeInt(bytes.length);
        out.write(bytes);
    }

    static String readString(DataInputStream in) throws IOException {
        int length = in.readInt();
        if (length < 0 || length > MAX_STRING_BYTES) {
            throw new IOException("PDF worker sent an invalid string length: " + length);
        }
        byte[] bytes = new byte[length];
        in.readFully(bytes);
        return new String(bytes, StandardCharsets.UTF_8);
    }

    static int readCount(DataInputStream in) throws IOException {
        int count = in.readInt();
        if (count < 0 || count > MAX_COUNT) {
            throw new IOException("PDF worker sent an invalid count: " + count);
        }
        return count;
    }

    private static void writePayload(DataOutputStream out, byte[] payload) throws IOException {
        out.writeInt(payload.length);
        out.write(payload);
    }

    private static byte[] readPayload(DataInputStream in) throws IOException {
        int length = in.readInt();
        if (length < 0 || length > MAX_PAYLOAD_BYTES) {
            throw new IOException("PDF worker sent an invalid payload length: " + length);
        }
        byte[] payload = new byte[length];
        in.readFully(payload);
        return payload;
    }

    /** Message plus the cause chain, so the caller can log and classify the failure. */
    static String describe(Throwable error) {
        StringBuilder sb = new StringBuilder();
        for (Throwable t = error.getCause(); t != null && t != t.getCause(); t = t.getCause()) {
            if (!sb.isEmpty()) {
                sb.append(" <- ");
            }
            sb.append(t.getClass().getSimpleName()).append(": ").append(t.getMessage());
        }
        return sb.toString();
    }
}
