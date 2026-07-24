package stirling.software.proprietary.policy.network;

import java.io.Closeable;
import java.io.IOException;
import java.io.InputStream;
import java.util.List;

/**
 * A connected session to one network file server (SFTP, FTP, or SMB), created by {@link
 * RemoteFileClientFactory}. Sessions are short-lived and single-use: the caller opens one, performs
 * a listing, a read, or a delete, then closes it - there is no pooling, because network sessions
 * time out and go stale far more readily than an S3 HTTP client. Callers must {@link #close()}
 * every client (try-with-resources), except when streaming, where ownership is handed to the
 * returned stream so it can be read after {@code resolve} returns.
 */
public interface RemoteFileClient extends Closeable {

    /** Every regular, non-hidden file under {@code directory}, optionally descending into it. */
    List<RemoteFile> list(String directory, boolean recursive) throws IOException;

    /** The current metadata for one path, or null when it no longer exists. */
    RemoteFile stat(String path) throws IOException;

    /** Opens the file for reading; the stream stays valid until this client is closed. */
    InputStream open(String path) throws IOException;

    /** Removes the file; a no-op if it is already gone. */
    void delete(String path) throws IOException;
}
