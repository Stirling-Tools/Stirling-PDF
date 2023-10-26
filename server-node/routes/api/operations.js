
import { rotatePages } from '../../src/pdf-operations.js'

import express from 'express';
const router = express.Router();
import multer from 'multer'
const upload = multer();

router.post('/rotate-pdf', upload.single("pdfFile"), async function(req, res, next) {
    console.debug("rotating pdf:", req.file)

    const rotated = await rotatePages(req.file.buffer, 90)

    // add '_rotated' just before the file extension
    const newFilename = req.file.originalname.replace(/(\.[^.]+)$/, '_rotated$1');

    res.writeHead(200, {
        'Content-Type': "application/pdf",
        'Content-disposition': 'attachment;filename=' + newFilename,
        'Content-Length': rotated.length
    });
    res.end(Buffer.from(rotated, 'binary'))
});

export default router;