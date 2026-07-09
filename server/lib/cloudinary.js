import { v2 as cloudinary } from "cloudinary";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

// Startup verification
console.log("[Cloudinary] Config loaded:", {
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME ? "✅" : "❌ MISSING",
  api_key: process.env.CLOUDINARY_API_KEY ? "✅" : "❌ MISSING",
  api_secret: process.env.CLOUDINARY_API_SECRET ? "✅" : "❌ MISSING",
});

export default cloudinary;