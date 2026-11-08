package stirling.software.common.pdf.worker;

import java.io.DataInputStream;
import java.io.DataOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;

/**
 * Framing for the worker pipes. Every frame starts with a magic number and version, so stray bytes
 * on the pipe fail loudly instead of being misread.
 */
final class PdfWorkerProtocol {

    static final int MAGIC = 0x53504457; // "SPDW"
    static final byte VERSION = 1;

    static final byte STATUS_OK = 0;
    static final byte STATUS_ERROR = 1;
    static final byte STATUS_READY = 2;

    static final int MAX_STRING_BYTES = 256 << 20;
    static final int MAX_COUNT = 10_000_000;

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
