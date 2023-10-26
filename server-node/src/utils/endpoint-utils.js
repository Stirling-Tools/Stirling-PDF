
export function respondWithBinaryPdf(res, buffer, filename) {
    res.writeHead(200, {
        'Content-Type': "application/pdf",
        'Content-disposition': 'attachment;filename=' + filename,
        'Content-Length': buffer.length
    });
    res.end(Buffer.from(buffer, 'binary'))
}
