# 计算机网络刷题系统

本目录已经做成一个本地刷题系统，每个 `.docx` 题库文件会被解析成一个小题库。

## 使用

在本目录运行：

```powershell
python -m http.server 8000 --bind 127.0.0.1
```

然后打开：

```text
http://127.0.0.1:8000/
```

当前功能：

- 按 Word 文件选择题库，可多选
- 练习模式：做一题提交一题，立即显示答案和解析
- 背题模式：直接显示答案和解析
- 考试模式：最后交卷统计正确率
- 错题记录、收藏题目、本机进度保存
- 只练错题、只练收藏

第五章题库原文件没有参考答案，所以系统会展示题目，但不会自动判分。

## 重新生成题库数据

如果新增或修改了 `.docx` 题库，运行：

```powershell
& "C:\Users\赵喆\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe" tools\build_question_bank.py
```

生成的数据保存在 `data/question-banks.json`。
