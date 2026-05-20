# Nginx Demo

这是 DockerAgent 的最小端到端部署样例，用来验证：

- Compose 预检
- 危险操作确认
- 部署前快照
- 应用登记
- 应用详情页
- 访问地址和日志入口
- 关联快照与回滚入口

默认访问地址：

```text
http://localhost:18080
```

如需换端口，复制 `.env.example` 为 `.env` 并修改：

```env
NGINX_PORT=18081
```
