package stirling.software.proprietary.policy.network;

import java.io.FilterInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.List;

import org.apache.commons.net.ftp.FTP;
import org.apache.commons.net.ftp.FTPClient;
import org.apache.commons.net.ftp.FTPFile;
import org.apache.commons.net.ftp.FTPReply;
import org.apache.commons.net.ftp.FTPSClient;

/**
 * FTP client over Apache Commons Net, with optional TLS ({@code EXPLICIT} = AUTH TLS, {@code
 * IMPLICIT} = TLS on connect). Passive mode is the default since it works through NAT. A blank
 * directory lists the login working directory. One transfer is in flight at a time, so the read
 * stream calls {@code completePendingCommand} on close before the session is reused or shut down.
 */
final class FtpFileClient implements RemoteFileClient {

    private static final int CONNECT_TIMEOUT_MS = 15_000;
    private static final int MAX_DEPTH = 64;

    private final FTPClient ftp;

    private FtpFileClient(FTPClient ftp) {
        this.ftp = ftp;
    }

    static FtpFileClient connect(NetworkConfig config) throws IOException {
        FTPClient ftp = clientFor(config);
        ftp.setConnectTimeout(CONNECT_TIMEOUT_MS);
        try {
            ftp.connect(config.host(), config.port());
            int reply = ftp.getReplyCode();
            if (!FTPReply.isPositiveCompletion(reply)) {
                ftp.disconnect();
                throw new IOException(
                        "FTP server " + config.host() + " refused connection: " + reply);
            }
            if (ftp instanceof FTPSClient ftps) {
                // Encrypt the data channel too, not only the control channel.
                ftps.execPBSZ(0);
                ftps.execPROT("P");
            }
            if (!ftp.login(config.username(), config.password())) {
                int code = ftp.getReplyCode();
                ftp.disconnect();
                throw new IOException("FTP login to " + config.host() + " failed: " + code);
            }
            if (config.passive()) {
                ftp.enterLocalPassiveMode();
            }
            ftp.setFileType(FTP.BINARY_FILE_TYPE);
            return new FtpFileClient(ftp);
        } catch (IOException e) {
            quietlyDisconnect(ftp);
            throw e;
        }
    }

    private static FTPClient clientFor(NetworkConfig config) {
        return switch (config.security()) {
            case NONE -> new FTPClient();
            case IMPLICIT -> new FTPSClient(true);
            case EXPLICIT -> new FTPSClient(false);
        };
    }

    @Override
    public List<RemoteFile> list(String directory, boolean recursive) throws IOException {
        List<RemoteFile> files = new ArrayList<>();
        collect(dir(directory), recursive, 0, files);
        return files;
    }

    private void collect(String directory, boolean recursive, int depth, List<RemoteFile> out)
            throws IOException {
        FTPFile[] entries = ftp.listFiles(directory);
        for (FTPFile entry : entries) {
            if (entry == null) {
                continue;
            }
            String name = entry.getName();
            if (name.equals(".") || name.equals("..") || name.startsWith(".")) {
                continue;
            }
            String path = join(directory, name);
            if (entry.isDirectory()) {
                if (recursive && !entry.isSymbolicLink() && depth < MAX_DEPTH) {
                    collect(path, true, depth + 1, out);
                }
                continue;
            }
            if (entry.isFile()) {
                out.add(new RemoteFile(path, name, entry.getSize(), lastModified(entry)));
            }
        }
    }

    @Override
    public RemoteFile stat(String path) throws IOException {
        FTPFile entry = ftp.mlistFile(path);
        if (entry == null) {
            return null;
        }
        return new RemoteFile(path, entry.getName(), entry.getSize(), lastModified(entry));
    }

    @Override
    public InputStream open(String path) throws IOException {
        InputStream stream = ftp.retrieveFileStream(path);
        if (stream == null) {
            throw new IOException("cannot read " + path + ": " + ftp.getReplyString());
        }
        // The data stream must be closed and the transfer acknowledged before the session is
        // reused.
        return new FilterInputStream(stream) {
            @Override
            public void close() throws IOException {
                super.close();
                ftp.completePendingCommand();
            }
        };
    }

    @Override
    public void delete(String path) throws IOException {
        ftp.deleteFile(path);
    }

    @Override
    public void close() throws IOException {
        try {
            ftp.logout();
        } finally {
            quietlyDisconnect(ftp);
        }
    }

    private static long lastModified(FTPFile entry) {
        return entry.getTimestamp() == null ? 0L : entry.getTimestamp().getTimeInMillis();
    }

    private static void quietlyDisconnect(FTPClient ftp) {
        if (ftp.isConnected()) {
            try {
                ftp.disconnect();
            } catch (IOException ignored) {
                // Best-effort teardown; the session is being abandoned anyway.
            }
        }
    }

    private static String dir(String directory) {
        return directory == null || directory.isBlank() ? "." : directory;
    }

    private static String join(String directory, String name) {
        if (directory.equals(".")) {
            return name;
        }
        return directory.endsWith("/") ? directory + name : directory + "/" + name;
    }
}
