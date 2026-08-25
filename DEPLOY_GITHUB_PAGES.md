# 发布到 GitHub Pages（零基础版）

发布后，别人可以直接通过网址打开项目，不需要拿到你的本地文件。这个项目是纯静态网页，最简单、最稳妥的方式是从 `main` 分支根目录发布。

## 一、先检查公开内容

仓库将公开展示，请确保：

- 不含真实姓名、手机号、聊天记录、公司内部链接或账号；
- 不含 API Key、密码、Cookie 等秘密；
- 页面继续保留“个人模拟项目、虚构演示数据”的声明；
- 上传的是本目录中的文件，不要只上传外层文件夹。

## 二、网页操作发布（推荐新手）

1. 登录 GitHub，右上角点击 `+` → `New repository`。
2. 仓库名建议填写 `agent-ops-desk`，可见性选择 `Public`，点击 `Create repository`。
3. 在空仓库页面点击 `uploading an existing file`。
4. 上传本项目发布包中的这些内容：
   - `index.html`
   - `styles.css`
   - `app.js`
   - `assets` 文件夹
   - `README.md`
   - `PLATFORM_GUIDE.md`
   - `.nojekyll`（如果网页上传看不到这个隐藏文件，可以不传）
5. 在页面底部点击 `Commit changes`。
6. 进入仓库 `Settings` → 左侧 `Pages`。
7. `Build and deployment` 中把 `Source` 设为 `Deploy from a branch`。
8. 分支选择 `main`，目录选择 `/(root)`，点击 `Save`。
9. 等待约 1—3 分钟，刷新 `Settings → Pages`，打开显示的网址。

项目网址通常是：

```text
https://你的GitHub用户名.github.io/agent-ops-desk/
```

## 三、以后怎么更新

修改本地文件后，在仓库中重新上传同名文件并提交。GitHub Pages 会在提交后自动更新；浏览器可能有缓存，更新后可按 `Ctrl + F5` 强制刷新。

## 四、发布成功后要知道的限制

- 页面可以在任何联网电脑打开；
- 新增、审批、关闭等操作仍保存在访问者自己的浏览器 `localStorage` 中；
- 不同电脑之间不会共享操作数据；
- 清理浏览器网站数据后，操作记录会恢复为默认演示数据；
- GitHub Pages 只托管静态页面，不提供数据库和账号登录后台。

这些限制不影响在线功能体验。访问者可以直接打开公开网址，并在自己的浏览器中完成一轮操作。

## 五、常见问题

### 打开网址显示 404

确认仓库根目录能直接看到 `index.html`，Pages 设置为 `main` + `/(root)`，并等待部署完成。也可以到仓库的 `Actions` 页面查看 Pages 部署是否成功。

### 页面有内容但样式或 Excel 下载失败

确认 `styles.css`、`app.js` 和 `assets` 文件夹与 `index.html` 位于同一层级，并且文件名没有被改动。

### 对外分享哪个链接

优先分享 GitHub Pages 在线体验地址，需要查看代码和说明时再附 GitHub 仓库地址。页面使用模拟数据，不应将模拟结果描述为真实企业运营数据。

### 分享时没有显示项目预览图

页面已包含 `assets/agentops-social-preview.png` 和基础分享元数据。部分平台要求 `og:image` 使用完整网址；发布后可把 `index.html` 中两处相对图片路径改为：

```text
https://你的GitHub用户名.github.io/agent-ops-desk/assets/agentops-social-preview.png
```

社交平台可能缓存旧预览，修改后需要等待缓存刷新。
