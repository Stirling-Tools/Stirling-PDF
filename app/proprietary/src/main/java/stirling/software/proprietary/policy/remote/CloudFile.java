package stirling.software.proprietary.policy.remote;

public interface CloudFile {

    String identity();

    String version();

    String name();

    long size();

    boolean hasContentHash();
}
