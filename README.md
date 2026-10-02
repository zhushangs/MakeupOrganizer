# 化妆柜 MakeupOrganizer

整理化妆品的小网站：贴链接自动读取图片和价格，按类别查看色号墙，眼影盘可以自定义格数并逐格吸色。

## 结构

```
server/MakeupOrganizer.Api   ASP.NET Core (.NET 8) 后端，没有任何 NuGet 依赖
  ├─ wwwroot/                前端构建产物（已经构建好了，直接能用）
  └─ data/                   运行后自动生成：products.json + images/
client/                      React + Vite 前端源码（只在改前端时需要）
start.bat                    双击启动
```

## 运行（只需要 .NET SDK 8 或更新版本）

1. 双击 `start.bat`（或者在 `server/MakeupOrganizer.Api` 里 `dotnet run`）
2. 控制台会打印地址：
   - 电脑上：http://localhost:5080
   - 手机上（和电脑连同一个 Wi‑Fi）：http://192.168.x.x:5080
3. 第一次运行 Windows 防火墙会弹窗，勾选“专用网络”允许访问，否则手机连不上。
4. 手机浏览器打开后，Safari 点“分享 → 添加到主屏幕”，就像 App 一样用。

## 修改前端（需要 Node.js 18+）

```
cd client
npm install
npm run dev      # 开发：http://localhost:5173 ，/api 自动转发到 5080（后端要同时开着）
npm run build    # 构建到 server/MakeupOrganizer.Api/wwwroot
```

## 链接解析是怎么做的

后端 `POST /api/scrape` 抓页面，按顺序尝试：

1. Sephora 页面里的 `linkStore` JSON（当前色号、价格、色块小图）
2. schema.org `Product` JSON-LD（Ulta、大部分百货店和品牌官网）
3. `og:` / `product:` meta 标签
4. `<title>`

图片会下载到本地 `data/images/`。颜色的默认值：页面有色值用色值 → 有色块小图取色块平均色 → 否则从商品图里找最饱和的主色。
不准的话在编辑页用“从图片吸色”或“调色盘”改。

已知限制：部分网站（尤其 Sephora）有反爬，可能返回 403，这时会提示改为手动上传图片。
淘宝/小红书这类需要登录的网站抓不到。

## 数据备份

所有数据都在 `server/MakeupOrganizer.Api/data/`，复制这个文件夹就是完整备份。
