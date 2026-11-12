---
title: "AV1 与 HEVC SCC：Palette 和 IntraBC 详细对比"
date: 2026-11-12
description: "比较 AV1 Palette 与 HEVC SCC Palette、IntraBC 的表示方式、语法差异和适用场景。"
categories: [视频编码]
tags: [AV1, HEVC, AVC]
---

# AV1 与 HEVC SCC：Palette 和 IntraBC 详细对比

## 1. 范围与结论

本文对比 AV1 与 **HEVC Screen Content Coding（SCC）扩展**中的 Palette 与 Intra Block Copy（IntraBC）。HEVC Main 等基础 Profile 不包含这两项 SCC 工具；AVC 也没有标准化的 Palette 或 IntraBC 工具。

| 工具 | 核心表示方式 | 擅长的重复性 |
|---|---|---|
| Palette | 少量代表颜色 + 每个样本的颜色索引 | 色数少、颜色边界清晰的文字、图标和 UI 色块 |
| IntraBC | 块向量 + 当前图像中已重建区域的样本 | 重复的字形、纹理、窗口片段或图案 |

两者都属于屏幕内容编码工具，但一个表示“颜色集合及其排列”，另一个表示“从哪里复制像素”。它们不能相互替代。

## 2. Palette：颜色表、颜色选择和索引图

编码器先判断当前块是否适合 Palette，再确定颜色表，并将块内样本映射到表项。**规范规定码流如何表示所选颜色和索引，不要求编码器使用某一种固定的颜色聚类或选色算法。** 实际编码器通常通过统计频次、聚类、颜色量化和率失真优化，比较 Palette 与普通帧内预测的代价。

