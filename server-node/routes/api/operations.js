
import { rotatePages } from '../../src/pdf-operations.js';
import { respondWithBinaryPdf } from '../../src/utils/endpoint-utils.js';

import express from 'express';
const router = express.Router();
import multer from 'multer'
const upload = multer();

router.post('/rotate-pdf', upload.single("pdfFile"), async function(req, res, next) {
    console.debug("rotating pdf:", req.file)
    const rotated = await rotatePages(req.file.buffer, 90)
    const newFilename = req.file.originalname.replace(/(\.[^.]+)$/, '_rotated$1'); // add '_rotated' just before the file extension
    respondWithBinaryPdf(res, rotated, newFilename);
});

export default router;