class FileUtils {
  static extractFileExtension(filename) {
    if (!filename || filename.trim().length <= 0) return "";
    let trimmedName = filename.trim();
    return trimmedName.substring(trimmedName.lastIndexOf(".") + 1);
  }

  static transformFileSize(size) {
    if (!size) return `0Bs`;
    let oneKB = 1024;
    let oneMB = oneKB * 1024;
    let oneGB = oneMB * 1024;
    let oneTB = oneGB * 1024;

    if (size < oneKB) return `${this._toFixed(size)}Bs`;
    else if (oneKB <= size && size < oneMB) return `${this._toFixed(size / oneKB)}KBs`;
    else if (oneMB <= size && size < oneGB) return `${this._toFixed(size / oneMB)}MBs`;
    else if (oneGB <= size && size < oneTB) return `${this._toFixed(size / oneGB)}GBs`;
    else return `${this._toFixed(size / oneTB)}TBs`;
  }

  static _toFixed(val, digits = 1) {
    // Return value without ending 0s after decimal point
    // Example: if res == 145.0 then return 145, else if 145.x (where x != 0) return 145.x
    let res = val.toFixed(digits);
    let resRounded = (res|0);
    return res == resRounded ? resRounded : res;
  }
}

export default FileUtils;
