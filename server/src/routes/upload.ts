import { Router, Request, Response } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { prisma } from "../db/prisma";

const router = Router();

// 确保上传目录存在
const uploadDir = process.env.UPLOAD_DIR || "./uploads";
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// 配置multer存储
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const subDir = req.query.type || "covers";
    const fullPath = path.join(uploadDir, subDir as string);
    if (!fs.existsSync(fullPath)) {
      fs.mkdirSync(fullPath, { recursive: true });
    }
    cb(null, fullPath);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, file.fieldname + "-" + uniqueSuffix + ext);
  },
});

// 文件过滤器
const fileFilter = (req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  // 只允许图片文件
  if (file.mimetype.startsWith("image/")) {
    cb(null, true);
  } else {
    cb(new Error("只允许上传图片文件"));
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: parseInt(process.env.MAX_UPLOAD_SIZE || "10485760"), // 默认10MB
  },
});

// 上传封面图
router.post("/cover", upload.single("cover"), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: "请选择要上传的文件" });
    }

    const { novelId } = req.query;
    if (!novelId) {
      return res.status(400).json({ success: false, error: "缺少novelId参数" });
    }

    // 生成相对路径
    const relativePath = path.relative(process.cwd(), req.file.path);

    // 更新小说封面图
    await prisma.novel.update({
      where: { id: novelId as string },
      data: { coverImage: relativePath },
    });

    res.json({
      success: true,
      data: {
        path: relativePath,
        filename: req.file.filename,
        size: req.file.size,
        mimetype: req.file.mimetype,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 上传通用文件
router.post("/file", upload.single("file"), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: "请选择要上传的文件" });
    }

    const relativePath = path.relative(process.cwd(), req.file.path);

    res.json({
      success: true,
      data: {
        path: relativePath,
        filename: req.file.filename,
        size: req.file.size,
        mimetype: req.file.mimetype,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 删除文件
router.delete("/file", async (req: Request, res: Response) => {
  try {
    const { path: filePath } = req.query;
    if (!filePath) {
      return res.status(400).json({ success: false, error: "缺少path参数" });
    }

    const fullPath = path.resolve(process.cwd(), filePath as string);
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
      res.json({ success: true, message: "文件已删除" });
    } else {
      res.status(404).json({ success: false, error: "文件不存在" });
    }
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 获取文件列表
router.get("/list", async (req: Request, res: Response) => {
  try {
    const { type = "covers" } = req.query;
    const dirPath = path.join(uploadDir, type as string);

    if (!fs.existsSync(dirPath)) {
      return res.json({ success: true, data: [] });
    }

    const files = fs.readdirSync(dirPath).map((filename) => {
      const filePath = path.join(dirPath, filename);
      const stats = fs.statSync(filePath);
      return {
        filename,
        path: path.relative(process.cwd(), filePath),
        size: stats.size,
        createdAt: stats.birthtime,
      };
    });

    res.json({ success: true, data: files });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
