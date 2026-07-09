import User from "../models/User.js";
import Message from "../models/Message.js";
import cloudinary from "../lib/cloudinary.js";
import { io, userSocketMap } from "../server.js";

// Version marker — confirms deployment
console.log("🚀 messageController v4.0 loaded at", new Date().toISOString());

// ─── Get all users for sidebar ────────────────────────────────────────────────
export const getUsersForSidebar = async (req, res) => {
  try {
    const userId = req.user._id;
    const filteredUsers = await User.find({ _id: { $ne: userId } }).select("-password");

    const unseenMessages = {};
    const promises = filteredUsers.map(async (user) => {
      const messages = await Message.find({
        senderId: user._id,
        receiverId: userId,
        seen: false,
      });
      if (messages.length > 0) {
        unseenMessages[user._id] = messages.length;
      }
    });
    await Promise.all(promises);

    res.json({ success: true, users: filteredUsers, unseenMessages });
  } catch (error) {
    console.error("[getUsersForSidebar]", error);
    res.json({ success: false, message: error.message });
  }
};

// ─── Get messages for selected user ──────────────────────────────────────────
export const getMessages = async (req, res) => {
  try {
    const { id: selectedUserId } = req.params;
    const myId = req.user._id;

    const messages = await Message.find({
      $or: [
        { senderId: myId, receiverId: selectedUserId },
        { senderId: selectedUserId, receiverId: myId },
      ],
    }).sort({ createdAt: 1 });

    await Message.updateMany(
      { senderId: selectedUserId, receiverId: myId },
      { seen: true }
    );

    res.json({ success: true, messages });
  } catch (error) {
    console.error("[getMessages]", error);
    res.json({ success: false, message: error.message });
  }
};

// ─── Mark as seen ─────────────────────────────────────────────────────────────
export const markMessagesAsSeen = async (req, res) => {
  try {
    const { id } = req.params;
    await Message.findByIdAndUpdate(id, { seen: true });
    res.json({ success: true });
  } catch (error) {
    console.error("[markMessagesAsSeen]", error);
    res.json({ success: false, message: error.message });
  }
};

