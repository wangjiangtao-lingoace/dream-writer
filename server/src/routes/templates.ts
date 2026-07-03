import { Router } from "express";
import {
  getAllTemplates,
  getTemplateById,
  getTemplatesByGenre,
  searchTemplates,
} from "../services/TemplateService";

const router = Router();

// 获取所有模板
router.get("/", async (_req, res, next) => {
  try {
    const templates = getAllTemplates();
    res.json({ success: true, data: templates });
  } catch (error) {
    next(error);
  }
});

// 根据 ID 获取模板
router.get("/:id", async (req, res, next) => {
  try {
    const { id } = req.params;
    const template = getTemplateById(id);
    if (!template) {
      res.status(404).json({ success: false, error: "模板不存在。" });
      return;
    }
    res.json({ success: true, data: template });
  } catch (error) {
    next(error);
  }
});

// 根据类型筛选模板
router.get("/genre/:genre", async (req, res, next) => {
  try {
    const { genre } = req.params;
    const templates = getTemplatesByGenre(genre);
    res.json({ success: true, data: templates });
  } catch (error) {
    next(error);
  }
});

// 搜索模板
router.get("/search/:keyword", async (req, res, next) => {
  try {
    const { keyword } = req.params;
    const templates = searchTemplates(keyword);
    res.json({ success: true, data: templates });
  } catch (error) {
    next(error);
  }
});

export default router;
