# Storage transfer performance

PDF tools normally receive the whole file as a multipart upload. On a high-latency WAN link that
dominates every operation. A 20 MB merge over a 128 KB/s uplink took 2.5 minutes; the same merge
took 0.034 s once the bytes were already on the server.

## Server-side references

A request may send `fileId=storage:<id>` or repeated `fileIds=storage:<id>` instead of `fileInput`.
`AutoJobAspect` resolves the reference through `StoredFileResolver` and passes the result to the
existing controller as a `MultipartFile`, so tools do not need a second request model.

The browser only uses a reference while its local stub still describes the original bytes.
Edited children, share-link stubs, and encrypted PDFs fall back to an upload.

## Chunked upload

`POST /api/v1/storage/uploads` opens a session, `PUT /{id}/chunks/{index}` writes each chunk at its
final offset, and `POST /{id}/complete` stores the sparse payload. The server streams each chunk
into `FileChannel.write`, so it never buffers a whole chunk in heap.

The client uses adaptive 256 KiB to 4 MiB chunks over up to six HTTP/1.1 connections. On a
simulated 128 KB/s per-connection link with 50 ms latency, a 20 MB file took 63.1 s with 4 MiB
chunks and four workers, and 31.1 s with 1 MiB chunks and six workers. A 2 MB file took 15.1 s as
one request. On the live instance, six parallel 256 KiB uploads moved 1.5 MB in 4.3 s, while the
single-request path moved 2 MB in 15.5 to 22 s.

## Direct download

`GET /api/v1/storage/files/{id}/download?direct=true` is the default for local unencrypted files. It
writes the file through one reused 1 MiB direct `ByteBuffer` and uses the blocking write callback as
the backpressure boundary. One buffer is live per transfer.

`Range`, `HEAD`, S3 presigned URLs, encrypted storage, database storage, and non-Jetty containers
stay on Spring's `ResourceHttpMessageConverter`, which supplies 206 responses and portable servlet
behavior. The direct path mirrors the security headers that the bypassed security header writer
would add.

## Measurements

Local loopback, 512 MB file, warm page cache:

| Path | Throughput |
|---|---:|
| Spring MVC indirect | 2.2 GB/s |
| Direct Jetty path | 8.4 GB/s |
| Jetty `ResourceHandler` standalone | 9.9 GB/s |
| JDK `jwebserver` | 3.5 GB/s |

The gap to Jetty's standalone handler is per-request application cost, not the copy loop. Eight
concurrent direct downloads aggregate 5.8 GB/s versus 2.0 GB/s indirect. A 4 MB/s slow receiver does
not starve a concurrent fast download.

Merge after copy elimination, same file:

| Input | Reference | Upload |
|---|---:|---:|
| 20 MB | 0.034 s, 506 B up | 0.059 to 0.074 s, 21 MB up |
| 100 MB | 0.12 to 0.15 s, 506 B up | 0.26 s, 105 MB up |
| 512 MB | 0.52 to 0.87 s, 506 B up | 1.28 to 1.44 s, 537 MB up |

A browser merge of two server files sends 748 bytes of form data and skips the upload entirely.

## TLS and reverse proxies

Do not terminate TLS in Jetty for bulk storage traffic. Jetty with JSSE measured 67 to 71 MB/s per
connection. OpenSSL `s_server` measured 567 to 586 MB/s on the same file. A local nginx TLS proxy
measured 582 to 591 MB/s on HTTP/1.1 and 535 to 551 MB/s on HTTP/2.

Terminate TLS at the proxy. On the plaintext app leg behind nginx, direct download measured 4.8 GB/s
versus 2.4 GB/s indirect.

## Approaches rejected

- Netty io_uring is Linux-native, has Java 25 issues, and replacing Spring MVC with Netty is a
  rewrite. It improves IOPS and connection counts, not a slow WAN ingress.
- Jetty 12.1 does not expose `FileChannel.transferTo` for `Resource`, and user-space TLS breaks
  kernel zero-copy. The direct `ByteBuffer` write is the practical boundary in Spring MVC.
- Memory-mapped files and FFM `MemorySegment` views measured 7.7 to 8.1 GB/s, no better than the
  direct read loop, so that code was removed.