**最重要的结构差异：AV1 把 Palette 当作预测，预测后的残差仍按 AV1 帧内残差路径进行变换和量化；HEVC SCC Palette 则用颜色索引直接表示表内样本，不对这些普通索引样本再做预测残差变换。** HEVC 的 escape 样本走单独的 escape 值编码路径。两者在无损配置下都可精确重建，但有损时失真进入的位置不同。[AV1 工具概述](https://www.cambridge.org/core/journals/apsipa-transactions-on-signal-processing/article/an-overview-of-the-coding-tools-in-av1-the-first-video-codec-from-the-alliance-for-open-media/5972E00494363BE37E3439FAE2AE11DB)；[HEVC SCC 概述](https://www.merl.com/publications/docs/TR2015-126.pdf)

```text
输入像素块                 颜色表                  索引图
+---+---+---+---+          0: 深色                 +---+---+---+---+
| A | B | A | A |          1: 浅色                 | 0 | 1 | 0 | 0 |
+---+---+---+---+          2: 蓝色                 +---+---+---+---+
| B | B | A | C |   →      3: 文字色       →      | 1 | 1 | 0 | 2 |
+---+---+---+---+                                  +---+---+---+---+
| A | C | C | A |                                  | 0 | 2 | 2 | 0 |
+---+---+---+---+                                  +---+---+---+---+
```

### AV1 Palette

- AV1 Palette 是帧内块工具。亮度和色度分别有相应 Palette 语法；色度的 Cb、Cr 共享 Palette 尺寸，但各自传颜色值／索引图。
- 每个分量的 Palette 大小为 **2 到 8**。Palette 有最小块尺寸及最大宽高限制；AV1 工具说明给出的使用范围是块至少 8×8，宽高不超过 64。
- 颜色可以从邻块形成的 color cache 中复用，也可以在码流中显式给出。解码端按语法恢复 Palette，再解码索引图。
- 索引图按规定的对角扫描次序编码。首个索引有专门语法；后续索引利用上方、左方及左上方索引形成上下文进行熵编码。
- AV1 Palette 提供预测样本；块的残差仍进入常规 AV1 残差编码流程，使用变换／量化（无损编码时按无损规则处理）。因此在有损设置下，量化残差会使重建样本偏离 Palette 预测值。
- **AV1 Palette 没有 HEVC 式 escape 索引。** Palette 表没有覆盖的样本不能通过一个 escape 索引再附带任意样本值表示；编码器需要改变 Palette／模式选择，或选择其他编码方式。

### HEVC SCC Palette

- HEVC Palette 是 SCC 扩展工具，不属于 HEVC Main 的常规工具集。编码单元使用 Palette 表和索引图重建样本。
- Palette 表可利用历史／邻近 Palette Predictor 中的颜色：被预测复用的表项不必每次完整重发；未复用的颜色显式编码。当前 Palette 的尺寸、复用项和新颜色都由 SCC 语法描述。
- **普通 Palette 索引样本直接由颜色表重建，不经过 AV1 式的预测残差变换量化。HEVC 有 escape index：** 颜色索引等于 Palette 尺寸时表示该样本不在 Palette 表内，随后按 SCC escape 语法编码其样本分量值。escape 样本在有损配置下可受量化影响；在 lossless 配置下可精确表示。
- HEVC SCC Palette 索引图采用其规定的索引预测／游程编码机制，例如复制上方索引、显式索引及 escape 等情形；不能简单等同于 AV1 的逐索引邻域上下文熵编码。

### Escape 的意义

```text
AV1 Palette：索引 → Palette 中的颜色
             没有 escape 索引；特殊颜色由其他模式/编码路径处理

HEVC SCC：   索引 0 ... palette_size-1 → Palette 中的颜色
             索引 palette_size          → 后续读取该样本的 escape 分量值
```

Escape 允许 HEVC SCC 在保留主色表的同时处理少数离群颜色。代价是这些离群样本仍需额外信令和样本值；如果离群值太多，Palette 模式的收益会下降。

## 3. IntraBC：块向量复制当前图像

IntraBC 把当前块的预测区域指向**当前图像中已重建、可作为参考的区域**。其块向量（BV）类似运动向量的位移描述，但参考源不是过去/未来参考帧，而是当前图像自身。它通常按整数样本位置复制，不需要普通帧间插值滤波。

```text
同一帧的编码／重建顺序示意
+----------------------------------+
| 已重建区域（可作为复制源）       |
|   +----------+                    |
|   | source   |                    |
|   +----------+        BV  ───────┐|
|                                  │|
|                     +----------+ │|
|                     | 当前块   |◀┘|
+----------------------------------+
```

### AV1 IntraBC

- AV1 的 `use_intrabc` 表示当前块使用 IntraBC。它只在允许 screen-content tools 的帧中可用，并且受块模式等语法条件约束。
- IntraBC 向量为整数精度。解码端只可复制当前 tile 中按解码顺序已经可用的重建样本；源块必须完整落在合法的已解码区域，不能依赖尚未解码的块。
- 向量还受规范的运动向量范围和额外合法性检查约束。AV1 特别限制源位置，以确保数据来自已解码区域，并避免源块过近而妨碍流水线解码。
- 编码器的运动搜索策略（全搜索、哈希、候选向量等）是实现选择；标准约束的是最终码流中 BV 的合法范围及可用参考区域，不规定编码器必须搜索多远。

### HEVC SCC IntraBC

- HEVC 的 IntraBC 也使用整数精度块向量，从当前图像先前重建的区域复制预测样本，不使用帧间插值滤波。
- 合法引用区必须满足因果性：预测源样本已按解码顺序重建，不能与当前块形成未解码依赖。向量和源块还要满足规范定义的范围及块边界约束。
- SCC 设计中，引用范围从早期讨论的当前 CTU／左侧 CTU 局部区域扩展为当前图像中可用的先前重建区域；这不等于编码器可以引用任意位置，因果性和规范的 BV 合法性条件仍然生效。
- 编码器可在合法区域内使用块匹配、哈希表等方法加速搜索。搜索算法及速度／质量取舍由编码器实现决定，不是码流规范规定的固定搜索半径。

### “搜索范围”必须分成两件事

| 概念 | 由谁决定 | 含义 |
|---|---|---|
| 规范允许的引用区域 | 标准 | 解码器可接受哪些 BV、哪些已重建样本可以被引用 |
| 编码器实际搜索范围 | 编码器实现 | 编码器为速度／压缩率考虑，实际检查多大的候选区域 |

所以，不能只问“HEVC/AV1 的 IntraBC 搜索半径是多少”。规范定义的是合法向量和可引用区域；不同编码器可能只搜索局部窗口，也可能使用更大范围和快速匹配结构。

## 4. 关键差异汇总

| 对比点 | AV1 | HEVC SCC |
|---|---|---|
| 工具所在范围 | AV1 规范工具，受 screen-content tool 开关控制 | HEVC SCC 扩展；普通 HEVC Main 不含此工具 |
| Palette 颜色数量 | 每个平面 2–8 色 | 按 SCC Palette 语法及参数确定；支持 Palette Predictor 复用 |
| 颜色来源 | 邻域 color cache 复用或显式发送 | 历史 Palette Predictor 复用或显式发送 |
| 索引图 | 对角扫描；首索引专门编码，后续使用邻域上下文熵编码 | 采用 SCC 的索引预测／游程机制 |
| 索引样本的重建路径 | Palette 作为预测，仍有预测残差变换／量化路径 | 表内索引直接映射到颜色；普通样本无预测残差变换 |
| 有损失真来源 | 颜色预测后的残差量化可造成样本偏差 | Palette/escape 样本值按有损配置编码时可造成偏差；表内样本不经残差变换 |
| Palette escape | **没有 HEVC 式 escape 样本语法** | **有 escape index**，后续编码离群样本分量值 |
| IntraBC 参考 | 当前 tile 中已解码的当前帧区域 | 当前图像中满足因果及 BV 合法性条件的先前重建区域 |
| BV 精度 | 整数样本精度 | 整数样本精度 |
| 搜索半径 | 编码器自定；规范约束合法 BV 和可用区域 | 编码器自定；规范约束合法 BV 和可用区域 |
| AVC | 没有标准化 Palette / IntraBC 工具 | — |

## 5. 内容类型的直观选择

| 画面特征 | 更相关的工具 | 原因 |
|---|---|---|
| 少量纯色、硬边、文字抗锯齿后的少数颜色 | Palette | 颜色可被少量表项表示，索引图保留形状 |
| 同一图标或文字块在画面多处重复 | IntraBC | 直接复用已重建的相同像素图案 |
| 大量渐变、噪声或颜色连续变化 | 通常不是 Palette 的理想情况 | 需要过大的 Palette 或大量 escape 样本，索引开销可能抵消收益 |
| 纹理有重复但色值变化较多 | 评估 IntraBC | 块复制可能比逐像素颜色索引更合适 |

最终选择由编码器做率失真决策；这里描述的是工具适用倾向，不是规范强制规则。

## 6. 标准章节与参考资料

- [AV1 Bitstream & Decoding Process Specification](https://aomediacodec.github.io/av1-spec/av1-spec.pdf)：Palette mode info、palette tokens、color-index map；IntraBC 的 `use_intrabc`、运动向量及其合法性检查。
- [AOMedia AV1 Tool Description](https://aomedia.org/docs/AV1_ToolDescription_v11-clean.pdf)：§3.8.2 Palette mode 与 IntraBC 图示和工具解释。
- [Overview of the Emerging HEVC Screen Content Coding Extension](https://www.merl.com/publications/docs/TR2015-126.pdf)：HEVC SCC Palette、escape index、Palette Predictor 与 IntraBC 的技术背景。
- [Overview of HEVC Extensions on Screen Content Coding](https://www.cambridge.org/core/journals/apsipa-transactions-on-signal-and-information-processing/article/overview-of-hevc-extensions-on-screen-content-coding/E12DCF69B0A59DD269EFE14CD1AFBFBE)：HEVC SCC IntraBC 因果搜索区域、整数 BV 和搜索范围演进说明。

> 规范定义的是码流和解码行为，不规定某个编码器如何选颜色、采用何种聚类算法，或实际做多大范围的搜索。编码器文档和实现可能提供具体策略，但不应把它们误写成标准要求。
