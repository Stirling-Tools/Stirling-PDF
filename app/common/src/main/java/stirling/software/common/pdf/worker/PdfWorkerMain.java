package stirling.software.common.pdf.worker;

import java.io.BufferedInputStream;
import java.io.BufferedOutputStream;
import java.io.DataInputStream;
import java.io.DataOutputStream;
import java.io.EOFException;
import java.io.FileDescriptor;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.PrintStream;
import java.util.Arrays;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicInteger;

import stirling.software.jpdfium.instance.PdfiumInstance;
import stirling.software.jpdfium.instance.PdfiumInstancePool;
import stirling.software.jpdfium.panama.NativeLoader;

/**
 * Entry point of a PDF worker process. Hosts a pool of PDFium instances and runs up to one job per
 * instance at a time over stdin/stdout. Exits when stdin closes, so a worker never outlives the
 * server that started it.
 */
public final class PdfWorkerMain {

    static final String INSTANCES_PROPERTY = "stirling.pdfWorker.instances";

    // Every class on a job's path that touches JPDFium types must load per instance; one left
    // to the shared loader would see another instance's classes.
    static final List<String> ISOLATED_PACKAGES =
            List.of("stirling.software.common.pdf.", "stirling.software.proprietary.pdf.");

    /** Runs one job and returns the response: status byte, then payload. */
    interface Dispatcher {
        byte[] dispatch(String type, byte[] request) throws Exception;
    }

    private PdfWorkerMain() {}

    public static void main(String[] args) throws IOException {
        // Keep stdout for frames only; anything else that prints goes to stderr.
        FileOutputStream protocolOut = new FileOutputStream(FileDescriptor.out);
        System.setOut(new PrintStream(new FileOutputStream(FileDescriptor.err), true));
        // Fails before READY if the natives can't load, so the server reports the worker failed.
        NativeLoader.ensureLoaded();
        PdfiumInstancePool pool = openPool(Integer.getInteger(INSTANCES_PROPERTY, 1));
        serve(
                new DataInputStream(new BufferedInputStream(System.in, 64 * 1024)),
                new DataOutputStream(new BufferedOutputStream(protocolOut, 64 * 1024)),
                pool.size(),
                (type, request) -> runOnInstance(pool, type, request));
        // Exit without running every PDFium copy's static destructors under jobs still in native
        // code; the server only closes stdin when it no longer needs any result.
        Runtime.getRuntime().halt(0);
    }

    static PdfiumInstancePool openPool(int requested) {
        int size = Math.max(1, Math.min(requested, PdfiumInstancePool.maxInstances()));
        try {
            return PdfiumInstancePool.builder()
                    .size(size)
                    .isolate(ISOLATED_PACKAGES.toArray(String[]::new))
                    .build();
        } catch (RuntimeException | LinkageError e) {
            if (size == 1) {
                throw e;
            }
            System.err.println(
                    "PDF worker: isolated PDFium instances unavailable, running one instance: "
                            + e);
            return PdfiumInstancePool.builder().size(1).build();
        }
    }

    private static byte[] runOnInstance(PdfiumInstancePool pool, String type, byte[] request)
            throws InterruptedException {
        PdfiumInstance instance = pool.acquire();
        try {
            return (byte[])
                    instance.call(PdfWorkerTask.class.getName(), new Object[] {type, request});
        } finally {
            pool.release(instance);
        }
    }

    static void serve(DataInputStream in, DataOutputStream out, int capacity, Dispatcher dispatcher)
            throws IOException {
        Object writeLock = new Object();
        synchronized (writeLock) {
            PdfWorkerProtocol.writeResponse(out, PdfWorkerProtocol.ready(capacity));
            out.flush();
        }
        AtomicInteger inFlight = new AtomicInteger();
        ExecutorService jobs =
                Executors.newFixedThreadPool(
                        capacity,
                        r -> {
                            Thread t = new Thread(r, "pdf-job");
                            t.setDaemon(true);
                            return t;
                        });
        try {
            while (true) {
                PdfWorkerProtocol.Request request;
                try {
                    request = PdfWorkerProtocol.readRequest(in);
                } catch (EOFException closed) {
                    return;
                }
                inFlight.incrementAndGet();
                jobs.execute(() -> answer(request, dispatcher, out, writeLock, inFlight));
            }
        } finally {
            jobs.shutdownNow();
        }
    }

    private static void answer(
            PdfWorkerProtocol.Request request,
            Dispatcher dispatcher,
            DataOutputStream out,
            Object writeLock,
            AtomicInteger inFlight) {
        byte[] result;
        try {
            result = dispatcher.dispatch(request.type(), request.payload());
        } catch (Throwable t) {
            result = PdfWorkerTask.error(t);
        }
        PdfWorkerProtocol.Response response =
                new PdfWorkerProtocol.Response(
                        request.jobId(), result[0], Arrays.copyOfRange(result, 1, result.length));
        synchronized (writeLock) {
            try {
                PdfWorkerProtocol.writeResponse(out, response);
                out.flush();
            } catch (IOException serverGone) {
                Runtime.getRuntime().halt(1);
            }
        }
        // An idle worker hands its heap back; -Xms is small and the free ratios let it shrink.
        if (inFlight.decrementAndGet() == 0) {
            System.gc();
        }
    }
}
