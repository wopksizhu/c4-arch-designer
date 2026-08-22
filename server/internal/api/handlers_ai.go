package api

import (
	"encoding/json"
	"regexp"
	"strings"

	"github.com/gogf/gf/v2/net/ghttp"
	"github.com/gogf/gf/v2/util/gconv"

	"archlens/server/internal/ai"
	"archlens/server/internal/dsl"
	"archlens/server/internal/model"
	"archlens/server/internal/repo"
	"archlens/server/internal/store"
)

// ---- AI 草稿结构 ----

type AiDraftElement struct {
	Type        string `json:"type"`
	Name        string `json:"name"`
	Description string `json:"description"`
	Technology  string `json:"technology"`
	Level       int    `json:"level"`
	Parent      string `json:"parent"`
}

type AiDraftRel struct {
	Source string `json:"source"`
	Target string `json:"target"`
	Label  string `json:"label"`
}

type AiDraft struct {
	Elements      []AiDraftElement `json:"elements"`
	Relationships []AiDraftRel     `json:"relationships"`
}

type ghttpData map[string]interface{}

// ---- export ----

// exportProject 导出项目：format=dsl|json|markdown。
func exportProject(r *ghttp.Request) {
	pid := idOf(r, "id")
	format := r.Get("format").String()
	if format == "" {
		format = "json"
	}
	content, ct, err := dsl.Export(r.Context(), pid, format)
	if err != nil {
		fail(r, 500, err.Error())
		return
	}
	r.Response.Header().Set("Content-Type", ct)
	r.Response.Write(content)
}

// ---- AI 生成 ----

func aiGenerate(r *ghttp.Request) {
	pid := idOf(r, "id")
	var req model.AiGenerateReq
	if err := r.Parse(&req); err != nil {
		fail(r, 51, err.Error())
		return
	}
	if req.Text == "" {
		fail(r, 51, "请提供需求/描述文本")
		return
	}
	if err := store.RequireProject(r.Context(), pid); err != nil {
		fail(r, 404, err.Error())
		return
	}
	text, err := ai.Chat(r.Context(), buildGeneratePrompt(req.Text))
	if err != nil {
		fail(r, 500, "AI 调用失败: "+err.Error())
		return
	}
	ok(r, ghttpData{"text": text, "draft": parseDraft(text)})
}

// aiApply 将 AI 生成的草稿应用到画布（创建元素与关系）。
func aiApply(r *ghttp.Request) {
	pid := idOf(r, "id")
	var d AiDraft
	// 直接用标准 json 解析请求体，确保嵌套数组正确绑定
	if err := json.Unmarshal(r.GetBody(), &d); err != nil {
		fail(r, 51, err.Error())
		return
	}
	if len(d.Elements) == 0 {
		fail(r, 400, "草稿中没有元素")
		return
	}
	if err := store.RequireProject(r.Context(), pid); err != nil {
		fail(r, 404, err.Error())
		return
	}

	ids := map[string]int64{}
	i := 0
	for _, e := range d.Elements {
		name := strings.TrimSpace(e.Name)
		if name == "" {
			continue
		}
		if _, ok := ids[name]; ok {
			continue
		}
		level := e.Level
		if level == 0 {
			level = levelForType(e.Type)
		}
		id, err := store.CreateElement(r.Context(), &model.Element{
			ProjectId: pid, Level: level, Type: normalizeType(e.Type),
			Name: name, Description: e.Description, Technology: e.Technology,
			PosX: 140 + float64(i%4)*240, PosY: 120 + float64(i/4)*170,
		})
		if err != nil {
			fail(r, 500, err.Error())
			return
		}
		ids[name] = id
		i++
	}

	// 为带 parent 的扁平元素设置父级
	for _, e := range d.Elements {
		parent := strings.TrimSpace(e.Parent)
		if parent == "" {
			continue
		}
		cid, cok := ids[strings.TrimSpace(e.Name)]
		pidv, pok := ids[parent]
		if cok && pok && cid != pidv {
			_ = store.SetElementParent(r.Context(), cid, pidv)
		}
	}

	relCount := 0
	for _, rel := range d.Relationships {
		s, sok := ids[strings.TrimSpace(rel.Source)]
		t, tok := ids[strings.TrimSpace(rel.Target)]
		if sok && tok && s != t {
			if _, err := store.CreateRelationship(r.Context(), &model.Relationship{
				ProjectId: pid, SourceId: s, TargetId: t, Label: orDef(rel.Label, "uses"),
			}); err == nil {
				relCount++
			}
		}
	}

	ok(r, ghttpData{"elements": len(ids), "relationships": relCount})
}

