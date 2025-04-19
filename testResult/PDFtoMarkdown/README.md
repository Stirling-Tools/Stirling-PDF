## E2E
* 我们可以看到可以看到生成后的markdown文件，存在诸多问题，比如表格实效，图片失效，文字顺序出错。
## API
### PDF to Markdown
```shell
curl -X POST "http://localhost:9090/api/v1/convert/pdf/markdown" \
  -H "Origin: http://localhost:9090" \
  -H "Referer: http://localhost:9090/pdf-to-markdown" \
  -F "fileInput=@/path/to/sample.pdf;type=application/pdf" \
  --output output.md
```
* response
```shell
 % Total    % Received % Xferd  Average Speed   Time    Time     Time  Current
                                 Dload  Upload   Total   Spent    Left  Speed
100  394k  100   542  100  393k     10   7851  0:00:54  0:00:51  0:00:03   134

```
### empty PDF
```shell
touch empty.pdf
curl -X POST "http://localhost:9090/api/v1/convert/pdf/markdown" \
  -H "Origin: http://localhost:9090" \
  -H "Referer: http://localhost:9090/pdf-to-markdown" \
  -F "fileInput=@empty.pdf;type=application/pdf"
```
* response
```json
{
  "timestamp":"2025-04-19T19:33:29.060+00:00",
    "status":500,
    "error":"Internal Server Error",
    "exception":"java.io.IOException",
    "trace":"too large,ingored"
}
```

### lack fileInput field
```shell
curl -X POST "http://localhost:9090/api/v1/convert/pdf/markdown" \
  -H "Content-Type: multipart/form-data" \
  -H "Origin: http://localhost:9090" \
  -H "Referer: http://localhost:9090/pdf-to-markdown"
```
* response
```html
<meta http-equiv="Content-Type" content="text/html;charset=ISO-8859-1"/>
<title>Error 400 bad multipart</title>
</head>
<body><h2>HTTP ERROR 400 bad multipart</h2>
<table>
<tr><th>URI:</th><td>/api/v1/convert/pdf/markdown</td></tr>
<tr><th>STATUS:</th><td>400</td></tr>
<tr><th>MESSAGE:</th><td>bad multipart</td></tr>
<tr><th>SERVLET:</th><td>dispatcherServlet</td></tr>
<tr><th>CAUSED BY:</th><td>org.springframework.web.multipart.MultipartException: Failed to parse multipart servlet request</td></tr>
<tr><th>CAUSED BY:</th><td>jakarta.servlet.ServletException: org.eclipse.jetty.http.BadMessageException: 400: bad multipart</td></tr>
<tr><th>CAUSED BY:</th><td>org.eclipse.jetty.http.BadMessageException: 400: bad multipart</td></tr>
<tr><th>CAUSED BY:</th><td>java.util.concurrent.CompletionException: java.lang.IllegalStateException: No multipart boundary parameter in Content-Type</td></tr>
```
* we can see the http code is 400
### upload file(is not pdf format)
```shell
echo "This is not a PDF" > not_a_pdf.txt
curl -X POST "http://localhost:9090/api/v1/convert/pdf/markdown" \
  -H "Origin: http://localhost:9090" \
  -H "Referer: http://localhost:9090/pdf-to-markdown" \
  -F "fileInput=@not_a_pdf.txt;type=application/pdf"
```
* response:
```json
{
    "timestamp": "2025-04-19T19:35:54.176+00:00",
    "status": 500,
    "error": "Internal Server Error",
    "exception": "java.io.IOException",
    "trace": "java.io.IOException: too large, ingored"
}
```

### large pdf file

```shell
dd if=/dev/zero of=large.pdf bs=1M count=50
curl -X POST "http://localhost:9090/api/v1/convert/pdf/markdown" \
  -H "Origin: http://localhost:9090" \
  -H "Referer: http://localhost:9090/pdf-to-markdown" \
  -F "fileInput=@/path/to/large.pdf;type=application/pdf" \
  --output large_output.md
```
* response
```json
 % Total    % Received % Xferd  Average Speed   Time    Time     Time  Current
                                 Dload  Upload   Total   Spent    Left  Speed
100 50.0M    0  7534  100 50.0M    156  1063k  0:00:48  0:00:48 --:--:--  1876

```
