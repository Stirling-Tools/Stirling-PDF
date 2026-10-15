package stirling.software.SPDF.service.toolscore;

import static java.lang.foreign.ValueLayout.ADDRESS;
import static java.lang.foreign.ValueLayout.JAVA_DOUBLE;
import static java.lang.foreign.ValueLayout.JAVA_INT;

import java.io.IOException;
import java.io.InputStream;
import java.lang.foreign.Arena;
import java.lang.foreign.FunctionDescriptor;
import java.lang.foreign.Linker;
import java.lang.foreign.MemorySegment;
import java.lang.foreign.SymbolLookup;
import java.lang.invoke.MethodHandle;
import java.lang.invoke.MethodHandles;
import java.lang.invoke.MethodType;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Optional;

import org.springframework.stereotype.Service;

import lombok.extern.slf4j.Slf4j;

import stirling.software.jpdfium.PdfDocument;
import stirling.software.jpdfium.panama.NativeGuard;
import stirling.software.jpdfium.panama.NativeLoader;
import stirling.software.jpdfium.panama.Symbols;

/**
 * The shared Rust tools ({@code tools-core/}) as a native library. The editor runs the same code as
 * wasm, so a tool here produces what the browser produces from the same PDFium.
 *
 * <p>The library has no PDFium of its own: on load, {@code stirling_tools_bind} resolves every
 * PDFium function by name from the copy jpdfium already loaded, so documents opened through jpdfium
 * can be handed straight to it. Its calls are made under jpdfium's {@link NativeGuard} lock,
 * because PDFium is not thread-safe.
 *
 * <p>Loaded on first use. A build made without cargo does not bundle the library, and {@link
 * #isAvailable()} is then false for the life of the process.
 */
@Slf4j
@Service
public class ToolsCoreLibrary {

    // Hazard: app/core/build.gradle bundles the library under this path.
    private static final String RESOURCE_DIR = "tools-core/natives/";
    private static final String LIBRARY = System.mapLibraryName("stirling_tools");
    private static final long MAX_STRING_LENGTH = 4096;

    private static final Linker LINKER = Linker.nativeLinker();
    private static final FunctionDescriptor RESOLVE_SIGNATURE =
            FunctionDescriptor.of(ADDRESS, ADDRESS);
    private static final FunctionDescriptor BIND_SIGNATURE =
            FunctionDescriptor.of(JAVA_INT, ADDRESS);
    private static final FunctionDescriptor LAST_ERROR_SIGNATURE = FunctionDescriptor.of(ADDRESS);
    private static final FunctionDescriptor ADJUST_COLORS_SIGNATURE =
            FunctionDescriptor.of(
                    JAVA_INT,
                    ADDRESS,
                    ADDRESS,
                    JAVA_DOUBLE,
                    JAVA_DOUBLE,
                    JAVA_DOUBLE,
                    JAVA_DOUBLE,
                    JAVA_DOUBLE,
                    JAVA_DOUBLE);

    private Optional<Bindings> bindings;

    private record Bindings(MethodHandle adjustColors, MethodHandle lastError) {

        /** Must run on the thread whose call failed: the library keeps one error per thread. */
        String lastErrorMessage() {
            MemorySegment message = invoke(() -> (MemorySegment) lastError.invokeExact());
            return message.reinterpret(MAX_STRING_LENGTH).getString(0);
        }
    }

    @FunctionalInterface
    private interface NativeCall<T> {
        T call() throws Throwable;
    }

    public boolean isAvailable() {
        return bindings().isPresent();
    }

    /**
     * Replaces every page of {@code pdf} with an adjusted image of it.
     *
     * @throws IllegalStateException if the library is not available, or reports a failure
     */
    public byte[] adjustColors(byte[] pdf, ColorAdjustments adjustments) {
        Bindings library =
                bindings().orElseThrow(() -> new IllegalStateException("Rust tools not available"));
        try (PdfDocument source = PdfDocument.open(pdf);
                PdfDocument target = PdfDocument.createEmpty()) {
            Optional<String> failure =
                    NativeGuard.call(
                            () -> {
                                int status =
                                        callAdjustColors(
                                                library,
                                                source.rawHandle(),
                                                target.rawHandle(),
                                                adjustments);
                                return status == 0
                                        ? Optional.empty()
                                        : Optional.of(library.lastErrorMessage());
                            });
            if (failure.isPresent()) {
                throw new IllegalStateException("Adjusting colours failed: " + failure.get());
            }
            return target.saveBytes();
        }
    }

