---
title: "AVC / HEVC / AV1 Main Profile 帧内预测参考像素平滑对比"
date: 2026-11-12
description: "对比三种 Main Profile 如何准备帧内预测参考边，包括滤波条件、滤波核和强平滑。"
categories: [视频编码]
tags: [AV1, HEVC, AVC, 帧内预测]
---

# AVC / HEVC / AV1 Main Profile 帧内预测参考像素平滑对比

完整的编码块划分、帧内模式、残差变换和重建依赖对比见：[Main Profile 帧内编码详细对比]({{< relref "intra-coding-comparison-main-profiles.md" >}})。

## 1. 范围与结论

本文按 **AVC Main Profile、HEVC Main Profile、AV1 Main Profile（seq_profile = 0）** 比较帧内预测的参考像素预处理。HEVC 的描述限定在 Main，不包含 Main10 或 Range Extensions 的扩展规则。

这里的“参考像素平滑”是指：在生成当前块的帧内预测值之前，对上方、左侧等已重建参考样本进行平滑处理。

核心结论：

- **AVC Main：没有独立的帧内参考像素平滑预滤波。** Main 不支持 Intra_8×8；AVC 的 Intra_8×8 参考平滑属于 High 等支持该工具的 Profile。
- **HEVC Main：按块尺寸和预测模式选择参考平滑。** 普通平滑采用 `[1,2,1]/4`；32×32 亮度块满足条件时可改用强平滑。
- **AV1 Main：方向预测支持多档参考边滤波。** 强度由块尺寸、方向角和邻块模式推导，部分小块还支持参考边 2 倍上采样。

## 2. 总体对比

| 项目 | AVC Main | HEVC Main | AV1 Main |
|---|---|---|---|
| 独立参考平滑预处理 | 无 | 有条件启用 | 有条件启用 |
| 主要适用预测模式 | 不适用 | Planar、部分 Angular；DC 不使用 | Directional；纯水平、纯垂直不使用该边平滑 |
| 普通平滑核 | 无 | `[1,2,1]/4` | 3 档 FIR 核，最低档等价于 `[1,2,1]/4` |
| 选择依据 | 不适用 | 预测块尺寸、预测模式 | 变换块 `w+h`、预测角度、上／左邻块的 Smooth 模式 |
| 根据参考像素值选择强度 | 不适用 | 强平滑有近似线性检测 | 边滤波强度不直接检测参考像素差 |
| 强平滑方式 | 无 | 以参考边端点插值替换中间样本 | 更强的局部 FIR 核 |
| 独立参考边上采样 | 无 | 无 | 部分小块支持 2 倍上采样 |
| 色度参考预平滑 | 无 | Main 的 4:2:0 色度不使用上述参考平滑 | 色度 Directional 预测也可使用，按对应平面推导 |
| 相关高层控制 | 无对应工具 | SPS 的 `strong_intra_smoothing_enabled_flag` 控制强平滑 | 序列头的 `enable_intra_edge_filter` 控制边滤波及相关上采样 |

这些规则属于解码过程：编码器和解码器必须保持一致。块级滤波强度由规则推导，并非编码器可以任意选择而不通知解码器。

## 3. AVC Main：没有独立参考预平滑

AVC Main 的亮度帧内预测包括 Intra_4×4 和 Intra_16×16，不包括 Intra_8×8。

| 预测类型 | 独立参考平滑预滤波 |
|---|---|
| 亮度 Intra_4×4 | 无 |
| 亮度 Intra_16×16 | 无 |
| 4:2:0 色度预测 | 无 |

Intra_4×4 的部分方向预测会直接对参考样本加权，例如：

```text
P = (A + 2*B + C + 2) >> 2
```

这里的输出 `P` 已经是预测像素；没有先生成一条经过平滑的参考边。因此，看到 `[1,2,1]` 系数不能直接判断存在独立参考预滤波。

作为范围说明：High 等支持 Intra_8×8 的 AVC Profile，才有对应的参考样本预滤波，其内部位置通常采用：

```text
r'[i] = (r[i-1] + 2*r[i] + r[i+1] + 2) >> 2
```

该过程不应计入 AVC Main 的工具集合。色度预测块为 8×8，也不意味着它属于亮度 Intra_8×8 工具。

## 4. HEVC Main：模式与尺寸决定是否平滑

### 4.1 普通参考平滑的选择

对亮度角度模式，定义与水平／垂直模式的索引距离：

```text
d = min(abs(mode - 10), abs(mode - 26))
```

其中模式 10 为水平，模式 26 为垂直。这里的 `d` 是模式索引距离，不是角度的度数。

| 预测块尺寸 | Angular 模式的参考滤波条件 | Planar | DC |
|---|---|---|---|
| 4×4 | 不启用 | 不启用 | 不启用 |
| 8×8 | `d > 7`，即模式 2、18、34 | 启用 | 不启用 |
| 16×16 | `d > 1` | 启用 | 不启用 |
| 32×32 | `d > 0`，即除纯水平／垂直之外 | 启用 | 不启用 |

普通滤波核为：

```text
r'[i] = (r[i-1] + 2*r[i] + r[i+1] + 2) >> 2
```

上方与左侧参考边经左上角连接；左上角使用相邻两侧样本参与滤波，参考边远端保持不变。

### 4.2 32×32 亮度强平滑

在已经选用参考滤波的前提下，同时满足以下条件时，使用强平滑替代普通三抽头滤波：

1. 当前是 32×32 亮度预测块。
2. SPS 的 `strong_intra_smoothing_enabled_flag = 1`。
3. 上方和左侧参考边均通过近似线性检测。

