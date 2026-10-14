# Design System P0 门禁

`@octo/design-system` 的机器可读契约位于 `packages/design-system/src/tokens.json`。
契约版本和 canonical JSON SHA 会写入 renderer manifest，CSS 文件中的
`@octo-design-system-contract-sha256` marker 必须与契约一致。

本阶段提供两个检查：

- `pnpm run check:design-system`：校验契约到 `tokens.css` 的 round-trip、主题声明和
  Design System 包内部的未定义 custom properties，并检查样式基线没有新增硬编码值。
- `pnpm run inventory:design-system`：重新生成
  `docs/design-system/style-inventory-baseline.json`，只有在有意调整基线时使用。

基线是迁移起点的度量，不代表业务域已经完成迁移。后续每个业务域的 MR 都应让颜色、
固定尺寸和未定义变量计数下降或保持不变；收口阶段再将允许的遗留值清零。
