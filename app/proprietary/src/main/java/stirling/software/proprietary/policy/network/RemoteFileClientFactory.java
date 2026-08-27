package stirling.software.proprietary.policy.network;

import java.io.IOException;

import org.springframework.stereotype.Component;

import lombok.RequiredArgsConstructor;

import stirling.software.common.annotations.ConditionalOnProcessor;

/**
 * Opens a fresh {@link RemoteFileClient} for one {@link NetworkConfig}, dispatched by protocol. The
 * host is guarded against private addresses before every connect, since it comes from a portal user
 * and each operation opens its own short-lived session (there is no long-lived pool to guard once).
 */
@Component
@ConditionalOnProcessor
@RequiredArgsConstructor
public class RemoteFileClientFactory {

    private final NetworkHostGuard hostGuard;

    public RemoteFileClient connect(NetworkConfig config) throws IOException {
        hostGuard.requirePermitted(config.host());
        return switch (config.protocol()) {
            case SFTP -> SftpFileClient.connect(config);
            case FTP -> FtpFileClient.connect(config);
            case SMB -> SmbFileClient.connect(config);
        };
    }
}
