require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const jwt = require("jsonwebtoken");
const cors = require("cors");
const mongoose = require("mongoose");
const morgan = require("morgan");

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(express.json());
app.use(morgan("dev"));

//------------------- Database -------------------
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB Connected"))
  .catch((err) => console.error("MongoDB Error:", err));

//------------------- License Model -------------------
const LicenseSchema = new mongoose.Schema({
  key: { type: String, unique: true },
  maxAccounts: { type: Number, default: 1 },
  boundAccounts: [{ type: Number }],
  expiry: { type: Date },
  status: { type: String, default: "active" },
});

const License = mongoose.model("License", LicenseSchema);

//------------------- Validation Route -------------------
app.post("/validate", async (req, res) => {
  try {
    const { license_key, account_number, ea_version } = req.body;

    if (!license_key || !account_number)
      return res.json({ success: false, message: "Missing details" });

    const lic = await License.findOne({ key: license_key });
    if (!lic) return res.json({ success: false, message: "Invalid license key" });
    if (lic.status !== "active")
      return res.json({ success: false, message: "License disabled" });

    if (lic.expiry && new Date() > new Date(lic.expiry))
      return res.json({ success: false, message: "License expired" });

    if (!lic.boundAccounts.includes(account_number)) {
      if (lic.boundAccounts.length >= lic.maxAccounts)
        return res.json({
          success: false,
          message: "Account limit exceeded. Contact support.",
        });

      lic.boundAccounts.push(account_number);
      await lic.save();
    }

    const token = jwt.sign(
      { license_key, account_number, ea_version },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    return res.json({ success: true, token });
  } catch (err) {
    console.error("Validation error:", err);
    res.json({ success: false, message: "Server error" });
  }
});

//------------------- Admin API -------------------
app.post("/admin/create-license", async (req, res) => {
  const { key, maxAccounts, expiry } = req.body;

  try {
    const newLic = new License({
      key,
      maxAccounts,
      expiry: expiry ? new Date(expiry) : null,
    });

    await newLic.save();
    res.json({ success: true, message: "License created" });
  } catch (err) {
    res.json({ success: false, message: "Error creating license" });
  }
});

//------------------- Start Server -------------------
app.listen(process.env.PORT, () =>
  console.log(`Server running on port ${process.env.PORT}`)
);
