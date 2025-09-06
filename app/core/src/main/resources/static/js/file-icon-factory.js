class FileIconFactory {
  static createFileIcon(fileExtension) {
    let ext = fileExtension.toLowerCase();
    switch (ext) {
      case "pdf":
        return this.createPDFIcon();
      case "csv":
        return this.createCSVIcon();
      case "xls":
      case "xlsx":
        return this.createXLSXIcon();
      case "jpe":
      case "jpg":
      case "jpeg":
      case "gif":
      case "png":
      case "bmp":
      case "ico":
      case "svg":
      case "svgz":
      case "tif":
      case "tiff":
      case "ai":
      case "drw":
      case "pct":
      case "psp":
      case "xcf":
      case "psd":
      case "raw":
      case "webp":
      case "heic":
        return this.createImageIcon();
      default:
        return this.createUnknownFileIcon();
    }
  }

  static createPDFIcon() {
    return `
    <svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" class="bi bi-filetype-pdf" viewBox="0 0 16 16">
        <path fill-rule="evenodd" d="M14 4.5V14a2 2 0 0 1-2 2h-1v-1h1a1 1 0 0 0 1-1V4.5h-2A1.5 1.5 0 0 1 9.5 3V1H4a1 1 0 0 0-1 1v9H2V2a2 2 0 0 1 2-2h5.5zM1.6 11.85H0v3.999h.791v-1.342h.803q.43 0 .732-.173.305-.175.463-.474a1.4 1.4 0 0 0 .161-.677q0-.375-.158-.677a1.2 1.2 0 0 0-.46-.477q-.3-.18-.732-.179m.545 1.333a.8.8 0 0 1-.085.38.57.57 0 0 1-.238.241.8.8 0 0 1-.375.082H.788V12.48h.66q.327 0 .512.181.185.183.185.522m1.217-1.333v3.999h1.46q.602 0 .998-.237a1.45 1.45 0 0 0 .595-.689q.196-.45.196-1.084 0-.63-.196-1.075a1.43 1.43 0 0 0-.589-.68q-.396-.234-1.005-.234zm.791.645h.563q.371 0 .609.152a.9.9 0 0 1 .354.454q.118.302.118.753a2.3 2.3 0 0 1-.068.592 1.1 1.1 0 0 1-.196.422.8.8 0 0 1-.334.252 1.3 1.3 0 0 1-.483.082h-.563zm3.743 1.763v1.591h-.79V11.85h2.548v.653H7.896v1.117h1.606v.638z"/>
    </svg>
      `;
  }

  static createImageIcon() {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960" fill="currentColor"><path d="M216-144q-30 0-51-21.5T144-216v-528q0-29 21-50.5t51-21.5h528q30 0 51 21.5t21 50.5v528q0 29-21 50.5T744-144H216Zm48-144h432L552-480 444-336l-72-96-108 144Z"/></svg>`;
  }

  static createCSVIcon() {
    return `
    <svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" class="bi bi-filetype-csv" viewBox="0 0 16 16">
      <path fill-rule="evenodd" d="M14 4.5V14a2 2 0 0 1-2 2h-1v-1h1a1 1 0 0 0 1-1V4.5h-2A1.5 1.5 0 0 1 9.5 3V1H4a1 1 0 0 0-1 1v9H2V2a2 2 0 0 1 2-2h5.5zM3.517 14.841a1.13 1.13 0 0 0 .401.823q.195.162.478.252.284.091.665.091.507 0 .859-.158.354-.158.539-.54.185-.382.185-.816 0-.335-.123-.628a1.4 1.4 0 0 0-.366-.486 1.8 1.8 0 0 0-.614-.314 2.8 2.8 0 0 0-.865-.118 2.1 2.1 0 0 0-.614.094 1.4 1.4 0 0 0-.471.264 1.1 1.1 0 0 0-.298.429.9.9 0 0 0-.103.539h.606a.4.4 0 0 1 .096-.258.5.5 0 0 1 .213-.164.6.6 0 0 1 .33-.082.7.7 0 0 1 .458.132.4.4 0 0 1 .153.372.4.4 0 0 1-.085.235.7.7 0 0 1-.25.192 1.4 1.4 0 0 1-.407.115c-.127.023-.266.05-.416.081a1.8 1.8 0 0 0-.534.187 1.2 1.2 0 0 0-.382.346 1 1 0 0 0-.138.537q0 .295.101.517M8.717 14.841a1.13 1.13 0 0 0 .401.823q.195.162.478.252.284.091.665.091.507 0 .859-.158.354-.158.539-.54.185-.382.185-.816 0-.335-.123-.628a1.4 1.4 0 0 0-.366-.486 1.8 1.8 0 0 0-.614-.314 2.8 2.8 0 0 0-.865-.118 2.1 2.1 0 0 0-.614.094 1.4 1.4 0 0 0-.471.264 1.1 1.1 0 0 0-.298.429.9.9 0 0 0-.103.539h.606a.4.4 0 0 1 .096-.258.5.5 0 0 1 .213-.164.6.6 0 0 1 .33-.082.7.7 0 0 1 .458.132.4.4 0 0 1 .153.372.4.4 0 0 1-.085.235.7.7 0 0 1-.25.192 1.4 1.4 0 0 1-.407.115c-.127.023-.266.05-.416.081a1.8 1.8 0 0 0-.534.187 1.2 1.2 0 0 0-.382.346 1 1 0 0 0-.138.537q0 .295.101.517M14.229 13.12v.506H11.85v-.506h1.063v-1.277H11.85v-.506h2.379v.506h-1.063z"/>
    </svg>
    `;
  }

  static createXLSXIcon() {
    return `
    <svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" class="bi bi-file-earmark-excel" viewBox="0 0 16 16">
      <path d="M5.884 6.68a.5.5 0 1 0-.768.64L7.349 10l-2.233 2.68a.5.5 0 0 0 .768.64L8 10.781l2.116 2.54a.5.5 0 0 0 .768-.641L8.651 10l2.233-2.68a.5.5 0 0 0-.768-.64L8 9.219l-2.116-2.54z"/>
      <path d="M14 14V4.5L9.5 0H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2M9.5 3A1.5 1.5 0 0 0 11 4.5h2V14a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1h5.5z"/>
    </svg>
    `;
  }

  static createUnknownFileIcon() {
    return `
    <svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" class="bi bi-file-earmark" viewBox="0 0 16 16">
      <path d="M14 4.5V14a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V2a2 2 0 0 1 2-2h5.5zm-3 0A1.5 1.5 0 0 1 9.5 3V1H4a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V4.5z"/>
    </svg>
    `;
  }
}

export default FileIconFactory;