// ---- AI 校验 ----

func aiValidate(r *ghttp.Request) {
	pid := idOf(r, "id")
	var req model.AiValidateReq
	if err := r.Parse(&req); err != nil {
		fail(r, 51, err.Error())
		return
	}
	mode := req.Mode
	if mode == "" {
		mode = "all"
	}
	elems, _ := store.ListElements(r.Context(), pid)
	rels, _ := store.ListRelationships(r.Context(), pid)
	links, _ := store.ListTraceLinks(r.Context(), pid)
	text, err := ai.Chat(r.Context(), buildValidatePrompt(mode, elems, rels, links))
	if err != nil {
		fail(r, 500, "AI 校验失败: "+err.Error())
		return
	}
	ok(r, ghttpData{"text": text, "issues": parseIssues(text)})
}

// ---- AI 代码仓库推断 ----

type aiCodeReq struct {
	Dir string `json:"dir"`
}

func aiCodeFromRepo(r *ghttp.Request) {
	pid := idOf(r, "id")
	var req aiCodeReq
	if err := r.Parse(&req); err != nil {
		fail(r, 51, err.Error())
		return
	}
	if req.Dir == "" {
		fail(r, 51, "请提供代码目录路径")
		return
	}
	if err := store.RequireProject(r.Context(), pid); err != nil {
		fail(r, 404, err.Error())
		return
	}
	summary, err := repo.Scan(r.Context(), req.Dir)
	if err != nil {
		fail(r, 400, "扫描失败: "+err.Error())
		return
	}
	text, err := ai.Chat(r.Context(), buildCodePrompt(summary))
	if err != nil {
		fail(r, 500, "AI 调用失败: "+err.Error())
		return
	}
	ok(r, ghttpData{"text": text, "draft": parseDraft(text), "summary": summary})
}

// ---- AI 元素补全 ----

type aiEnrichReq struct {
	Name        string `json:"name"`
	Description string `json:"description"`
	Type        string `json:"type"`
}

// aiDesignElement 为选中元素生成其内部详细结构（子元素），draft 中元素 parent 填该元素名。
type aiDesignReq struct {
	Name        string `json:"name"`
	Type        string `json:"type"`
	Description string `json:"description"`
}

func aiDesignElement(r *ghttp.Request) {
	pid := idOf(r, "id")
	var req aiDesignReq
	if err := r.Parse(&req); err != nil {
		fail(r, 51, err.Error())
		return
	}
	if req.Name == "" {
		fail(r, 51, "请选择元素")
		return
	}
	if err := store.RequireProject(r.Context(), pid); err != nil {
		fail(r, 404, err.Error())
		return
	}
	text, err := ai.Chat(r.Context(), buildDesignPrompt(req.Type, req.Name, req.Description))
	if err != nil {
		fail(r, 500, "AI 设计失败: "+err.Error())
		return
	}
	ok(r, ghttpData{"text": text, "draft": parseDraft(text)})
}

func aiEnrichElement(r *ghttp.Request) {
	pid := idOf(r, "id")
	var req aiEnrichReq
	if err := r.Parse(&req); err != nil {
		fail(r, 51, err.Error())
		return
	}
	if req.Name == "" {
		fail(r, 51, "请选择元素")
		return
	}
	if err := store.RequireProject(r.Context(), pid); err != nil {
		fail(r, 404, err.Error())
		return
	}
	text, err := ai.Chat(r.Context(), buildEnrichPrompt(req.Type, req.Name, req.Description))
	if err != nil {
		fail(r, 500, "AI 补全失败: "+err.Error())
		return
	}
	ok(r, ghttpData{"text": text})
}

// ---- prompt ----