// ─── Send message ─────────────────────────────────────────────────────────────
export const sendMessage = async (req, res) => {
  console.log("🔥 [sendMessage v4.0] Called");

  try {
    const { text, image, file, fileName, fileType } = req.body;
    const { id: receiverId } = req.params;
    const senderId = req.user._id;

    console.log("═══════════════════════════════════════════════");
    console.log("[sendMessage] Incoming request:");
    console.log("  text:", text ? `"${text.substring(0, 30)}..."` : "none");
    console.log("  image:", image ? `${image.length} chars` : "none");
    console.log("  file:", file ? `${file.length} chars` : "none");
    console.log("  fileName:", fileName || "none");
    console.log("  fileType:", fileType || "none");
    console.log("═══════════════════════════════════════════════");

    // Validation
    if (!text && !image && !file) {
      console.log("❌ [sendMessage] No content provided");
      return res.status(400).json({
        success: false,
        message: "Message must contain text, image, or file.",
      });
    }

    let imageUrl = "";
    let fileUrl = "";
    let finalFileName = "";
    let finalFileType = "";

    // ── Upload image ─────────────────────────────────────────────────────
    if (image) {
      try {
        console.log("📤 [sendMessage] Uploading image to Cloudinary...");
        const uploadResponse = await cloudinary.uploader.upload(image, {
          resource_type: "image",
          folder: "chat_images",
        });
        imageUrl = uploadResponse.secure_url;
        console.log("✅ [sendMessage] Image uploaded:", imageUrl);
      } catch (err) {
        console.error("❌ [sendMessage] Image upload failed:");
        console.error("  Message:", err.message);
        console.error("  HTTP code:", err.http_code);
        console.error("  Full error:", JSON.stringify(err, null, 2));
        return res.status(500).json({
          success: false,
          message: `Image upload failed: ${err.message}`,
        });
      }
    }

    // ── Upload PDF via Cloudinary ────────────────────────────────────────
    if (file && fileType === "pdf") {
      console.log("📤 [sendMessage] Processing PDF upload...");

      // Validate data URI
      if (!file.startsWith("data:")) {
        console.log("❌ [sendMessage] Invalid file format");
        return res.status(400).json({
          success: false,
          message: "Invalid file format — missing data URI prefix",
        });
      }

      // Sanitize filename for Cloudinary public_id
      const safeName = (fileName || "document")
        .replace(/\.[^/.]+$/, "")                 // Remove extension
        .replace(/[^a-zA-Z0-9._-]/g, "_")         // Replace unsafe chars
        .substring(0, 50);                        // Limit length

      const timestamp = Date.now();
      const publicId = `${timestamp}_${safeName}`;

      console.log("📤 [sendMessage] Uploading PDF with params:");
      console.log("  publicId:", publicId);
      console.log("  folder: chat_files");
      console.log("  fileSize:", file.length, "chars");

      try {
        // ── Upload PDF as "auto" resource_type ───────────────────────
        // "auto" lets Cloudinary detect the file type and handle it correctly.
        // For PDFs, this uploads as an "image" resource internally,
        // which is more permissive on free-tier accounts.
        const uploadResponse = await cloudinary.uploader.upload(file, {
          resource_type: "auto",
          folder: "chat_files",
          public_id: publicId,
          use_filename: false,
          unique_filename: true,
          // Attach original filename as metadata so download preserves it
          context: `original_filename=${fileName || "document.pdf"}`,
        });

        console.log("✅ [sendMessage] Cloudinary upload response:");
        console.log("  URL:", uploadResponse.secure_url);
        console.log("  resource_type:", uploadResponse.resource_type);
        console.log("  format:", uploadResponse.format);
        console.log("  public_id:", uploadResponse.public_id);

        fileUrl = uploadResponse.secure_url;
        finalFileName = fileName || "document.pdf";
        finalFileType = "pdf";

        console.log("✅ [sendMessage] PDF uploaded successfully");
      } catch (err) {
        console.error("❌ [sendMessage] PDF upload FAILED:");
        console.error("  Message:", err.message);
        console.error("  HTTP code:", err.http_code);
        console.error("  Name:", err.name);
        console.error("  Full error:", JSON.stringify(err, null, 2));

        // Provide helpful error to frontend
        let userMessage = "PDF upload failed";
        if (err.message?.toLowerCase().includes("not allowed") || err.http_code === 400) {
          userMessage =
            "Cloudinary is blocking PDF uploads. Go to Cloudinary Dashboard → Settings → Security → " +
            "and enable 'PDF and ZIP files delivery'.";
        } else if (err.http_code === 401) {
          userMessage = "Cloudinary auth failed. Check API credentials on Render.";
        } else if (err.message?.toLowerCase().includes("file size")) {
          userMessage = "File too large for Cloudinary free tier (max 10MB).";
        } else {
          userMessage = `PDF upload failed: ${err.message}`;
        }

        return res.status(500).json({
          success: false,
          message: userMessage,
        });
      }
    }

    // ── Guard against empty saves ────────────────────────────────────────
    if (image && !imageUrl) {
      console.error("❌ [sendMessage] Image upload silently failed");
      return res.status(500).json({
        success: false,
        message: "Image upload failed silently.",
      });
    }

    if (file && fileType === "pdf" && !fileUrl) {
      console.error("❌ [sendMessage] PDF upload silently failed");
      return res.status(500).json({
        success: false,
        message: "PDF upload failed silently.",
      });
    }

    // ── Build message ────────────────────────────────────────────────────
    const messageDoc = {
      senderId,
      receiverId,
      text: text || "",
      image: imageUrl,
      file: fileUrl,
      fileName: finalFileName,
      fileType: finalFileType,
    };

    console.log("💾 [sendMessage] Saving to DB:", {
      hasText: !!messageDoc.text,
      hasImage: !!messageDoc.image,
      hasFile: !!messageDoc.file,
      fileName: messageDoc.fileName,
      fileType: messageDoc.fileType,
    });

    // ── Save ─────────────────────────────────────────────────────────────
    const newMessage = await Message.create(messageDoc);

    console.log("✅ [sendMessage] Saved to DB, ID:", newMessage._id);
    console.log("  Saved fields verification:");
    console.log("    text:", newMessage.text ? "present" : "empty");
    console.log("    image:", newMessage.image ? "present" : "empty");
    console.log("    file:", newMessage.file ? `present (${newMessage.file})` : "empty");
    console.log("    fileName:", newMessage.fileName);
    console.log("    fileType:", newMessage.fileType);

    // ── Emit to receiver ─────────────────────────────────────────────────
    const receiverSocketId = userSocketMap[receiverId];
    if (receiverSocketId) {
      io.to(receiverSocketId).emit("newMessage", newMessage);
      console.log("✅ [sendMessage] Emitted to receiver");
    } else {
      console.log("⚠️ [sendMessage] Receiver offline");
    }

    res.json({ success: true, newMessage });
  } catch (error) {
    console.error("❌ [sendMessage] FATAL ERROR:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};