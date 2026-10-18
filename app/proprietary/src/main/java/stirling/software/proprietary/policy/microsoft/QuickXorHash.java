package stirling.software.proprietary.policy.microsoft;

import java.util.Base64;

/**
 * Microsoft's QuickXorHash, the content hash OneDrive and SharePoint report for every file as
 * {@code file.hashes.quickXorHash}. Computing it locally lets an output be recorded in the ledger
 * at the exact version the next listing will report, before the upload makes it visible. A port of
 * the published reference algorithm; not thread-safe, one instance per stream.
 */
public final class QuickXorHash {

    private static final int WIDTH_IN_BITS = 160;
    private static final int SHIFT = 11;

    private final long[] data = new long[(WIDTH_IN_BITS - 1) / 64 + 1];
    private int shiftSoFar;
    private long lengthSoFar;

    public void update(byte[] array, int start, int size) {
        int currentShift = shiftSoFar;
        int vectorArrayIndex = currentShift / 64;
        int vectorOffset = currentShift % 64;
        int iterations = Math.min(size, WIDTH_IN_BITS);

        for (int i = 0; i < iterations; i++) {
            boolean isLastCell = vectorArrayIndex == data.length - 1;
            int bitsInVectorCell = isLastCell ? WIDTH_IN_BITS % 64 : 64;

            if (vectorOffset <= bitsInVectorCell - 8) {
                for (int j = start + i; j < size + start; j += WIDTH_IN_BITS) {
                    data[vectorArrayIndex] ^= (array[j] & 0xFFL) << vectorOffset;
                }
            } else {
                int index1 = vectorArrayIndex;
                int index2 = isLastCell ? 0 : vectorArrayIndex + 1;
                int low = bitsInVectorCell - vectorOffset;
                int xoredByte = 0;
                for (int j = start + i; j < size + start; j += WIDTH_IN_BITS) {
                    xoredByte ^= array[j] & 0xFF;
                }
                data[index1] ^= ((long) xoredByte) << vectorOffset;
                data[index2] ^= ((long) xoredByte) >>> low;
            }

            vectorOffset += SHIFT;
            while (vectorOffset >= bitsInVectorCell) {
                vectorArrayIndex = isLastCell ? 0 : vectorArrayIndex + 1;
                vectorOffset -= bitsInVectorCell;
            }
        }

        shiftSoFar = (int) ((shiftSoFar + (long) SHIFT * (size % WIDTH_IN_BITS)) % WIDTH_IN_BITS);
        lengthSoFar += size;
    }

    /** The base64 digest, in the form Graph reports it. */
    public String digestBase64() {
        byte[] result = new byte[(WIDTH_IN_BITS - 1) / 8 + 1];
        for (int i = 0; i < data.length; i++) {
            int bytes = Math.min(8, result.length - i * 8);
            for (int b = 0; b < bytes; b++) {
                result[i * 8 + b] = (byte) (data[i] >>> (8 * b));
            }
        }
        int lengthOffset = WIDTH_IN_BITS / 8 - Long.BYTES;
        for (int b = 0; b < Long.BYTES; b++) {
            result[lengthOffset + b] ^= (byte) (lengthSoFar >>> (8 * b));
        }
        return Base64.getEncoder().encodeToString(result);
    }
}