func buildCodePrompt(summary string) string {
	return `请根据以下代码仓库的目录结构与关键文件片段，用 C4 模型推断软件架构。
只输出 JSON（不要多余解释）：
{"elements":[{"type":"person|softwareSystem|container|component","name":"","description":"","technology":"","level":1|2|3,"parent":""}],"relationships":[{"source":"源名称","target":"目标名称","label":"关系说明"}]}
从中识别可能的软件系统、容器（如 Web/后端/DB）、组件与依赖关系；level 1=Context,2=Container,3=Component。

以下是代码摘要：
` + summary
}

func buildEnrichPrompt(typ, name, desc string) string {
	return `请给下面这个 C4 元素补全「描述」「技术栈」，并给出合理的关联关系建议。
只输出 JSON（不要多余解释）：{"description":"...","technology":"...","relationships":["目标元素名:关系说明"]}
元素类型：` + typ + `
元素名称：` + name + `
当前描述：` + desc
}

func buildDesignPrompt(typ, name, desc string) string {
	childType := "container/component"
	if typ == "softwareSystem" {
		childType = "container"
	} else if typ == "container" {
		childType = "component"
	}
	return `请为下面这个 C4 元素设计其【内部】的详细架构结构（即它的下一层元素）。
只输出 JSON（不要多余解释）：
{"elements":[{"type":"` + childType + `","name":"","description":"","technology":"","level":1|2|3,"parent":"` + name + `"}],"relationships":[{"source":"源名称","target":"目标名称","label":"交互说明"}]}
要求：所有子元素的 parent 一律填「` + name + `」；type 取 ` + childType + `；level 取父元素层级+1；元素命名简洁；只输出这些子元素的 JSON，不要输出父元素本身。
` + "父元素类型：" + typ + `
父元素名称：` + name + `
父元素描述：` + desc
}

// ---- 需求 Markdown 导入 ----

func importRequirements(r *ghttp.Request) {
	pid := idOf(r, "id")
	content := r.Get("content").String()
	if strings.TrimSpace(content) == "" {
		fail(r, 51, "内容为空")
		return
	}
	if err := store.RequireProject(r.Context(), pid); err != nil {
		fail(r, 404, err.Error())
		return
	}
	reqs := parseMarkdownRequirements(content)
	count := 0
	for _, req := range reqs {
		req.ProjectId = pid
		if _, err := store.CreateRequirement(r.Context(), &req); err != nil {
			continue
		}
		count++
	}
	ok(r, ghttpData{"created": count})
}

// ---- 解析辅助 ----

// parseDraft 尝试从 LLM 输出中解析出结构化草稿。
func parseDraft(s string) *AiDraft {
	body := extractJSON(s)
	if body == "" {
		return nil
	}
	var d AiDraft
	if err := json.Unmarshal([]byte(body), &d); err != nil {
		// 容忍尾随逗号等轻量 JSON 瑕疵
		cleaned := regexp.MustCompile(`,\s*}`).ReplaceAllString(body, `}`)
		cleaned = regexp.MustCompile(`,\s*]`).ReplaceAllString(cleaned, `]`)
		if err2 := json.Unmarshal([]byte(cleaned), &d); err2 != nil {
			return nil
		}
	}
	if len(d.Elements) == 0 {
		return nil
	}
	return &d
}

// parseIssues 尝试解析出问题列表。
func parseIssues(s string) []string {
	body := extractJSON(s)
	if body == "" {
		// 逐行拆分作为问题
		return splitLines(s)
	}
	var holder struct {
		Issues []string `json:"issues"`
	}
	if err := json.Unmarshal([]byte(body), &holder); err == nil && len(holder.Issues) > 0 {
		return holder.Issues
	}
	return splitLines(s)
}

func splitLines(s string) []string {
	var out []string
	for _, line := range strings.Split(s, "\n") {
		line = strings.TrimSpace(strings.TrimPrefix(strings.TrimSpace(line), "-"))
		if line != "" {
			out = append(out, line)
		}
	}
	return out
}

