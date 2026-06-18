function normalizeFileExtension(extension?: string) {
  return extension?.trim().replace(/^\./, "").toLowerCase() || "";
}

function getFileNameExtension(fileName: string) {
  const dotIdx = fileName.lastIndexOf(".");
  if (dotIdx <= 0 || dotIdx === fileName.length - 1) {
    return "";
  }
  return fileName.slice(dotIdx + 1).toLowerCase();
}

export function fileNameForIconLookup(fileName: string, extension?: string) {
  const ext = normalizeFileExtension(extension);
  if (!ext) {
    return fileName;
  }
  if (getFileNameExtension(fileName) === ext) {
    return fileName;
  }
  return `${fileName}.${ext}`;
}

export const channelSearchFileIconTestUtils = {
  fileNameForIconLookup,
};
