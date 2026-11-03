# 上线清单：GitHub 自动部署 → Railway 临时公网地址

> 本次选择：**GitHub push 自动部署**；先拿 `*.up.railway.app` 临时公网地址，**暂不购买自有域名**。
> 原则：本机与命令由助手执行；GitHub / Railway 账号登录、OAuth 授权、绑卡付费由本人完成。

## ✅ 本机已完成（助手侧）

- [x] `npm test` 三套件（逻辑 / 渲染 / 游戏冒烟）全绿
- [x] `railway.json`：Nixpacks 构建、`startCommand=node server.js`、健康检查 `/healthz`、失败自动重启
- [x] `server.js`：监听 `0.0.0.0`、读取 `process.env.PORT`、提供 `/healthz`、`/api/weather`、`/api/sync/*`（可选 `SYNC_SECRET` 口令、白名单含 `ddgame:v1`、单值 256KB）、静态托管 `public/`
- [x] `.gitignore` 排除 `data/`、`.env`、`node_modules/`、`*.log`；`.nvmrc` 固定 Node 20
- [x] 已安装 Git 2.56；`main` 分支首次提交 `4e5b417`，共 35 个文件；本地 `data/` 同步数据未入库

## ① 你来做：GitHub 建一个空仓库（约 2 分钟）

1. 登录 https://github.com （没有账号先注册）。
2. 右上角 `+` → **New repository**：
   - 名称建议 `doudou-companion`；
   - 可见性建议 **Private**（无密钥、无个人数据入库，Private 更稳；Public 也可部署）；
   - **不要勾选** Add README / .gitignore / license（保持空仓，避免首次推送冲突）；
   - 点 Create repository。
3. 复制仓库 HTTPS 地址，形如 `https://github.com/你的用户名/doudou-companion.git`，发给助手。
   - 若想自己执行，在项目根依次运行：
     ```powershell
     git remote add origin <你的仓库HTTPS地址>
     git branch -M main
     git push -u origin main
     ```
   - 首次 push 会弹出 Git 凭据窗口，选浏览器登录 GitHub 完成授权即可。

## ② 助手来做：关联远端并推送

收到仓库地址后，助手执行 `git remote add origin ...` 与 `git push -u origin main`；若弹出登录授权窗口，请在浏览器点确认。

## ③ 你来做：Railway 选仓部署（约 3–5 分钟）

1. 打开 https://railway.com ，建议 **Sign in with GitHub**（复用 GitHub 账号，免再注册）。
2. **New Project → Deploy from GitHub repo**，授权 Railway 访问 GitHub，选中 `doudou-companion`。
3. 构建器保持 **Nixpacks**（本项目零依赖、无需 build 命令；`railway.json` 已给启动命令与健康检查）。
4. 等待 **Deployments** 状态变 **Active（绿色）**；Deploy Logs 出现 `小猪小金毛上线啦 → http://0.0.0.0:<端口>`。
5. **Settings → Networking / Public Networking → Generate Domain**，得到 `xxxx.up.railway.app`，把该地址发给助手。
6. 若中途弹出套餐 / 额度 / 绑卡 / 付费提示，先停在提示页把选项发回，由本人决定，助手不代付、不代绑卡。

## ④ 助手来做：公网四 URL 复测

拿到临时域名后逐项验证：

- [ ] `https://xxxx.up.railway.app/` 主应用正常打开
- [ ] `https://xxxx.up.railway.app/game.html` 小游戏正常打开
- [ ] `https://xxxx.up.railway.app/healthz` 返回 `ok`
- [ ] `https://xxxx.up.railway.app/api/weather` 返回 JSON 且 `ok:true`

若出现 502 / 启动失败，依据 Deploy Logs 定位（重点：是否监听 `0.0.0.0:$PORT`、启动命令是否 `node server.js`）并修复后重新推送。

## ⑤ 跨设备同步持久化 + 公开保护（必做）

同步记录（主应用 `dd:*` 与游戏存档 `ddgame:v1`）写在 `DATA_DIR` 指向目录；不挂 Volume 时每次重新部署会清空。

1. 服务 **Settings → Volumes → Add Volume**，**Mount path 填 `/data`**。
2. **Variables** 新增 `DATA_DIR = /data`。
3. **公开站点再加一条 Variables：`SYNC_SECRET = 你自定的一段口令`**（公开部署必设；不设则 `/api/sync/*` 无口令裸奔，任何人可调用生成/保存/读取）。保存后自动 Redeploy。
4. 复测 `GET /api/sync/info` 返回 `"storage":"volume"`、`"secretRequired":true`。
5. 主应用设置页填好同一道「服务端口令」再生成同步码；多台设备填相同口令 + 同一同步码即可互通；游戏进度随快照自动后台同步，仍可在游戏设置导出 JSON 做本地备份。

> 口令是公开部署的统一访问层，同步码是个人记录凭证，两者都不要公开分享；整份快照按时间较新整体覆盖，不逐条合并。

## 以后更新代码（自动部署）

```powershell
git add .
git commit -m "说明这次改了什么"
git push
```
Railway 检测到 push 自动重新构建部署，临时域名保持不变。

## 费用与边界（先讲清）

- Railway 无永久免费额度，新账号 Trial 为一次性用量；服务持续运行若要求升级套餐，价格以控制台 Usage / Plans 实时显示为准，付费与绑卡由本人操作。
- 本轮不买域名；以后要长期固定的自有 `.com`，再按《Railway部署与固定域名操作手册.md》第 4–5 步加 DNS（CNAME + TXT 两条）绑定。
- 本机 `127.0.0.1` / 热点内网 IP 在云端上线后停用，统一使用云端域名；手机用移动数据（非同一 Wi-Fi）也能打开才算成功。

## 常见卡点

| 现象 | 处理 |
|---|---|
| push 403 / 认证失败 | 完成 Git 凭据弹窗的浏览器授权；私有仓确认当前账号有写权限 |
| Railway 502 / Application failed to respond | 看 Deploy Logs；确认监听 `0.0.0.0:$PORT`、startCommand=`node server.js` |
| 生成域名后打不开 | Deployment 未 Active 或 `/healthz` 未通过；看日志等待自动重试 |
| push 后页面没变 | 确认 push 成功、Deployments 有新记录；强刷或无痕窗口排除 service worker 缓存 |
| 重新部署后同步码失效 | 漏挂 Volume 或未设 `DATA_DIR=/data`，按第 ⑤ 步补齐 |
