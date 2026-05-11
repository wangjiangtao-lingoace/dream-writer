import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import router from './routes';

// 加载环境变量
dotenv.config();

// 创建Express服务器
const app = express();

// 基础中间件
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// 注册路由
app.use('/api', router);

// 健康检查端点
app.get('/api/health', (req, res) => {
  res.json({ success: true, data: { status: 'ok', timestamp: new Date().toISOString() } });
});

// 404处理
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(404).json({ success: false, error: err.message });
});

// 启动服务器
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🎉 Dream Writer 服务启动成功！`);
  console.log(`📍 前端地址: http://localhost:${PORT}`);
  console.log(`🌍 网络地址: http://${process.env.HOST || 'localhost'}:${PORT}`);
  console.log(`🚀 API地址: http://${process.env.HOST || 'localhost'}:${PORT}/api`);
});

export default app;
