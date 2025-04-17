```curl
curl 'http://localhost:9090/api/v1/convert/pdf/markdown' \
  -H 'Accept: */*' \
  -H 'Accept-Language: zh-CN,zh;q=0.9,en;q=0.8' \
  -H 'Cache-Control: no-cache' \
  -H 'Connection: keep-alive' \
  -H 'Content-Type: multipart/form-data; boundary=----WebKitFormBoundaryPJHT4P9TTmBkYHfl' \
  -b 'Idea-858fbbc8=83332792-11c8-4114-baf3-80dfa95bc2a1; token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjE4Yjg0YTg4LTIzOWMtNDUxMy1iOGYxLWIzMTlhZTFiOGExMiJ9.hM2U8JLQ4wSVWsJ-TVXDofwICq6LOk89zvVoXQ9TECQ; authjs.csrf-token=b41a8b0ca45ecab3f39a8d36f519b06e8f6a10e618738f8da9dae25bfaf18e0d%7Cd57f1d087ee1811c473138cc06a36be4f2ecd4444d5e1bea16bcc7e713d2848f; authjs.callback-url=http%3A%2F%2Flocalhost%3A3001; __stripe_mid=2d0e63fa-8ec2-4c07-9fcc-d265afe3ef7d67eda5; __next_hmr_refresh_hash__=4; NEXT_LOCALE=en; session=9XB6PKMHXuw8fqutPsunv32XkG9SURJxwFIKz7OAM0o; cc_cookie=%7B%22categories%22%3A%5B%22necessary%22%2C%22analytics%22%5D%2C%22revision%22%3A0%2C%22data%22%3Anull%2C%22consentTimestamp%22%3A%222025-04-16T01%3A32%3A51.025Z%22%2C%22consentId%22%3A%2224ef8464-ff47-4934-8ba7-5ae0c50c8ff8%22%2C%22services%22%3A%7B%22necessary%22%3A%5B%5D%2C%22analytics%22%3A%5B%5D%7D%2C%22languageCode%22%3A%22en%22%2C%22lastConsentTimestamp%22%3A%222025-04-16T01%3A32%3A51.025Z%22%2C%22expirationTime%22%3A1760491971026%7D; JSESSIONID=node0k0mwiga25gx6zmuqkfizpc5t1.node0' \
  -H 'Origin: http://localhost:9090' \
  -H 'Pragma: no-cache' \
  -H 'Referer: http://localhost:9090/pdf-to-markdown' \
  -H 'Sec-Fetch-Dest: empty' \
  -H 'Sec-Fetch-Mode: cors' \
  -H 'Sec-Fetch-Site: same-origin' \
  -H 'User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36' \
  -H 'sec-ch-ua: "Google Chrome";v="135", "Not-A.Brand";v="8", "Chromium";v="135"' \
  -H 'sec-ch-ua-mobile: ?0' \
  -H 'sec-ch-ua-platform: "macOS"' \
  --data-raw $'------WebKitFormBoundaryPJHT4P9TTmBkYHfl\r\nContent-Disposition: form-data; name="fileInput"; filename="pdf.pdf"\r\nContent-Type: application/pdf\r\n\r\n\r\n------WebKitFormBoundaryPJHT4P9TTmBkYHfl--\r\n'
  ```

![img_1.png](img_1.png)
