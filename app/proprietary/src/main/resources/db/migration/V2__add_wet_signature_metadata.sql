-- Migration: Add wet signature metadata fields to signing_participants
-- Date: 2025-01-15
-- Description: Add columns to store visual signature annotations placed by participants.
--              This metadata is used to overlay wet signatures on the PDF during finalization
--              and is cleared after the final signed PDF is generated.

-- ===========================================================================
-- Add wet signature metadata columns
-- ===========================================================================

-- Type of wet signature: "canvas" (drawn), "image" (uploaded), "text" (typed)
ALTER TABLE signing_participants ADD COLUMN IF NOT EXISTS wet_signature_type VARCHAR(20);

-- Base64-encoded image data or text content
-- Using TEXT for large base64 image data
ALTER TABLE signing_participants ADD COLUMN IF NOT EXISTS wet_signature_data TEXT;

-- Position and size of the signature on the PDF
ALTER TABLE signing_participants ADD COLUMN IF NOT EXISTS wet_signature_page INTEGER;
ALTER TABLE signing_participants ADD COLUMN IF NOT EXISTS wet_signature_x DOUBLE PRECISION;
ALTER TABLE signing_participants ADD COLUMN IF NOT EXISTS wet_signature_y DOUBLE PRECISION;
ALTER TABLE signing_participants ADD COLUMN IF NOT EXISTS wet_signature_width DOUBLE PRECISION;
ALTER TABLE signing_participants ADD COLUMN IF NOT EXISTS wet_signature_height DOUBLE PRECISION;

-- ===========================================================================
-- Add indexes for common queries
-- ===========================================================================

-- Index for querying participants with wet signatures during finalization
CREATE INDEX IF NOT EXISTS idx_participants_wet_signature
ON signing_participants(session_id, wet_signature_type)
WHERE wet_signature_type IS NOT NULL;

-- ===========================================================================
-- Add comments for documentation
-- ===========================================================================

COMMENT ON COLUMN signing_participants.wet_signature_type IS
'Type of wet signature: canvas, image, or text. NULL if participant has not placed a visual signature.';

COMMENT ON COLUMN signing_participants.wet_signature_data IS
'Base64-encoded image data or text content for the wet signature. Cleared after finalization for GDPR compliance.';

COMMENT ON COLUMN signing_participants.wet_signature_page IS
'Zero-indexed page number where the wet signature is placed.';

COMMENT ON COLUMN signing_participants.wet_signature_x IS
'X coordinate (in PDF points) of the signature rectangle, measured from left edge.';

COMMENT ON COLUMN signing_participants.wet_signature_y IS
'Y coordinate (in PDF points) of the signature rectangle, measured from top edge (UI coordinates, will be converted for PDF).';

COMMENT ON COLUMN signing_participants.wet_signature_width IS
'Width of the signature rectangle in PDF points.';

COMMENT ON COLUMN signing_participants.wet_signature_height IS
'Height of the signature rectangle in PDF points.';

-- ===========================================================================
-- VERIFICATION QUERIES (Run these to verify migration)
-- ===========================================================================

-- Check new column structure
-- SELECT column_name, data_type, is_nullable, column_default
-- FROM information_schema.columns
-- WHERE table_name = 'signing_participants'
-- AND column_name LIKE 'wet_signature%'
-- ORDER BY ordinal_position;

-- Check index creation
-- SELECT indexname, indexdef
-- FROM pg_indexes
-- WHERE tablename = 'signing_participants'
-- AND indexname LIKE '%wet_signature%';
