package stirling.software.proprietary.policy.network;

import java.io.FilterInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.EnumSet;
import java.util.List;
import java.util.concurrent.TimeUnit;

import com.hierynomus.msdtyp.AccessMask;
import com.hierynomus.mserref.NtStatus;
import com.hierynomus.msfscc.FileAttributes;
import com.hierynomus.msfscc.fileinformation.FileAllInformation;
import com.hierynomus.msfscc.fileinformation.FileIdBothDirectoryInformation;
import com.hierynomus.mssmb2.SMB2CreateDisposition;
import com.hierynomus.mssmb2.SMB2ShareAccess;
import com.hierynomus.mssmb2.SMBApiException;
import com.hierynomus.protocol.commons.socket.ProxySocketFactory;
import com.hierynomus.smbj.SMBClient;
import com.hierynomus.smbj.SmbConfig;
import com.hierynomus.smbj.auth.AuthenticationContext;
import com.hierynomus.smbj.common.SMBRuntimeException;
import com.hierynomus.smbj.connection.Connection;
import com.hierynomus.smbj.session.Session;
import com.hierynomus.smbj.share.DiskShare;

/**
 * SMB2/3 client over smbj against a Windows or Samba share. The share is named on the connection;
 * directories are relative to its root, using backslashes as SMB expects. A blank directory lists
 * the share root. Hidden and system entries are skipped, and symlink/reparse dirs are not
 * descended, mirroring the folder source.
 */
final class SmbFileClient implements RemoteFileClient {

    private static final int CONNECT_TIMEOUT_MS = 15_000;
    private static final int READ_TIMEOUT_MS = 60_000;
    private static final int MAX_DEPTH = 64;

    private final SMBClient smbClient;
    private final Connection connection;
    private final Session session;
    private final DiskShare share;

    private SmbFileClient(
            SMBClient smbClient, Connection connection, Session session, DiskShare share) {
        this.smbClient = smbClient;
        this.connection = connection;
        this.session = session;
        this.share = share;
    }

    static SmbFileClient connect(NetworkConfig config) throws IOException {
        // Bounded connect and read timeouts (both default to unlimited) so a host that accepts
        // the TCP connection then stalls cannot wedge a poller.
        SmbConfig smbConfig =
                SmbConfig.builder()
                        .withSocketFactory(new ProxySocketFactory(CONNECT_TIMEOUT_MS))
                        .withSoTimeout(READ_TIMEOUT_MS, TimeUnit.MILLISECONDS)
                        .withTimeout(READ_TIMEOUT_MS, TimeUnit.MILLISECONDS)
                        .build();
        SMBClient smbClient = new SMBClient(smbConfig);
        Connection connection = smbClient.connect(config.host(), config.port());
        try {
            char[] password =
                    config.password() == null ? new char[0] : config.password().toCharArray();
            AuthenticationContext auth =
                    new AuthenticationContext(config.username(), password, config.domain());
            Session session = connection.authenticate(auth);
            DiskShare share = (DiskShare) session.connectShare(config.share());
            return new SmbFileClient(smbClient, connection, session, share);
        } catch (RuntimeException e) {
            closeQuietly(connection);
            closeQuietly(smbClient);
            throw new IOException(
                    "SMB connection to \\\\"
                            + config.host()
                            + "\\"
                            + config.share()
                            + " failed: "
                            + e.getMessage(),
                    e);
        }
    }

    @Override
    public List<RemoteFile> list(String directory, boolean recursive) throws IOException {
        List<RemoteFile> files = new ArrayList<>();
        collect(smbDir(directory), recursive, 0, files);
        return files;
    }

