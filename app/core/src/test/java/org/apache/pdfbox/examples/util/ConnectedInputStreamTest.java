package org.apache.pdfbox.examples.util;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.nio.charset.StandardCharsets;

import org.junit.jupiter.api.Test;
import org.mockito.InOrder;

class ConnectedInputStreamTest {

    @Test
    void delegates_read_skip_available_mark_reset_and_markSupported() throws IOException {
        byte[] data = "hello world".getBytes(StandardCharsets.UTF_8);
        ByteArrayInputStream base = new ByteArrayInputStream(data);
        HttpURLConnection con = mock(HttpURLConnection.class);

        ConnectedInputStream cis = new ConnectedInputStream(con, base);

        // mark support
        assertTrue(cis.markSupported());

        // available at start
        assertEquals(data.length, cis.available());

        // read single byte
        int first = cis.read();
        assertEquals('h', first);

        // mark here
        cis.mark(100);

        // read next 4 bytes with read(byte[])
        byte[] buf4 = new byte[4];
        int n4 = cis.read(buf4);
        assertEquals(4, n4);
        assertArrayEquals("ello".getBytes(StandardCharsets.UTF_8), buf4);

        // read next 1 byte with read(byte[], off, len)
        byte[] one = new byte[1];
        int n1 = cis.read(one, 0, 1);
        assertEquals(1, n1);
        assertEquals((int) ' ', one[0] & 0xFF);

        // reset to mark and re-read the same 5 bytes ("ello ")
        cis.reset();
        byte[] again5 = new byte[5];
        int n5 = cis.read(again5, 0, 5);
        assertEquals(5, n5);
        assertArrayEquals("ello ".getBytes(StandardCharsets.UTF_8), again5);

        // skip one byte ('w')
        long skipped = cis.skip(1);
        assertEquals(1, skipped);

        // remaining should be "orld" (4 bytes)
        assertEquals(4, cis.available());
        byte[] rest = new byte[4];
        assertEquals(4, cis.read(rest));
        assertArrayEquals("orld".getBytes(StandardCharsets.UTF_8), rest);

        // end of stream
        assertEquals(-1, cis.read());
        cis.close();
        verify(con).disconnect();
    }

    @Test
    void close_closes_stream_before_disconnect() throws IOException {
        InputStream is = mock(InputStream.class);
        HttpURLConnection con = mock(HttpURLConnection.class);

        ConnectedInputStream cis = new ConnectedInputStream(con, is);
        cis.close();

        InOrder inOrder = inOrder(is, con);
        inOrder.verify(is).close();
        inOrder.verify(con).disconnect();
        inOrder.verifyNoMoreInteractions();
    }
}