    private static int callAdjustColors(
            Bindings library, MemorySegment source, MemorySegment target, ColorAdjustments a) {
        return invoke(
                () ->
                        (int)
                                library.adjustColors()
                                        .invokeExact(
                                                source,
                                                target,
                                                a.contrast(),
                                                a.brightness(),
                                                a.saturation(),
                                                a.red(),
                                                a.green(),
                                                a.blue()));
    }

    private static <T> T invoke(NativeCall<T> call) {
        try {
            return call.call();
        } catch (RuntimeException | Error e) {
            throw e;
        } catch (Throwable t) {
            throw new IllegalStateException(t);
        }
    }

    private synchronized Optional<Bindings> bindings() {
        if (bindings == null) {
            try {
                bindings = load();
            } catch (IOException | RuntimeException | LinkageError e) {
                log.warn("Rust tools library failed to load; its tools are unavailable", e);
                bindings = Optional.empty();
            }
        }
        return bindings;
    }

    private static Optional<Bindings> load() throws IOException {
        String resource = RESOURCE_DIR + NativeLoader.detectPlatform() + "/" + LIBRARY;
        Optional<Path> library = extract(resource);
        if (library.isEmpty()) {
            log.info("Rust tools library not bundled for this platform ({})", resource);
            return Optional.empty();
        }
        SymbolLookup lookup = SymbolLookup.libraryLookup(library.get(), Arena.global());
        Bindings bindings =
                new Bindings(
                        downcall(lookup, "stirling_adjust_colors", ADJUST_COLORS_SIGNATURE),
                        downcall(lookup, "stirling_last_error", LAST_ERROR_SIGNATURE));
        MethodHandle bind = downcall(lookup, "stirling_tools_bind", BIND_SIGNATURE);
        MemorySegment resolver = pdfiumSymbolResolver();
        int status = invoke(() -> (int) bind.invokeExact(resolver));
        if (status != 0) {
            throw new IllegalStateException(
                    "Rust tools could not bind PDFium: " + bindings.lastErrorMessage());
        }
        return Optional.of(bindings);
    }

    private static MethodHandle downcall(
            SymbolLookup lookup, String name, FunctionDescriptor signature) {
        return LINKER.downcallHandle(lookup.findOrThrow(name), signature);
    }

    private static Optional<Path> extract(String resource) throws IOException {
        try (InputStream in =
                ToolsCoreLibrary.class.getClassLoader().getResourceAsStream(resource)) {
            if (in == null) {
                return Optional.empty();
            }
            Path dir = Files.createTempDirectory("stirling-tools");
            Path library = dir.resolve(LIBRARY);
            Files.copy(in, library);
            dir.toFile().deleteOnExit();
            library.toFile().deleteOnExit();
            return Optional.of(library);
        }
    }

    private static MemorySegment pdfiumSymbolResolver() {
        try {
            MethodHandle resolve =
                    MethodHandles.lookup()
                            .findStatic(
                                    ToolsCoreLibrary.class,
                                    "resolvePdfiumSymbol",
                                    MethodType.methodType(
                                            MemorySegment.class, MemorySegment.class));
            return LINKER.upcallStub(resolve, RESOLVE_SIGNATURE, Arena.global());
        } catch (ReflectiveOperationException e) {
            throw new IllegalStateException(e);
        }
    }

    /**
     * Upcall from {@code stirling_tools_bind}. Must not throw: an exception escaping an upcall
     * crashes the JVM, so a failure resolves to NULL, which the library reports by name.
     */
    private static MemorySegment resolvePdfiumSymbol(MemorySegment name) {
        try {
            String symbol = name.reinterpret(MAX_STRING_LENGTH).getString(0);
            return Symbols.find(symbol).orElse(MemorySegment.NULL);
        } catch (RuntimeException e) {
            log.warn("Resolving a PDFium symbol for the Rust tools failed", e);
            return MemorySegment.NULL;
        }
    }
}
