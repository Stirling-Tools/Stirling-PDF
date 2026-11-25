package stirling.software.proprietary.serverregistration;

import java.io.IOException;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.net.http.HttpTimeoutException;
import java.time.Duration;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;

/** Applies collection HTTP deadlines through body completion without exposing upstream data. */
public final class RegistrationHttpTransport {
    private RegistrationHttpTransport() {}

    /** Cancels the exchange on timeout or interruption, including a stalled response body. */
    public static HttpResponse<String> send(HttpClient http, HttpRequest request, Duration timeout)
            throws IOException, InterruptedException {
        var exchange = http.sendAsync(request, HttpResponse.BodyHandlers.ofString());
        try {
            return exchange.get(timeout.toNanos(), TimeUnit.NANOSECONDS);
        } catch (TimeoutException e) {
            exchange.cancel(true);
            throw new HttpTimeoutException("Registration HTTP deadline exceeded");
        } catch (InterruptedException e) {
            exchange.cancel(true);
            throw e;
        } catch (ExecutionException e) {
            throw new IOException("Registration HTTP exchange failed");
        }
    }
}
