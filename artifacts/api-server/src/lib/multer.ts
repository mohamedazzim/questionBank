import multer from "multer";
import path from "path";

const ALLOWED_TYPES = ["image/png", "image/jpg", "image/jpeg"];
const ALLOWED_ZIP_TYPES = ["application/zip", "application/x-zip-compressed"];
const ALLOWED_RAR_TYPES = ["application/vnd.rar", "application/x-rar-compressed", "application/octet-stream"];
const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5MB
const MAX_ZIP_SIZE_BYTES = 100 * 1024 * 1024; // 100MB

export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_SIZE_BYTES },
  fileFilter(_req, file, cb) {
    if (ALLOWED_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Invalid file type. Only PNG, JPG, JPEG are allowed.`));
    }
  },
});

export const bulkUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_ZIP_SIZE_BYTES },
  fileFilter(_req, file, cb) {
    const ext = path.extname(file.originalname || "").toLowerCase();
    const isZip = ext === ".zip" && ALLOWED_ZIP_TYPES.includes(file.mimetype);
    const isRar = ext === ".rar" && ALLOWED_RAR_TYPES.includes(file.mimetype);

    if (isZip || isRar) {
      cb(null, true);
    } else {
      cb(new Error(`Invalid file type. Only ZIP and RAR files are allowed.`));
    }
  },
});
