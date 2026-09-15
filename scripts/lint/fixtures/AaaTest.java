package fixtures;

class AaaTest {

    void clampsToTierMaximum() {
        // Arrange
        var wallet = walletAt(500);

        // Act
        var result = clamp(wallet);

        // Assert
        assertEquals(100, result.cap());

        // Assert the cap is clamped rather than rejected, because the tier
        // downgrade path relies on it.
        assertTrue(result.clamped());
    }
}
