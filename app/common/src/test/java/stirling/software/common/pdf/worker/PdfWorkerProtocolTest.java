package stirling.software.common.pdf.worker;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.DataInputStream;
import java.io.DataOutputStream;
import java.io.IOException;

import org.junit.jupiter.api.Test;

class PdfWorkerProtocolTest {

    @Test
    void readsResultsLargerThanARequestFrame() throws IOException {
        String block = "x".repeat(2 << 20);
        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        DataOutputStream out = new DataOutputStream(bytes);
        out.writeInt(250_000);
        PdfWorkerProtocol.writeString(out, block);

        DataInputStream in = new DataInputStream(new ByteArrayInputStream(bytes.toByteArray()));
        assertThat(PdfWorkerProtocol.readCount(in)).isEqualTo(250_000);
        assertThat(PdfWorkerProtocol.readString(in)).isEqualTo(block);
    }

    @Test
    void rejectsLengthsPastTheBound() throws IOException {
        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        DataOutputStream out = new DataOutputStream(bytes);
        out.writeInt(PdfWorkerProtocol.MAX_STRING_BYTES + 1);
        out.writeInt(-1);

        DataInputStream in = new DataInputStream(new ByteArrayInputStream(bytes.toByteArray()));
        assertThatThrownBy(() -> PdfWorkerProtocol.readString(in)).isInstanceOf(IOException.class);
        assertThatThrownBy(() -> PdfWorkerProtocol.readCount(in)).isInstanceOf(IOException.class);
    }
}
