// server.mjs
// Deploy this on Render as a Node.js web service
// Trigger from local: POST /upload with { url: "https://dl.subdl.com/..." }

import express from "express";
import { S3Client, PutObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";

const app = express();
app.use(express.json());

const ACCOUNT_ID = process.env.CF_ACCOUNT_ID;
const BUCKET_NAME = process.env.R2_BUCKET_NAME;
const ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;

const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: ACCESS_KEY_ID,
    secretAccessKey: SECRET_ACCESS_KEY,
  },
});

async function existsInR2(key) {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: BUCKET_NAME, Key: key }));
    return true;
  } catch {
    return false;
  }
}

app.post("/upload", async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: "url required" });

  const key = url.replace("https://dl.subdl.com/", "");
  console.log("Processing:", key);

  if (await existsInR2(key)) {
    console.log("Already exists:", key);
    return res.json({ status: "exists", key });
  }

  try {
    const response = await fetch(url, {
      headers: {
        "Referer": "https://subdl.com",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    });

    if (!response.ok) {
      console.error("Download failed:", key, response.status);
      return res.status(500).json({ status: "failed", key, code: response.status });
    }

    const buffer = Buffer.from(await response.arrayBuffer());

    await s3.send(new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      Body: buffer,
      ContentType: "application/zip",
    }));

    console.log("Uploaded:", key);
    res.json({ status: "uploaded", key });
  } catch (err) {
    console.error("Error:", key, err.message);
    res.status(500).json({ status: "error", key, error: err.message });
  }
});

app.get("/health", (_, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
