// ============================================================
// 📄 Resume Parser — Extract text from PDF, DOCX, TXT
// ============================================================

const fs = require('fs');
const path = require('path');

const UPLOADS_DIR = path.join(__dirname, 'uploads');

// Ensure uploads directory exists
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

/**
 * Parse a resume file and extract text content.
 * @param {string} filePath - Path to the uploaded file
 * @param {string} mimeType - MIME type of the file
 * @returns {Promise<{text: string, fileName: string, fileType: string}>}
 */
async function parseResume(filePath, originalFileName) {
  const ext = path.extname(originalFileName || filePath).toLowerCase();
  const mimeMap = {
    '.pdf': 'pdf',
    '.docx': 'docx',
    '.doc': 'doc',
    '.txt': 'txt',
    '.rtf': 'txt'
  };
  const fileType = mimeMap[ext] || 'txt';

  let text = '';

  try {
    switch (fileType) {
      case 'pdf':
        text = await parsePDF(filePath);
        break;
      case 'docx':
        text = await parseDOCX(filePath);
        break;
      case 'txt':
      default:
        text = fs.readFileSync(filePath, 'utf8');
        break;
    }
  } catch (err) {
    console.error('⚠️ Resume parse error:', err.message);
    // Fallback: try reading as plain text
    text = fs.readFileSync(filePath, 'utf8').substring(0, 10000);
  }

  // Clean up text
  text = text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim();

  // Limit to 10000 chars for AI processing
  if (text.length > 10000) {
    text = text.substring(0, 10000) + '\n\n[...truncated...]';
  }

  return {
    text,
    fileName: originalFileName || path.basename(filePath),
    fileType
  };
}

/**
 * Parse PDF using pdf-parse
 */
async function parsePDF(filePath) {
  try {
    const pdfParse = require('pdf-parse');
    const buf = fs.readFileSync(filePath);
    const data = await pdfParse(buf);
    return data.text || '';
  } catch (err) {
    throw new Error(`PDF parse failed: ${err.message}`);
  }
}

/**
 * Parse DOCX using mammoth
 */
async function parseDOCX(filePath) {
  try {
    const mammoth = require('mammoth');
    const result = await mammoth.extractRawText({ path: filePath });
    return result.value || '';
  } catch (err) {
    throw new Error(`DOCX parse failed: ${err.message}`);
  }
}

/**
 * Clean up uploaded file after processing
 */
function cleanupFile(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (_) {}
}

module.exports = { parseResume, cleanupFile, UPLOADS_DIR };