func extractJSON(s string) string {
	// 去掉 markdown 代码围栏
	re := regexp.MustCompile("(?s)```[a-zA-Z]*\\s*(.*?)```")
	if m := re.FindStringSubmatch(s); m != nil {
		s = m[1]
	}
	// 平衡括号扫描：取最外层 {...}，处理字符串内的大括号
	start := strings.Index(s, "{")
	if start < 0 {
		return ""
	}
	depth := 0
	inStr := false
	esc := false
	for i := start; i < len(s); i++ {
		c := s[i]
		if inStr {
			if esc {
				esc = false
				continue
			}
			if c == '\\' {
				esc = true
				continue
			}
			if c == '"' {
				inStr = false
			}
			continue
		}
		switch c {
		case '"':
			inStr = true
		case '{':
			depth++
		case '}':
			depth--
			if depth == 0 {
				return s[start : i+1]
			}
		}
	}
	return ""
}

func levelForType(t string) int {
	switch normalizeType(t) {
	case model.TypePerson, model.TypeSoftwareSystem:
		return model.LevelContext
	case model.TypeContainer:
		return model.LevelContainer
	default:
		return model.LevelComponent
	}
}

func normalizeType(t string) string {
	switch strings.ToLower(strings.TrimSpace(t)) {
	case "person", "人":
		return model.TypePerson
	case "softwaresystem", "system", "软件系统", "系统":
		return model.TypeSoftwareSystem
	case "container", "容器":
		return model.TypeContainer
	case "component", "组件":
		return model.TypeComponent
	default:
		return model.TypeComponent
	}
}

func orDef(s, def string) string {
	if s == "" {
		return def
	}
	return s
}

// parseMarkdownRequirements 简单解析：标题/列表行作为需求，支持 [R1] 编号。
func parseMarkdownRequirements(content string) []model.Requirement {
	reCode := regexp.MustCompile(`\[(R\d+)\]`)
	lines := strings.Split(content, "\n")
	var reqs []model.Requirement
	var cur *model.Requirement
	for _, raw := range lines {
		line := strings.TrimSpace(raw)
		if line == "" {
			continue
		}
		if isBulletOrHeading(line) {
			if cur != nil {
				reqs = append(reqs, *cur)
			}
			title := strings.TrimLeft(line, "#-* ")
			code := ""
			if m := reCode.FindStringSubmatch(title); m != nil {
				code = m[1]
				title = strings.TrimSpace(strings.Replace(title, m[0], "", 1))
			}
			cur = &model.Requirement{Code: code, Title: title, Priority: "medium", Status: "draft", Source: "markdown"}
		} else if cur != nil {
			cur.Description += line + "\n"
		}
	}
	if cur != nil {
		reqs = append(reqs, *cur)
	}
	return reqs
}

func isBulletOrHeading(line string) bool {
	return strings.HasPrefix(line, "#") || strings.HasPrefix(line, "-") || strings.HasPrefix(line, "*")
}

// ---- prompt ----

func buildGeneratePrompt(text string) string {
	return `请根据以下需求/描述，用 C4 模型生成软件架构初稿。
只输出如下 JSON（不要多余解释，不要代码块标记）：
{"elements":[{"type":"person|softwareSystem|container|component","name":"","description":"","technology":"","level":1|2|3,"parent":""}],"relationships":[{"source":"源名称","target":"目标名称","label":"关系说明"}]}
要求：level 1=Context, 2=Container, 3=Component；parent 填父元素名称（用于嵌套，没有则留空）；元素名称简洁。

描述：
` + text
}

func buildValidatePrompt(mode string, elems []model.Element, rels []model.Relationship, links []model.TraceLink) string {
	var b strings.Builder
	b.WriteString("请对以下 C4 架构做一致性检查。只输出如下 JSON（不要多余解释）：\n")
	b.WriteString(`{"issues":["问题1","问题2"]}`)
	b.WriteString("\n检查模式：" + mode + "\n若无问题，issues 置空数组。\n\n当前元素：\n")
	for _, e := range elems {
		b.WriteString("- " + e.Type + " " + e.Name + " (level " + gconv.String(e.Level) + ")\n")
	}
	b.WriteString("关系：\n")
	for _, rel := range rels {
		b.WriteString("- " + gconv.String(rel.SourceId) + " -> " + gconv.String(rel.TargetId) + " " + rel.Label + "\n")
	}
	b.WriteString("追溯链接数量：" + gconv.String(len(links)) + "\n")
	return b.String()
}
