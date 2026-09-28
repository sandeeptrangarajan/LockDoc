/* ============================================================
   LockDoc — File Storage Service
   Handles file uploads to Cloudinary when configured, with a
   local fallback for development and testing.
   ============================================================ */
const fs = require('fs');
const path = require('path');
const multer = require('multer');

const os = require('os');
const isServerless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
const UPLOAD_ROOT = isServerless
  ? path.join(os.tmpdir(), 'uploads', 'vaults')
  : path.join(__dirname, '..', 'uploads', 'vaults');

try {
  fs.mkdirSync(UPLOAD_ROOT, { recursive: true });
} catch (err) {
  console.warn('Upload directory initialization notice:', err.message);
}

const allowedMimeTypes = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation'
];

const storage = multer.diskStorage({
  destination(req, file, cb) {
    cb(null, UPLOAD_ROOT);
  },
  filename(req, file, cb) {
    const timestamp = Date.now();
    const safeName = file.originalname.replace(/[^a-zA-Z0-9\.\-_]/g, '_');
    cb(null, `${timestamp}-${safeName}`);
  }
});

function fileFilter(req, file, cb) {
  if (!allowedMimeTypes.includes(file.mimetype)) {
    return cb(new Error('Unsupported file type: ' + file.mimetype));
  }
  cb(null, true);
}

const multerUpload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 50 * 1024 * 1024 // 50 MB per file
  }
});

let cloudinary = null;
let cloudinaryEnabled = false;

if (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET) {
  try {
    cloudinary = require('cloudinary').v2;
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET
    });
    cloudinaryEnabled = true;
  } catch (err) {
    console.warn('Cloudinary module unavailable, running with local upload fallback.');
  }
}

async function uploadFile(file, folderPath) {
  let fileBuffer = null;
  let base64Data = null;
  let dataUrl = null;

  try {
    if (file.path && fs.existsSync(file.path)) {
      fileBuffer = fs.readFileSync(file.path);
      base64Data = fileBuffer.toString('base64');
      const mime = file.mimetype || 'application/octet-stream';
      dataUrl = `data:${mime};base64,${base64Data}`;
    } else if (file.buffer) {
      fileBuffer = file.buffer;
      base64Data = fileBuffer.toString('base64');
      const mime = file.mimetype || 'application/octet-stream';
      dataUrl = `data:${mime};base64,${base64Data}`;
    }
  } catch (err) {
    console.warn('⚠️ Could not generate base64 representation:', err.message);
  }

  if (cloudinaryEnabled && cloudinary && file.path && fs.existsSync(file.path)) {
    try {
      const uploadOptions = {
        folder: folderPath,
        resource_type: 'auto',
        use_filename: true,
        unique_filename: false,
        overwrite: false
      };
      const result = await cloudinary.uploader.upload(file.path, uploadOptions);
      return {
        url: result.secure_url,
        fileData: base64Data,
        dataUrl: dataUrl || result.secure_url,
        provider: 'cloudinary',
        publicId: result.public_id
      };
    } catch (cErr) {
      console.warn('⚠️ Cloudinary upload failed, falling back to database/local:', cErr.message);
    }
  }

  // Database / Local fallback: store dataUrl or relative URL
  const filename = path.basename(file.path || file.originalname || 'document');
  const publicUrl = `/uploads/vaults/${encodeURIComponent(filename)}`;

  return {
    url: dataUrl || publicUrl,
    fileData: base64Data,
    dataUrl: dataUrl || publicUrl,
    publicUrl: publicUrl,
    provider: base64Data ? 'mongodb' : 'local'
  };
}

module.exports = {
  multerUpload,
  uploadFile,
  allowedMimeTypes
};
