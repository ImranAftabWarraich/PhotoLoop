const express = require("express");
const dotenv = require("dotenv");
const fileUpload = require("express-fileupload");
const cloudinary = require("cloudinary").v2;
const path = require("path");

// Load environment variables
dotenv.config();

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(
  fileUpload({
    useTempFiles: true,
    tempFileDir: "/tmp/",
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

// API endpoint for image upload
app.post("/api/upload", async (req, res) => {
  try {
    // Check if file was uploaded
    if (!req.files || Object.keys(req.files).length === 0) {
      return res.status(400).json({
        success: false,
        message: "No file selected",
      });
    }

    const file = req.files.image;
    const eventTag = req.body.eventTag || "photo_booth";

    // Upload to Cloudinary with transformation options
    const result = await cloudinary.uploader.upload(file.tempFilePath, {
      folder: "photobooth",
      tags: [eventTag],
      transformation: [{ width: 1200, crop: "limit" }, { quality: "auto" }],
    });

    // Return success response with image details
    res.json({
      success: true,
      message: "Image uploaded successfully!",
      image: {
        url: result.secure_url,
        publicId: result.public_id,
        format: result.format,
        width: result.width,
        height: result.height,
      },
    });
  } catch (error) {
    console.error("Upload error:", error);
    res.status(500).json({
      success: false,
      message: `Error: ${error.message}`,
    });
  }
});
