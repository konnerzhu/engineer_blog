---
title: "AVC / HEVC / AV1 Main Profile：环路滤波详细对比"
date: 2026-11-12
description: "详细比较 AVC 去块滤波、HEVC 去块滤波与 SAO，以及 AV1 的去块、CDEF 和 Loop Restoration。"
categories: [视频编码]
tags: [AV1, HEVC, AVC, 环路滤波, 去块滤波]
---

# AVC / HEVC / AV1 Main Profile：环路滤波详细对比

## 1. 先说结论：它们处理的失真不完全相同

环路滤波发生在块解码重建之后。滤波结果会进入后续帧的参考图像，因此编码器必须把滤波器参数写入码流，解码器按规范执行，才能保证预测闭环一致。

```text
AVC Main：  重建 → Deblocking → 参考图像
HEVC Main： 重建 → Deblocking → SAO        → 参考图像
AV1 Main：  重建 → Deblocking → CDEF → [Super-resolution] → Loop Restoration → 参考图像
```

| 标准 | 环路滤波器 | 主要工作对象与目标 |
|---|---|---|
| AVC / H.264 Main | Deblocking | 平滑宏块和变换块边界附近的块效应 |
| HEVC / H.265 Main | Deblocking、SAO | Deblocking 处理块边界；SAO 按样本类别补偿重建偏差 |
| AV1 Main | Deblocking、CDEF、Loop Restoration | 依次处理块边界、方向性振铃和更大区域内残留的模糊／失真 |

一个重要的表述修正：**AV1 没有 HEVC 的 SAO 语法和 SAO 解码过程，但不宜说成“AV1 把 SAO 原样换成了 CDEF + Loop Restoration”。** 两者的分类方法、滤波计算和控制粒度都不同；CDEF、Loop Restoration 是 AV1 采用的另一套滤波设计。AV1 标准没有定义一个“取代 SAO”的单一工具。

本文限定 AVC Main、HEVC Main、AV1 Main 的常规有损路径。AV1 的胶片颗粒合成也不是环路滤波：合成颗粒影响显示画面，但不写回后续预测用的参考帧。

## 2. 统一比较框架：边界滤波、样本修正、区域恢复

为了理解各工具的分工，可以把滤波任务分为三类：

1. **边界修复**：两个独立编码块的边缘出现不连续，视觉上形成方格或接缝。
2. **局部样本偏差修正**：重建样本相对原始信号出现系统性的偏高／偏低，或锐利边缘附近出现振铃。
3. **区域级重建恢复**：块边缘已经平滑后，较大区域仍有模糊、纹理损失或量化失真。

去块滤波主要处理第 1 类；HEVC SAO 以分类加偏移处理第 2 类；AV1 用 CDEF 定向、受约束地处理振铃，并用 Loop Restoration 对更大恢复单元做 Wiener 或 self-guided 修正。这个映射是对工具作用的归纳，不表示每一种失真都能由某一个滤波器单独消除。

| 问题 | 典型工具 | 作用尺度 |
|---|---|---|
| 块与变换边界的突变 | Deblocking | 以边为中心，修改边两侧邻近样本 |
| 边缘周围的振铃 | CDEF；SAO 的 Edge Offset 在部分情形下也会修正边缘分类 | CDEF 按小块方向取邻域；SAO 按 CTU 内样本分类 |
| 平滑渐变中的样本偏差、重建区域失真 | SAO Band Offset；AV1 Loop Restoration | SAO 是类别偏移；Loop Restoration 是按恢复单元应用滤波 |

## 3. AVC Main 去块滤波

### 3.1 识别边界，再决定滤不滤、滤多强

AVC 在重建整幅图像后执行去块滤波。解码器检查亮度和色度的块边界，根据边界两侧的编码信息、量化参数和样本变化情况推导边界强度（boundary strength，`bS`），再决定是否修改样本。

边界强度并不是单纯由像素差决定。它会参考边界两侧是否为帧内编码、是否有非零残差系数、运动信息是否不同等；随后再结合 QP 派生的阈值判断平坦区域是否适合平滑。这样可以在去除编码接缝与保留真实图像边缘之间折中。

滤波可概括为两类行为：

- **较弱滤波**：对边界附近少量样本做有限调整，常见于一般块边界。
- **较强滤波**：用于需要更强平滑、且边界样本条件满足的情况；调整范围可能扩大。

### 3.2 作用网格与控制

AVC 的去块流程以宏块为组织基础，按垂直边、再按水平边处理。规范中的通用流程包含 4×4 或某些 Profile／变换条件下的 8×8 边；**AVC Main 不启用 High Profile 的 8×8 变换工具，普通 Main 图像的典型边界网格以 4×4 为主**。因此，不能把所有 AVC Profile 的边界行为一概而论。

