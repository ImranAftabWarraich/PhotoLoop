const express = require("express");
const dotenv = require("dotenv");
const fileUpload = require("express-fileupload");
const cloudinary = require("cloudinary").v2;
const path = require("path");

// Load environment variables
dotenv.config();

// Configure Cloudinary with timeout settings
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  timeout: 120000, // Increase timeout to 120 seconds (2 minutes)
});

const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(
  fileUpload({
    useTempFiles: true,
    tempFileDir: "/tmp/",
    limits: { fileSize: 50 * 1024 * 1024 }, // Reduced to 50MB from 80MB
    abortOnLimit: true,
  })
);
app.use(express.static(path.join(__dirname, "public")));

// Set EJS as templating engine
app.set("views", path.join(__dirname, "views"));
app.set("view engine", "ejs");

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✨ Photo Booth server running on port ${PORT}`);
});

// Routes
app.get("/", (req, res) => {
  res.render("index", {
    message: null,
    imageUrl: null,
    eventName: "Pam Production Orlando",
  });
});

// Event-specific routes for different themed booths
app.get("/wedding", (req, res) => {
  res.render("index", {
    message: null,
    imageUrl: null,
    eventName: "Wedding Memories",
    theme: "wedding",
  });
});

app.get("/party", (req, res) => {
  res.render("index", {
    message: null,
    imageUrl: null,
    eventName: "Party Memories",
    theme: "party",
  });
});

// API endpoint for image and video upload

app.post("/api/upload", async (req, res) => {
  try {
    if (!req.files || Object.keys(req.files).length === 0) {
      return res.status(400).json({
        success: false,
        message: "No file selected",
      });
    }

    const file = req.files.media;
    const eventTag = req.body.eventTag || "photo_booth";
    
    // Determine file type from mimetype
    const isVideo = file.mimetype.startsWith('video/');
    const fileType = isVideo ? "video" : "image";
    
    console.log(`Uploading ${fileType} file (${file.mimetype}) of size: ${(file.size / (1024 * 1024)).toFixed(2)}MB`);
    
    const maxFileSize = 50 * 1024 * 1024; // 50MB
    if (file.size > maxFileSize) {
      return res.status(413).json({
        success: false,
        message: `File too large. Maximum size is ${maxFileSize / (1024 * 1024)}MB`,
      });
    }
    
    // Cloudinary upload options
    let uploadOptions = {
      folder: "photobooth",
      tags: [eventTag],
      timeout: 120000,
      resource_type: fileType // This is crucial for videos
    };
    
    if (fileType === "video") {
      uploadOptions.resource_type = "video";
      uploadOptions.eager = [
        { width: 720, crop: "limit", quality: "auto" }
      ];
      uploadOptions.eager_async = true;
      uploadOptions.eager_notification_url = process.env.BASE_URL + "/api/cloudinary-notification";
    } else {
      uploadOptions.transformation = [
        { width: 1200, crop: "limit" },
        { quality: "auto" }
      ];
    }

    console.log("Uploading with options:", uploadOptions);
    
    // Upload to Cloudinary
    const result = await cloudinary.uploader.upload(file.tempFilePath, uploadOptions);
    
    console.log("Upload successful:", result);

    res.json({
      success: true,
      message: `${fileType === "image" ? "Image" : "Video"} uploaded successfully!`,
      media: {
        url: result.secure_url,
        publicId: result.public_id,
        format: result.format,
        width: result.width,
        height: result.height,
        type: fileType,
        duration: result.duration || null,
      },
    });
  } catch (error) {
    console.error("Upload error:", error);
    res.status(500).json({
      success: false,
      message: `Error uploading ${req.body.fileType || 'file'}: ${error.message}`,
    });
  }
});
