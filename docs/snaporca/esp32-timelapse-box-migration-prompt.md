# SnapOrca Task Prompt: ESP32 Timelapse Box Migration

下面整段可直接发给修改 SnapOrca 源码的 Codex 任务：

```text
你在现有 SnapOrca 源码工作区中继续维护已经实现的 Klipper/CyberBrick
延时摄影补丁。现在产品正式名称改为：

- English: ESP32 Timelapse Box
- 中文：ESP32 延时摄影盒子
- 规范 Klipper 宏：ESP_TIMELAPSE_SHOT

目标不是简单全局替换，而是完成公开命名迁移，同时保持旧 preset、旧 3MF、
旧 CYBERBRICK_SHOT 宏和 Bambu 原生延时摄影行为兼容。先审查当前源码和
工作区已有混合喷嘴修改，不要回滚、格式化或混入无关改动。

工作边界：

1. 只改 SnapOrca 源码、资源、翻译和测试。
2. 不改 ESP32 固件，不改 Klipper 配置器，不发起真实打印。
3. 不覆盖正在运行目录的 DLL，不启动 GUI，除非我后续明确要求。
4. 不回滚工作区已有混合喷嘴/多口径功能。
5. 新公开 UI、G-code 和新保存配置不得继续把 CyberBrick 或 Bambu 当成
   我们产品名；旧词只能出现在兼容读取、迁移测试和兼容说明中。

一、先做迁移清单

搜索并列出当前补丁中全部 CyberBrick 相关符号、配置键、capability、UI
字符串、G-code 注释、命令、preset JSON、3MF 字段和测试 fixture。重点包括
但不限于：

- supports_cyberbrick_timelapse
- cyberbrick_timelapse_* 参数
- CYBERBRICK_SHOT
- CYBERBRICK_TRADITIONAL_TIMELAPSE_BEGIN/END
- CYBERBRICK_SMOOTH_TIMELAPSE_BEGIN/END
- CyberBrick backend / warning / error 文案

先给出 old -> canonical 映射，再实施。不要假设上面列出了全部现有键。

二、规范名称与兼容读取

新代码应使用一致的 canonical 命名，例如：

- supports_esp32_timelapse
- esp32_timelapse_* 配置参数
- ESP_TIMELAPSE_SHOT
- ESP32_TIMELAPSE_TRADITIONAL_BEGIN/END
- ESP32_TIMELAPSE_SMOOTH_BEGIN/END

如果当前项目命名规则要求更具体的后缀，可按本仓库风格调整，但必须统一并
在报告中列出最终键名。

兼容策略：

1. 旧 preset/3MF 中 supports_cyberbrick_timelapse 和 cyberbrick_timelapse_*
   必须仍可加载。
2. 读取时 canonical 优先，只有 canonical 缺失时才使用 legacy。
3. 保存新 preset/3MF 时写 canonical；不要继续扩散旧品牌键。
4. 若为了 3MF 往返兼容必须保留旧字段，集中在明确的 migration/alias helper，
   不要让业务逻辑到处判断两套键。
5. 加载旧配置后重新保存，再加载，行为必须一致。
6. 不要删除旧兼容，至少保留到未来明确的 major migration。

延时摄影枚举历史序列必须保持：序列化 0=Traditional、1=Smooth、2=Off；
UI 顺序仍为“关闭、传统模式、平滑模式”。读取、显示、保存三条路径都必须
经过同一双向映射。不能因改名造成旧配置枚举错位。

三、UI 与提示语

把所有用户可见的旧产品名改为 ESP32 Timelapse Box / ESP32 延时摄影盒子，
中英文都完整翻译。建议关键提示：

标题：启用 ESP32 延时摄影盒子？

正文：此打印机预设已配置 ESP32 延时摄影参数，但后端尚未启用。是否仅为
本次打印启用？仅当 Klipper 已安装 ESP_TIMELAPSE_SHOT 宏时才继续。

不要把功能写成仅支持 U1。UI 应表达为通用 Klipper capability；U1 只是已
验证 preset。标准 U1 仍默认使用原生延时摄影，只有用户显式启用 ESP32
后端才切换。非 Klipper 或 capability=false 不输出 ESP32 命令。

四、G-code 契约

新切片必须只输出 ESP_TIMELAPSE_SHOT，不输出 CYBERBRICK_SHOT。Klipper
侧会保留旧宏兼容，因此切片器不需要双发；双发会造成歧义。

Off：
- 0 个 ESP_TIMELAPSE_SHOT。
- 启用 ESP32 backend 后由它完整接管延时摄影；Off 也不得落入旧
  time_lapse_gcode 或 TIMELAPSE_TAKE_FRAME 造成重复。

Traditional：
- 完成当前整层后恰好一帧，层号连续。
- 严格顺序：M400 -> ESP_TIMELAPSE_SHOT -> G4 P<wait>。
- wait 最小 2000 ms，默认 2000 ms；GUI 校验和 G-code 入口都拒绝更小值。
- 不停车、不生成稳定塔。

Smooth：
- 完成当前层的模型、支撑和稳定塔动作后再拍。
- 单材料也必须通过现有 WipeTower2/prime-tower 引擎生成真实 Bambu 式稳定塔，
  不是注释块或空走；多材料仍是一座物理塔。
- 不得为了单材料塔伪造 SEMM 卸料、额外长 E 或虚假换料。
- support-only 层也必须有同层号塔动作与一帧。
- 使用实际塔深度、brim、稳定锥、旋转轮廓检查热床、禁入区和模型碰撞。
- 抬 Z 需求为 max(0.2mm, layer_height, z_hop)，必须获得完整净空；剩余
  printable_height 不足时停止切片，不能截断抬升后横移。
- 通用 Klipper 停车 X/Y 使用“未配置”哨兵值；未配置或越界时阻止切片，
  不得把 U1 的 X20 Y240 偷当通用默认。U1 preset 可以显式配置该点。
- 返回顺序：先在抬升高度做 XY 返回，再单独下降 Z，最后恢复挤出。
- 不使用 RESTORE_GCODE_STATE MOVE=1 进行危险的同步 XYZ 返回。
- final purge / 最终 purge 和塔清理必须在最后一帧之前；最后一帧后不得再有正向模型 XY+E。

统一时序决定：拍“完成的当前整层”，避免首张空床和最终层缺失。不要改回
Bambu bundled profile 的层首语义。Bambu 对照只用于学习塔结构，不能覆盖
这个已确定的产品契约。

五、Bambu 原生隔离

X1C/P1S/A1 等 bundled Bambu presets 必须保持原 M971/TIMELAPSE 行为，0 个
ESP_TIMELAPSE_SHOT。不要改它们的层首拍摄、A1 成品帧或 3MF 0/1 契约。
标准 U1 的原生 TIMELAPSE_TAKE_FRAME 也要保留；只有显式开启 ESP32 backend
才接管。3MF Off 的现有 -1 映射及历史 helper 行为必须继续通过测试。

六、capability 与 preset

1. 将 canonical ESP32 字段加入 printer preset 允许/持久化列表。
2. 真实非 U1 Klipper preset 必须能加载、继承、保存、重载这些字段。
3. Snapmaker U1 各喷嘴 profile 明确 capability，但默认 backend/timelapse 为
   Off，不应无提示插入命令。
4. 四槽 U1 单工具 Off/Traditional 不生成虚假塔；Smooth 单工具生成稳定塔；
   实际多工具和逐层换工具继续使用一座真实塔。
5. 判断塔需求必须依据实际使用工具和逐层自定义换工具，不是仅依据配置的
   挤出机数量。

七、必须补齐的测试

至少覆盖：

- legacy preset/3MF -> canonical 内存配置 -> canonical 保存 -> 重载；
- canonical 与 legacy 同时存在时 canonical 优先；
- 枚举 0/1/2 与 UI Off/Traditional/Smooth 双向映射；
- Off、Traditional、Smooth 无塔/单工具塔/多工具塔/支撑层/逐层换工具；
- 每层一帧，层号 0..N-1 连续，最终 purge 在最后一帧之前；
- Z 净空临界成功和净空不足失败；
- 通用 Klipper 停车点未配置/越界失败；
- ESP32 backend 接管后旧 hook 不重复，包括 Off；
- capability=false、非 Klipper、标准 Bambu profiles 不输出 ESP32 命令；
- 真实 PresetBundle：U1、一个兼容的通用 Klipper preset、X1C/P1S/A1 对照；
- 中英文 UI/错误文本不再公开显示旧产品名；
- 新 G-code marker 与命令全部 canonical。

生成 27x27x27 mm、0.2 mm 层高的 Off/Traditional/Smooth 证据，并报告：
层数、帧数、真实塔层、塔块数、空间聚类后物理塔数、最终帧前后挤出顺序。
再生成 bundled Bambu X1C/P1S/A1 对照。若用户指定的 process 与 printer 不
兼容，要明确报告并另补一个真实兼容基线，不能静默合成假 preset。

八、构建与交付

完成后执行现有 Release 构建、CyberBrick/ESP32 相关 FFF 和 libslic3r 专项、
CTest、profile validator、msgfmt --check --check-format、git diff --check。
完整套件若存在基线失败，要与干净基线归一化比较，不能把既有失败算成本次
成功，也不能为了全绿修改无关测试。

交付报告按以下顺序：

1. 结论和 P0/P1 阻断项；
2. old -> canonical 键/符号映射；
3. 主要源码位置；
4. 测试、构建和 G-code 证据表；
5. Bambu 对照差异；
6. 尚未验证的 GUI/实机风险；
7. 明确说明未同步 DLL、未启动 GUI、未真实打印、未改 ESP32/Klipper。

不要只给计划，直接审查、实现、测试并生成证据。遇到与现有混合喷嘴改动
冲突时保留用户改动，做最小兼容修改，不要回滚。
```
