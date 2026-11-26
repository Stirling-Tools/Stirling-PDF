package stirling.software.common.pdf.worker;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.DataInputStream;
import java.io.DataOutputStream;
import java.io.IOException;
import java.util.function.Function;

/**
 * Runs one worker job inside a PDFium instance. Each isolated instance loads its own copy of this
 * class and of the jobs, so the JPDFium they call is that instance's. Takes {@code Object[] {type,
 * request bytes}} and returns the response: a status byte followed by the result or error payload.
 */
public final class PdfWorkerTask implements Function<Object, Object> {

    @Override
    public Object apply(Object input) {
        Object[] args = (Object[]) input;
        return run((String) args[0], (byte[]) args[1]);
    }

    static byte[] run(String type, byte[] request) {
        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        try (DataOutputStream out = new DataOutputStream(bytes)) {
            out.writeByte(PdfWorkerProtocol.STATUS_OK);
            DataInputStream in = new DataInputStream(new ByteArrayInputStream(request));
            switch (type) {
                case MergeJob.TYPE -> MergeJob.writeResult(out, MergeJob.readRequest(in).run());
                case RedactJob.TYPE -> RedactJob.writeResult(out, RedactJob.readRequest(in).run());
                case MarkdownJob.TYPE ->
                        MarkdownJob.writeResult(out, MarkdownJob.readRequest(in).run());
                default -> throw new IOException("Unknown PDF worker job: " + type);
            }
        } catch (Exception | LinkageError | StackOverflowError e) {
            return error(e);
        }
        return bytes.toByteArray();
    }

    static byte[] error(Throwable failure) {
        byte[] payload = PdfWorkerProtocol.errorPayload(failure);
        byte[] response = new byte[payload.length + 1];
        response[0] = PdfWorkerProtocol.STATUS_ERROR;
        System.arraycopy(payload, 0, response, 1, payload.length);
        return response;
    }
}
