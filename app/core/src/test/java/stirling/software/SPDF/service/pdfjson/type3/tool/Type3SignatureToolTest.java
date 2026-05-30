package stirling.software.SPDF.service.pdfjson.type3.tool;

import static org.junit.jupiter.api.Assertions.*;

import java.io.ByteArrayOutputStream;
import java.io.PrintStream;

import org.junit.jupiter.api.Test;

class Type3SignatureToolTest {

    @Test
    void main_noArgs_printsUsage() throws Exception {
        PrintStream originalOut = System.out;
        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        System.setOut(new PrintStream(baos));
        try {
            Type3SignatureTool.main(new String[] {});
            String output = baos.toString();
            assertTrue(output.contains("Type3SignatureTool"));
            assertTrue(output.contains("--pdf"));
        } finally {
            System.setOut(originalOut);
        }
    }

    @Test
    void main_helpFlag_printsUsage() throws Exception {
        PrintStream originalOut = System.out;
        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        System.setOut(new PrintStream(baos));
        try {
            Type3SignatureTool.main(new String[] {"--help"});
            String output = baos.toString();
            assertTrue(output.contains("Type3SignatureTool"));
        } finally {
            System.setOut(originalOut);
        }
    }

    @Test
    void main_nullArgs_printsUsage() throws Exception {
        PrintStream originalOut = System.out;
        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        System.setOut(new PrintStream(baos));
        try {
            Type3SignatureTool.main(null);
            String output = baos.toString();
            assertTrue(output.contains("Type3SignatureTool"));
        } finally {
            System.setOut(originalOut);
        }
    }

    @Test
    void main_nonExistentPdf_throwsIOException() {
        assertThrows(
                Exception.class,
                () ->
                        Type3SignatureTool.main(
                                new String[] {"--pdf", "/nonexistent/path/file.pdf"}));
    }

    @Test
    void main_shortHelpFlag_printsUsage() throws Exception {
        PrintStream originalOut = System.out;
        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        System.setOut(new PrintStream(baos));
        try {
            Type3SignatureTool.main(new String[] {"-h"});
            String output = baos.toString();
            assertTrue(output.contains("Type3SignatureTool"));
        } finally {
            System.setOut(originalOut);
        }
    }

    @Test
    void main_prettyFlagWithoutPdf_printsUsage() throws Exception {
        PrintStream originalOut = System.out;
        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        System.setOut(new PrintStream(baos));
        try {
            Type3SignatureTool.main(new String[] {"--pretty"});
            String output = baos.toString();
            assertTrue(output.contains("Type3SignatureTool"));
        } finally {
            System.setOut(originalOut);
        }
    }
}