slice 头中的 `disable_deblocking_filter_idc` 可控制当前 slice 的滤波，以及是否跨 slice 边界处理；alpha、beta 偏移则调整滤波阈值。参数较少、计算规则稳定，是 AVC 去块滤波的重要特点。

## 4. HEVC：去块滤波仍是第一步，SAO 是另一类操作

### 4.1 HEVC 去块滤波相对 AVC 的变化

HEVC 同样根据边界强度和量化相关阈值进行自适应去块，但它需要适配 CTU、CU、PU、TU 的分层结构。滤波边界来自预测块和变换块等结构；为了控制复杂度，HEVC 的去块滤波按 8×8 样本网格约束边缘处理。小于 8 个样本的块边界不会全部逐条滤波，只有符合网格条件的边缘会处理。

HEVC 去块不是简单地把 AVC 滤波强度调大。它的特点包括：

- **边界与编码结构联动**：边界强度利用预测模式、残差、参考和运动差异等信息推导。
- **稀疏一些的边缘处理网格**：8×8 网格控制需要检查和滤波的边界数量，降低大块结构下的工作量。
- **按 QP 派生阈值并可偏移**：β 与 `tC` 等阈值受 QP 和 slice / PPS 偏移控制，影响边缘是否滤波及调整幅度。
- **边界行为有强弱之分**：边界强度与平坦度等条件决定滤波路径，避免所有边缘都使用同一强度。

因此，HEVC 的改进重点是让边界滤波适配更大的编码单元和更复杂的分区树，同时控制计算量。**“8×8 网格更稀疏”并不意味着一定更清晰或更模糊**；最终结果仍取决于边界分布、QP、滤波偏移和编码器选择。

### 4.2 SAO 的两种分类方式

SAO（Sample Adaptive Offset，样本自适应偏移）位于去块之后。它先把重建样本分到类别，再对类别施加偏移。可以理解为“类别查表后加一个小修正值”，而不是像 Deblocking 那样直接在块边界两侧平滑邻域。

| SAO 类型 | 分类依据 | 能表达的修正 |
|---|---|---|
| Band Offset（BO） | 样本值所在的亮度／色度强度区间 | 为选中的强度区间添加偏移，适合修正某些样本值范围内的系统偏差 |
| Edge Offset（EO） | 当前样本与指定方向两个相邻样本的大小关系 | 根据局部边缘类别，为样本添加对应偏移 |

SAO 参数以 CTU 为组织粒度，可按分量选择模式和偏移，也可按规则从相邻 CTU 复用参数。SAO 计算简单，能够修正不只发生在编码块边界上的样本误差；但它的模型是分类偏移，本身不是高自由度的局部卷积滤波。

