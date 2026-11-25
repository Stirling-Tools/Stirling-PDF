package stirling.software.proprietary.policy.remote;

public interface ContentHasher {

    void update(byte[] bytes, int offset, int length);

    String gate();
}
