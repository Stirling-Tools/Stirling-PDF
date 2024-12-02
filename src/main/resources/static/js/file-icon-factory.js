class FileIconFactory {
  static createFileIcon(fileExtension) {
    let ext = fileExtension.toLowerCase();
    switch (ext) {
      case "pdf":
        return this.createPDFIcon();
      case "csv":
        return this.createCSVIcon();
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

  static createUnknownFileIcon() {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960" fill="currentColor"><path d="M263.72-96Q234-96 213-117.15T192-168v-624q0-29.7 21.15-50.85Q234.3-864 264-864h312l192 192v504q0 29.7-21.16 50.85Q725.68-96 695.96-96H263.72ZM528-624h168L528-792v168Z"/></svg>`;
  }
}

export default FileIconFactory;
