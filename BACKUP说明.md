# 刷题系统服务器包备份说明

本分支只备份 `quiz-server-clean-20260620.zip` 解压后的服务器可部署内容，不包含开发过程中的临时文件。

## 内容

- `index.html`：刷题系统入口页面。
- `app.js`：前端逻辑，当前访问密码为 `赵喆`。
- `styles.css`：页面样式。
- `data/question-banks.json`：总题库数据。
- `data/question-banks.js`：浏览器直接加载的静态题库数据。
- `data/custom-banks/`：自定义题库源数据，包括数据库、编译原理和植物生理学题库。
- `assets/questions/`：题目图片资源。

## 当前版本

页面版本号：`20260623-plant-physiology`

## 本次状态

- 总题库：8 个。
- 总题数：598 题。
- 新增科目：植物生理学。
- 新增题库：植物生理学实验理论考试，15 题，15 题有答案。

## 使用方式

把本目录作为静态站点部署即可；本地可在本目录运行：

```powershell
python -m http.server 8765 --bind 127.0.0.1
```

然后访问：

```text
http://127.0.0.1:8765/
```
