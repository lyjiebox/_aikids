# aikids-version

aikids 项目的标准版本开发模式，供 DSH 技能系统加载。

## 调用方式

自然语言即可触发：

- `迭代 aikids 到 v3.4`
- `按标准模式开发 v3.4`
- `用 aikids-version 开发 v3.4`
- `按 proposal 交付 v3.4`

如果 GUI 支持 slash 命令，也可以显式调用 `/aikids-version`。

只需要给版本号；版本描述可选。若 `docs/proposal.md` 已定义清晰，技能会直接按 proposal 执行，不再追问。

## 文件

- `SKILL.md`：技能正文，包含输入判定、Phase 0–6、约束、判定规则、交付模板、项目速查。

## 维护

- 修改流程：编辑 `SKILL.md`，并同步 bump frontmatter 的 `version`。
- 项目级：本目录随仓库走，只对当前 workspace 生效。
- 全局级：复制到 `~/.agents/skills/aikids-version/`，所有项目可用。

## 它保证什么

- 先读/更新 `docs/proposal.md`，再生成 `docs/design-vX.Y.md` 和 `docs/uat-vX.Y.md`
- 开发后跑本地 build / typecheck / UAT，测试报告写入 `temp/vX.Y/`
- 提交 GitHub，并验证 Vercel 生产 Web
- 输出交付报告；无法验证的项会标注，不“假通过”
