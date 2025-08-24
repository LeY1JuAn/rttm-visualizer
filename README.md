# RTTM 可视化、标注及 DER 诊断工具

[English](README_EN.md) | 中文

> 如果觉得这个项目还不错，就点个 star 支持一下叭；也欢迎在 Issues 交流问题。

在大规模影视剧数据的说话人标注实践中，研究人员普遍面临两类痛点：（1）参考标注 `ref.rttm` 的构建成本高，且不同来源的 `RTTM` 难以直观核对与校准，导致“边看边改”的人工成本居高不下；（2）数值指标（例如 **DER**）在误差诊断中不够直观，研究者很难跨越一个分值去定位错在何处、错成何类、如何修复。

据我们所知，开源社区没有面向研究者可直接加载媒体与 `RTTM` 文件、能以时间轴叠加误差类别的轻量工具。因此，我们基于 `React 18 + TypeScript 5 + Vite` 制作并开源了前端可视化与交互式校对原型。

我们从“可视、可对齐、可编辑、可导出”的最小闭环出发设计并实现如下功能：

![UI](docs/imgs/rttm-visualizer.jpeg)

- 可视与对齐：加载媒体与 `RTTM` 并在统一时间轴对齐；支持 `.srt` 字幕并行预览与检索，用于文本语义比对与时间核查；时间轴以彩色轨道渲染说话人段，支持 0.25–10× 变焦与拖放。
- DER 误差诊断：并排呈现参考轨与系统轨，叠加 DER 三类误差覆盖层：Missed Speech（蓝）、False Alarm（红）、Speaker Error（橙）；在线计算并展示 `MS/FA/SER/DER`；映射策略基于重叠时长的贪心近似一对一。
- 交互式标注与轻量编辑：点击创建、拖拽两端调整、右键删除；同说话人相邻段自动防交叠并最小时长约束；说话人图例支持改名、换色、显隐与删除；参考轨可锁定避免误操作。
- 数据出入与工程闭环：一键导出系统 `RTTM` 与完整工程 `JSON`；支持拖放加载，或在 `exp/raw/` 自动加载首个媒体、在 `exp/rttm/` 自动加载首个 RTTM。

## 运行

```bash
npm install
npm run dev
```

## 说话人日志的标准输出格式

RTTM（Rich Transcription Time Marked）被广泛采用，早在 [NIST Rich Transcription](https://catalog.ldc.upenn.edu/docs/LDC2011S06/rt05s-meeting-eval-plan-V1.pdf?utm_source=chatgpt.com) 系列评测任务中正式定义并作为系统输出与参考标注的统一标准使用，并逐步成为说话人日志系统的事实标准格式。

RTTM 是一种空格分隔的文本格式，每行代表一个说话片段（turn），由十个字段构成，例如：

```
SPEAKER <file_id> 1 <start_time> <duration> <channel_id> <speaker_type> <speaker_name> <confidence> <signal_lookahead>
```

## AI 辅助编程

本项目一开始开发流程由 AI 工具协助完成，包括 `21st.dev`、`GPT-5` 与 `Cursor` 等；我也在 B 站分享了一部分工作流与 AI 使用心得：[`安如衫`](https://www.bilibili.com/video/BV1BXbPzeEoL/)。更多与 AI 的对话见 `./docs/llm` 目录。

## 相关

- [modelscope/3D-Speaker](https://github.com/modelscope/3D-Speaker)：说话人验证、识别与日志的 SOTA 工具箱，涵盖实用的标注与评测脚本。