import { Request, Response, NextFunction } from "express";

export function apiKeyAuth(req: Request, res: Response, next: NextFunction) {
  const secretKey = process.env.API_SECRET_KEY;
  if (!secretKey) {
    next();
    return;
  }

  const apiKey = (req.headers["x-api-key"] as string) || (req.query.apiKey as string);
  if (apiKey === secretKey) {
    next();
    return;
  }

  res.status(401).json({ success: false, error: "未授权：无效或缺少 API Key" });
}
