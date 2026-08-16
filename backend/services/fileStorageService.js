/* ============================================================
   LockDoc — File Storage Service
   Handles file uploads to Cloudinary when configured, with a
   local fallback for development and testing.
   ============================================================ */
const fs = require('fs');
const path = require('path');
const multer = require('multer');

const UPLOAD_ROOT = path.join(__dirname, '..', 'uploads', 'vaults');
fs.mkdirSync(UPLOAD_ROOT, { recursive: true });

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
  if (cloudinaryEnabled && cloudinary) {
    const uploadOptions = {
      folder: folderPath,
      resource_type: 'auto',
      use_filename: true,
      unique_filename: false,
      overwrite: false
    };
    const result = await cloudinary.uploader.upload(file.path, uploadOptions);
    return { url: result.secure_url, provider: 'cloudinary', publicId: result.public_id };
  }

  // Local fallback: expose the uploaded file from /uploads/vaults
  const publicUrl = `/uploads/vaults/${encodeURIComponent(path.basename(file.path))}`;
  return { url: publicUrl, provider: 'local' };
}

module.exports = {
  multerUpload,
  uploadFile,
  allowedMimeTypes
};
