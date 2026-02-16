require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const session = require("express-session");
const bcrypt = require("bcrypt");
const { v4: uuidv4 } = require("uuid");
const QRCode = require("qrcode");
const multer = require("multer");
const cloudinary = require("cloudinary").v2;
const fs = require("fs");

const app = express();

// ====== ENV ======
const PORT = process.env.PORT || 3000;

// ====== DATABASE ======
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB Connected"))
  .catch(err => console.log(err));

// ====== CLOUDINARY ======
cloudinary.config({
  cloud_name: process.env.CLOUD_NAME,
  api_key: process.env.CLOUD_KEY,
  api_secret: process.env.CLOUD_SECRET
});

const upload = multer({ dest: "uploads/" });

// ====== VIEW ENGINE ======
app.set("view engine", "ejs");
app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));

app.use(session({
  secret: process.env.SESSION_SECRET || "ststudio_secret",
  resave: false,
  saveUninitialized: false
}));

// ====== SCHEMA ======
const jobSchema = new mongoose.Schema({
  jobId: String,
  customerName: String,
  phone: String,
  itemType: String,
  quantity: Number,
  status: { type: String, default: "รับงานแล้ว" },
  imageUrl: String,
  createdAt: { type: Date, default: Date.now }
});

const Job = mongoose.model("Job", jobSchema);

// ====== ADMIN LOGIN ======
const ADMIN_USER = "admin";
const ADMIN_PASS = bcrypt.hashSync("1234", 10);

app.get("/login", (req, res) => {
  res.render("login");
});

app.post("/login", async (req, res) => {
  if (req.body.username === ADMIN_USER &&
      await bcrypt.compare(req.body.password, ADMIN_PASS)) {
    req.session.user = true;
    return res.redirect("/");
  }
  res.send("Login Failed");
});

function auth(req, res, next){
  if(!req.session.user) return res.redirect("/login");
  next();
}

// ====== DASHBOARD ======
app.get("/", auth, async (req, res) => {
  const jobs = await Job.find().sort({ createdAt: -1 });

  // สร้าง QR ให้แต่ละงาน
  for (let job of jobs) {
    job.qr = await QRCode.toDataURL(
      `${process.env.BASE_URL}/track/${job.jobId}`
    );
  }

  res.render("dashboard", { jobs });
});

// ====== CREATE JOB ======
app.post("/create", auth, async (req, res) => {
  const id = uuidv4();

  await Job.create({
    jobId: id,
    customerName: req.body.customerName,
    phone: req.body.phone,
    itemType: req.body.itemType,
    quantity: req.body.quantity
  });

  res.redirect("/");
});

// ====== UPDATE STATUS ======
app.post("/update/:id", auth, async (req, res) => {
  await Job.updateOne(
    { jobId: req.params.id },
    { status: req.body.status }
  );
  res.redirect("/");
});

// ====== UPLOAD IMAGE ======
app.post("/upload/:id", auth, upload.single("image"), async (req, res) => {

  const result = await cloudinary.uploader.upload(req.file.path);

  await Job.updateOne(
    { jobId: req.params.id },
    { imageUrl: result.secure_url }
  );

  fs.unlinkSync(req.file.path);
  res.redirect("/");
});

// ====== TRACK PAGE ======
app.get("/track/:id", async (req, res) => {
  const job = await Job.findOne({ jobId: req.params.id });
  if(!job) return res.send("ไม่พบข้อมูลงาน");
  res.render("track", { job });
});

app.listen(PORT, () => console.log("Server running"));