    private void collect(String directory, boolean recursive, int depth, List<RemoteFile> out)
            throws IOException {
        List<FileIdBothDirectoryInformation> entries;
        try {
            entries = share.list(directory);
        } catch (SMBRuntimeException e) {
            // smbj throws unchecked; surface as IOException like the SFTP/FTP clients.
            throw new IOException("cannot list " + slashed(directory) + ": " + e.getMessage(), e);
        }
        for (FileIdBothDirectoryInformation info : entries) {
            if (out.size() >= MAX_FILES) {
                return;
            }
            String name = info.getFileName();
            if (name.equals(".") || name.equals("..") || name.startsWith(".")) {
                continue;
            }
            long attributes = info.getFileAttributes();
            if (isSet(attributes, FileAttributes.FILE_ATTRIBUTE_HIDDEN)
                    || isSet(attributes, FileAttributes.FILE_ATTRIBUTE_SYSTEM)) {
                continue;
            }
            String path = join(directory, name);
            if (isSet(attributes, FileAttributes.FILE_ATTRIBUTE_DIRECTORY)) {
                if (recursive
                        && !isSet(attributes, FileAttributes.FILE_ATTRIBUTE_REPARSE_POINT)
                        && depth < MAX_DEPTH) {
                    collect(path, true, depth + 1, out);
                }
                continue;
            }
            out.add(
                    new RemoteFile(
                            slashed(path),
                            name,
                            info.getEndOfFile(),
                            info.getLastWriteTime().toEpochMillis()));
        }
    }

    @Override
    public RemoteFile stat(String path) throws IOException {
        String smbPath = smbPath(path);
        try {
            FileAllInformation info = share.getFileInformation(smbPath);
            String name = path.substring(path.lastIndexOf('/') + 1);
            return new RemoteFile(
                    slashed(smbPath),
                    name,
                    info.getStandardInformation().getEndOfFile(),
                    info.getBasicInformation().getLastWriteTime().toEpochMillis());
        } catch (SMBApiException e) {
            if (isNotFound(e)) {
                return null;
            }
            throw new IOException("cannot stat " + path + ": " + e.getMessage(), e);
        }
    }

    @Override
    public InputStream open(String path) throws IOException {
        try {
            com.hierynomus.smbj.share.File file =
                    share.openFile(
                            smbPath(path),
                            EnumSet.of(AccessMask.GENERIC_READ),
                            null,
                            SMB2ShareAccess.ALL,
                            SMB2CreateDisposition.FILE_OPEN,
                            null);
            // Close the SMB file handle when the stream is closed, before the session is torn down.
            return new FilterInputStream(file.getInputStream()) {
                @Override
                public void close() throws IOException {
                    try {
                        super.close();
                    } finally {
                        file.close();
                    }
                }
            };
        } catch (SMBApiException e) {
            throw new IOException("cannot read " + path + ": " + e.getMessage(), e);
        }
    }

    @Override
    public void delete(String path) throws IOException {
        try {
            share.rm(smbPath(path));
        } catch (SMBApiException e) {
            if (isNotFound(e)) {
                return;
            }
            throw new IOException("cannot delete " + path + ": " + e.getMessage(), e);
        }
    }

    @Override
    public void close() {
        closeQuietly(share);
        closeQuietly(session);
        closeQuietly(connection);
        closeQuietly(smbClient);
    }

    private static boolean isNotFound(SMBApiException e) {
        return e.getStatus() == NtStatus.STATUS_OBJECT_NAME_NOT_FOUND
                || e.getStatus() == NtStatus.STATUS_OBJECT_PATH_NOT_FOUND;
    }

    private static boolean isSet(long attributes, FileAttributes attribute) {
        return (attributes & attribute.getValue()) != 0;
    }

    private static void closeQuietly(AutoCloseable closeable) {
        try {
            closeable.close();
        } catch (Exception ignored) {
            // Best-effort teardown; the session is being abandoned anyway.
        }
    }

    /** The share-relative listing path: blank means the share root, which smbj lists as "". */
    private static String smbDir(String directory) {
        return directory == null || directory.isBlank() ? "" : smbPath(directory);
    }

    /** SMB paths use backslashes; internal identities keep forward slashes. */
    private static String smbPath(String path) {
        return path.replace('/', '\\');
    }

    private static String slashed(String path) {
        return path.replace('\\', '/');
    }

    private static String join(String directory, String name) {
        if (directory.isEmpty()) {
            return name;
        }
        return directory.endsWith("\\") ? directory + name : directory + "\\" + name;
    }
}