设一条参考边的左上角、块宽／高处样本、两倍块宽／高处远端样本分别为 `r0`、`rN`、`r2N`，检测条件为：

```text
abs(r0 + r2N - 2*rN) < (1 << (BitDepthY - 5))
```

HEVC Main 为 8 bit，因此阈值为 8，且比较是严格小于。两条边都需要通过检测。

通过后，上方和左侧分别由左上角与各自远端做线性插值：

```text
N = 32
r'[k] = ((2*N-k)*r0 + k*r2N + N) >> 6    // k = 1..63
```

强平滑保留端点，用端点之间的直线替换内部参考样本；它不是重复执行 `[1,2,1]/4`。关闭 SPS 强平滑开关，也不等于关闭普通参考平滑。

## 5. AV1 Main：多档边滤波与参考边上采样

### 5.1 边滤波核

`enable_intra_edge_filter = 1` 时，方向预测按规则推导参考边滤波强度：

| strength | 滤波核，归一化除以 16 |
|---|---|
| 0 | 不滤波 |
| 1 | `[0,4,8,4,0]`，等价于 `[1,2,1]/4` |
| 2 | `[0,5,6,5,0]` |
| 3 | `[2,4,4,4,2]` |

非零强度的输出采用 `(加权和 + 8) >> 4`，取样越过参考边端点时使用端点扩展。

### 5.2 强度推导依据

- 尺寸：当前变换块的 `w+h`，支持矩形块。
- 方向：上参考边使用 `abs(pAngle - 90)`；左参考边使用 `abs(pAngle - 180)`，单位为度。
- 邻块模式：上方或左侧可用邻块使用 `SMOOTH_PRED`、`SMOOTH_V_PRED`、`SMOOTH_H_PRED` 时，`filterType = 1`；否则为 0。

因此，上／左参考边可能得到不同强度。该选择不直接依据当前参考像素的梯度或方差。

纯垂直 90°、纯水平 180° 不执行上述参考边平滑。对于 `90° < pAngle < 180°` 且 `w+h >= 24` 的方向预测，还会对左上角参考值做专门的 `[5,6,5]/16` 滤波。

### 5.3 参考边 2 倍上采样

对某条参考边，令 `d` 为上述角度差。启用条件为：

```text
enable_intra_edge_filter == 1
0 < d < 40
filterType == 0 时：w+h <= 16
filterType == 1 时：w+h <= 8
```

原样本之间的半像素参考点采用四抽头插值：

```text
half = ClipToBitDepth((-a + 9*b + 9*c - d + 8) >> 4)
```

上式的 `a,b,c,d` 是连续参考样本，与前述角度差变量无关。该步骤提高参考边的采样密度；因核含负系数，需要按位深裁剪。它与三档低通平滑的用途和系数不同。

在上述尺寸和角度条件下，同一条边的平滑强度为 0，因此不能理解成“所有参考边都先低通，再上采样”。

## 6. 实现中需要区分的四类操作

| 操作 | 处理对象 | 典型例子 |
|---|---|---|
| 参考预滤波 | 上／左已重建参考样本的预测用副本 | HEVC 普通／强平滑、AV1 intra edge filter |
| 预测插值或加权 | 由参考值生成预测像素 | AVC Intra_4×4 方向加权、HEVC／AV1 方向投影插值 |
| 预测输出边界修正 | 已生成预测块的边界位置 | HEVC 部分亮度 DC／水平／垂直模式的边界处理 |
| 环路滤波 | 当前图像重建样本 | AVC Deblocking、HEVC Deblocking／SAO、AV1 Deblocking／CDEF／Restoration |

参考预滤波通常只改变预测使用的参考缓冲，不将平滑结果写回邻块重建图像。不能把环路滤波的存在作为 AVC Main 支持参考预平滑的依据。

AV1 的 `SMOOTH_PRED` 和 `FILTER_INTRA` 是独立预测工具，也不应与 `enable_intra_edge_filter` 所控制的参考边处理混用。

## 7. 本仓库对应实现

以下为仓库相对路径，便于检索：

- `common/intra_prediction.c`：`get_filter_strength()`、`filter_edge()`、`get_upsample()`、`upsample_edge()`。
- 同文件的 `get_filter_type()`：根据相邻块预测模式判断 Smooth 上下文。
- 同文件的方向预测参考准备函数：`prep_dr_top_edge()`、`prep_dr_left_edge()`。

## 8. 参考资料

1. [ITU-T H.264 规范](https://www.itu.int/rec/dologin_pub.asp?id=T-REC-H.264-202408-I%21%21PDF-E&lang=e&type=items)：Main Profile 约束；§8.3.2.2.1 的 Intra_8×8 参考样本滤波。
2. [x264 帧内预测实现](https://raw.githubusercontent.com/mirror/x264/master/common/predict.c)：辅助区分预测公式内的参考加权与独立参考预滤波。
3. [HEVC HM TComPattern.cpp](https://hevc.hhi.fraunhofer.de/HM-doc/_t_com_pattern_8cpp_source.html)：参考滤波选择、普通滤波和强平滑实现。
4. [HEVC HM TComPrediction.cpp](https://raw.githubusercontent.com/listenlink/HM/master/source/Lib/TLibCommon/TComPrediction.cpp)：`m_aucIntraFilter` 阈值表和预测过程。
5. [AV1 已批准规范 PDF](https://aomediacodec.github.io/av1-spec/av1-spec.pdf)：§7.11.2.6–12，方向预测、角点滤波、强度选择和上采样。
6. [AV1 在线规范便览](https://aomediacodec.github.io/av1-spec/#directional-intra-prediction-process)：便于定位过程；正式规范以已批准 PDF 为准。
