package stirling.software.SPDF.service;

import static java.lang.foreign.ValueLayout.ADDRESS;
import static java.lang.foreign.ValueLayout.JAVA_INT;

import java.io.IOException;
import java.lang.foreign.Arena;
import java.lang.foreign.FunctionDescriptor;
import java.lang.foreign.MemorySegment;
import java.lang.invoke.MethodHandle;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;

import org.springframework.stereotype.Service;

import lombok.RequiredArgsConstructor;

import stirling.software.jpdfium.panama.Symbols;

import tools.jackson.databind.ObjectMapper;

/** Copies encryption through JPDFium's bundled native library without an external executable. */
@Service
@RequiredArgsConstructor
public class PdfProtectionService {
    private final ObjectMapper objectMapper;

    /**
     * Keeps both source passwords and permissions when only one password is known. The caller owns
     * three distinct temporary paths and must verify the output and delete it on failure.
     */
    public void restore(Path input, Path source, String password, Path output) throws IOException {
        if (password.indexOf('\0') >= 0) {
            throw new IOException("PDF protection does not support passwords containing NUL");
        }
        String job =
                objectMapper.writeValueAsString(
                        Map.of(
                                "inputFile", input.toAbsolutePath().toString(),
                                "outputFile", output.toAbsolutePath().toString(),
                                "copyEncryption", source.toAbsolutePath().toString(),
                                "encryptionFilePassword", password));
        try (Arena arena = Arena.ofConfined()) {
            MemorySegment json = arena.allocateFrom(job);
            try {
                NativeJob.run(arena, json);
            } finally {
                json.fill((byte) 0);
            }
        } catch (IOException e) {
            throw e;
        } catch (LinkageError | Exception e) {
            throw new IOException(
                    "Native PDF protection is unavailable; no unprotected result was returned", e);
        } catch (Throwable e) {
            if (e instanceof Error error) throw error;
            throw new IOException("Unable to restore PDF protection", e);
        }
        if (Files.size(output) == 0) {
            throw new IOException(
                    "Unable to restore PDF protection; no unprotected result was returned");
        }
    }

    // Lazy binding lets the app start on platforms without natives; JPDFium owns library loading.
    private static final class NativeJob {
        private static final int DISCARD_LOGS = 3;
        private static final MethodHandle INIT =
                bind("qpdfjob_init", FunctionDescriptor.of(ADDRESS));
        private static final MethodHandle CLEANUP =
                bind("qpdfjob_cleanup", FunctionDescriptor.ofVoid(ADDRESS));
        private static final MethodHandle INITIALIZE =
                bind(
                        "qpdfjob_initialize_from_json",
                        FunctionDescriptor.of(JAVA_INT, ADDRESS, ADDRESS));
        private static final MethodHandle RUN =
                bind("qpdfjob_run", FunctionDescriptor.of(JAVA_INT, ADDRESS));
        private static final MethodHandle SET_LOGGER =
                bind("qpdfjob_set_logger", FunctionDescriptor.ofVoid(ADDRESS, ADDRESS));
        private static final MethodHandle LOGGER_CREATE =
                bind("qpdflogger_create", FunctionDescriptor.of(ADDRESS));
        private static final MethodHandle LOGGER_CLEANUP =
                bind("qpdflogger_cleanup", FunctionDescriptor.ofVoid(ADDRESS));
        private static final MethodHandle LOGGER_INFO = loggerBinding("qpdflogger_set_info");
        private static final MethodHandle LOGGER_WARN = loggerBinding("qpdflogger_set_warn");
        private static final MethodHandle LOGGER_ERROR = loggerBinding("qpdflogger_set_error");

        private static MethodHandle bind(String name, FunctionDescriptor descriptor) {
            MethodHandle handle = Symbols.downcallOptional(name, descriptor);
            if (handle == null)
                throw new UnsatisfiedLinkError("Missing bundled native function: " + name);
            return handle;
        }

        private static MethodHandle loggerBinding(String name) {
            return bind(name, FunctionDescriptor.ofVoid(ADDRESS, JAVA_INT, ADDRESS, ADDRESS));
        }

        private static void run(Arena arena, MemorySegment json) throws Throwable {
            MemorySegment jobSlot = arena.allocate(ADDRESS);
            MemorySegment loggerSlot = arena.allocate(ADDRESS);
            MemorySegment job = (MemorySegment) INIT.invokeExact();
            if (job.equals(MemorySegment.NULL))
                throw new IOException("Unable to create native PDF job");
            jobSlot.set(ADDRESS, 0, job);
            try {
                MemorySegment logger = (MemorySegment) LOGGER_CREATE.invokeExact();
                if (logger.equals(MemorySegment.NULL))
                    throw new IOException("Unable to create native PDF logger");
                loggerSlot.set(ADDRESS, 0, logger);
                try {
                    // Per-job logging avoids disclosing credentials from native diagnostics without
                    // changing the shared logger used by other PDF operations.
                    LOGGER_INFO.invokeExact(
                            logger, DISCARD_LOGS, MemorySegment.NULL, MemorySegment.NULL);
                    LOGGER_WARN.invokeExact(
                            logger, DISCARD_LOGS, MemorySegment.NULL, MemorySegment.NULL);
                    LOGGER_ERROR.invokeExact(
                            logger, DISCARD_LOGS, MemorySegment.NULL, MemorySegment.NULL);
                    SET_LOGGER.invokeExact(job, logger);
                    int initialized = (int) INITIALIZE.invokeExact(job, json);
                    if (initialized != 0)
                        throw new IOException("Unable to initialize PDF protection");
                    int result = (int) RUN.invokeExact(job);
                    // qpdf's warning status still produces output; PDFBox verifies its protection.
                    if (result != 0 && result != 3)
                        throw new IOException("Unable to restore PDF protection");
                } finally {
                    LOGGER_CLEANUP.invokeExact(loggerSlot);
                }
            } finally {
                CLEANUP.invokeExact(jobSlot);
            }
        }
    }
}