HEVC 主 Profile 的环路滤波顺序固定为：**Deblocking → SAO**。SAO 输入的是已经去块的重建样本，因此两者不是重复执行同一个任务。[ITU-T H.265 规范对顺序及 SAO 的定义](https://www.itu.int/rec/dologin_pub.asp?id=T-REC-H.265-202108-S%21%21PDF-E&lang=e&type=items)

## 5. AV1：Deblocking → CDEF → Loop Restoration

### 5.1 AV1 去块滤波：滤波长度和边缘平坦度更灵活

AV1 仍保留去块滤波。它同样检测块边界、结合强度阈值判断是否滤波；增强点集中在滤波长度选择和长滤波保护上。

AV1 亮度去块支持 4、8、14 tap 滤波，色度支持 4、6 tap。可用长度与边界两侧变换块尺寸有关；实际滤波还要通过局部变化和平坦度条件检查。较长滤波只有在边界两侧足够平坦时才使用，否则退回较短滤波，以减少把真实边缘抹平的风险。[AV1 技术概述](https://arxiv.org/abs/2008.06091)

AV1 的基础滤波级别可区分垂直／水平边和分量，另有 sharpness、segment、参考帧／预测模式 delta 等调节机制；规范允许按块使用 loop-filter delta。相比 AVC / HEVC 的阈值和边界强度体系，AV1 的去块滤波可在方向、分量、块结构和局部平坦度上做更细区分。

这并不等于“AV1 每条边都用 14 tap”。14 tap 是满足尺寸和局部条件时可用的上限之一；实际滤波会按规则选择长度或不滤波。

### 5.2 CDEF：方向性去振铃，而不是第二个去块器

CDEF（Constrained Directional Enhancement Filter）按 8×8 区域估计主要边缘方向，再沿主要方向和辅助方向做非线性滤波。它对与当前像素差异过大的邻居施加约束，避免跨过清晰边缘混合颜色；因此主要目标是抑制量化带来的方向性振铃，同时尽量不把锐边磨平。

CDEF 强度在帧头提供若干组参数，64×64 区域选择一组参数索引；解码器从去块后的图像进行方向估计并执行滤波。它和去块的关键差别是：**去块围绕编码边界工作，CDEF 围绕局部纹理方向工作**。如果只把 CDEF 当成“更强的 deblock”，就会忽略它不是按块边界触发的这一点。[CDEF 设计论文](https://arxiv.org/abs/1602.05975)

### 5.3 Loop Restoration：按区域恢复残余误差

Loop Restoration 在 CDEF 之后工作，恢复单元通常为 64×64、128×128 或 256×256（实际尺寸由帧尺寸和语法推导）。每个分量、每个恢复单元可采用：

- **Wiener filter**：水平与垂直可分离的线性滤波，系数由编码器求出并写入码流。
- **SGRPROJ**：Self-Guided Restoration，利用局部平滑结果和引导参数组合修正样本。
- **None**：该恢复单元不滤波。

恢复单元级控制允许编码器针对局部内容跳过滤波、选择滤波类型和参数。它能处理块边界滤波之后仍存在的区域性模糊或重建误差；但它也可能削弱真实纹理，所以滤波类型、参数和是否使用都需要编码器在码率与失真之间权衡。

若启用 AV1 Super-resolution，帧处理顺序会在 CDEF 后增加水平上采样，再执行 Loop Restoration。它不是一个每帧必用的环路滤波器。最后的 film grain synthesis 属于显示输出阶段，不进入参考帧闭环。[AV1 规范](https://aomediacodec.github.io/av1-spec/av1-spec.pdf) [AOMedia AV1 工具说明，§3.7](https://aomedia.org/docs/AV1_ToolDescription_v11-clean.pdf)

## 6. 为什么 AV1 不采用 HEVC 的 SAO，而是 CDEF + Loop Restoration？

这个问题可以这样回答：**AV1 没有采用 HEVC 的 SAO 工具，而选择了职责拆分得更明确的一组滤波阶段；但不应据此说 AV1 把 SAO 一对一替换成了 CDEF + Loop Restoration。**

两套设计的模型不同：

| 对比项 | HEVC SAO | AV1 CDEF | AV1 Loop Restoration |
|---|---|---|---|
| 核心表示 | 类别 + 样本偏移 | 方向 + 受约束的邻域滤波 | 恢复单元 + 参数化滤波器 |
| 主要输入线索 | 强度区间，或样本与邻居的类别关系 | 8×8 块的方向结构及邻样本差值 | 恢复单元局部统计与编码器优化参数 |
| 主要目标 | 修正分类后的样本偏差 | 控制振铃，尽量保住边缘 | 修正去块／CDEF 后剩余的区域失真 |
| 空间粒度 | CTU 内按类别处理 | 方向估计按 8×8，强度索引关联 64×64 区域 | 通常 64～256 样本宽的恢复单元 |

从功能分工看，AV1 先用 Deblocking 清理结构性块边界，再让 CDEF 专门利用方向信息处理振铃，最后让 Loop Restoration 对较大区域进行可配置恢复。这样的组合能处理 SAO 分类偏移不直接描述的失真类型，也带来更多参数和计算工作。

不过，**“为什么 AV1 设计者选择这套方案”属于设计动机分析**：AV1 规范规定了 CDEF、Loop Restoration 的行为和顺序，但没有把“弃用 SAO 的原因”写成规范性命题。更严谨的说法是：AOMedia 的 AV1 工具文档把 Deblocking、CDEF、Loop Restoration 分列为不同阶段；CDEF 设计论文解释其定向、非线性、受约束的滤波思路；HEVC 标准则规定 SAO 的分类偏移机制。由这些来源可以解释工具职责的差异，但不能推导出“SAO 一定差”或“AV1 一定画质更好”。

## 7. 去块滤波三代演进对照

| 维度 | AVC Main | HEVC Main | AV1 Main |
|---|---|---|---|
| 处理对象 | 宏块及其内部相关边界 | 预测块、变换块边界，并受 8×8 样本网格约束 | 变换块边界；滤波长度还依两侧变换尺寸 |
| 边界强度 | bS 与 QP 派生阈值 | bS 与 QP 派生的 β / tC 阈值 | 基础 level、sharpness、局部差值阈值与 delta |
| 分量／方向控制 | 亮度／色度按规范推导边和阈值 | 亮度／色度参数及边界条件 | 水平／垂直和分量可独立控制 level |
| 滤波范围 | 典型为较窄边缘邻域 | 弱／强滤波，按边界强度和局部条件决定 | 4/8/14 tap 亮度、4/6 tap 色度的滤波类型按条件选择 |
| 保护真实边缘 | 通过边界强度、α/β 阈值和样本条件 | 通过 bS、β / tC 与平坦度条件 | 通过局部边缘差值门限，长滤波还要求更严格的平坦度 |
| 额外的后续滤波 | 无 | SAO | CDEF + Loop Restoration |

**与 AVC 相比，HEVC 的去块改进重点**是配合更大的编码结构并限制滤波边网格；**与 HEVC 相比，AV1 的去块改进重点**是支持更长的可选滤波，并用更多局部条件避免在真实边缘上使用长滤波。两者是不同改进方向，不能只用“滤波更强”概括。

## 8. 典型图像现象与滤波器分工

| 画面现象 | AVC | HEVC | AV1 |
|---|---|---|---|
| 低码率下明显方格 | Deblocking 平滑宏块／变换边界 | Deblocking 先处理边界 | Deblocking 先处理变换块边界 |
| 锐利边缘附近有光晕 | Deblocking 可处理边界接缝，不能专门做方向性振铃滤波 | SAO 的 EO 可能修正部分边缘类别 | CDEF 按方向处理，约束跨越过大差值的邻点 |
| 平坦渐变有偏差或台阶 | 主要靠编码精度及去块阈值 | SAO Band Offset 可按强度范围修正样本 | Loop Restoration 可做区域级 Wiener / SGRPROJ 修正 |
| 纹理变得模糊 | 过强去块可能削弱细节 | 过强去块或 SAO 偏移也可能改变细节 | 过强 CDEF / Restoration 同样可能损伤纹理，编码器可按区跳过／调参 |

滤波器不能还原码流里从未编码的信息。它们是在解码端按双方共享的参数做一致处理，以减少误差或改善重建结果；目标是提升参考帧质量并降低后续预测残差，不是保证重建图像与原始图像完全一致。

## 9. 常见误解

| 说法 | 更准确的理解 |
|---|---|
| AV1 把 SAO 换成了 CDEF | AV1 没有 SAO 语法；CDEF 是定向受约束滤波，和 SAO 的类别偏移模型不同 |
| SAO 就是去块滤波的第二遍 | SAO 在 Deblocking 之后，但它按 CTU 分类样本加偏移，不是重复做一次边界平滑 |
| CDEF 是 AV1 的去块滤波 | AV1 另有 Deblocking；CDEF 处理方向性邻域和振铃 |
| AV1 的去块每条边都使用 14 tap | 14 tap 是有条件的长滤波；尺寸和局部平坦度不满足时会用较短滤波 |
| Loop Restoration 是显示后滤镜 | 它位于环路内，结果用于参考帧；film grain synthesis 才不参与后续预测 |
| HEVC 的滤波一定比 AVC 强 | HEVC 改变了边界网格和参数推导；具体强弱随内容、QP、边界和码流参数变化 |
| AV1 滤波工具更多，所以画面必然更好 | 工具更丰富也增加参数选择和计算；最终效果要在相同编码条件下比较 |

## 10. 主要参考资料

1. [ITU-T H.264 (08/2024) 规范 PDF](https://www.itu.int/rec/dologin_pub.asp?id=T-REC-H.264-202408-I%21%21PDF-E&lang=e&type=items)：§8.7 去块流程、边界强度、阈值和滤波控制。
2. [ITU-T H.265 (01/2026) 规范入口](https://www.itu.int/rec/T-REC-H.265-202601-P)：当前 H.265 规范版本。
3. [ITU-T H.265 (08/2021) 规范 PDF](https://www.itu.int/rec/dologin_pub.asp?id=T-REC-H.265-202108-S%21%21PDF-E&lang=e&type=items)：§8.7 环路滤波、Deblocking 与 SAO 的定义及顺序。
4. [AV1 已批准规范 PDF](https://aomediacodec.github.io/av1-spec/av1-spec.pdf)：§7.14 Deblocking、§7.15 CDEF、§7.16 Upscaling、§7.17 Loop Restoration、§7.20 Reference frame update。
5. [AOMedia AV1 工具说明](https://aomedia.org/docs/AV1_ToolDescription_v11-clean.pdf)：§3.7 的去块、CDEF、Loop Restoration 工具结构说明。
6. [A Technical Overview of AV1](https://arxiv.org/abs/2008.06091)：作者对 AV1 环路滤波阶段、tap 长度、边界保护和参数控制的技术概述。
7. [The AV1 Constrained Directional Enhancement Filter (CDEF)](https://arxiv.org/abs/1602.05975)：CDEF 的方向检测与受约束非线性滤波设计。

标准定义的是解码器必须执行的操作。本文关于设计取舍的说明，是根据这些工具的输入、分类和滤波结构作出的工程分析；标准没有规定某一代滤波器对所有画面都更优。
