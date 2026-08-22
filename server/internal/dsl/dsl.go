package dsl

import (
	"context"
	"encoding/json"
	"fmt"
	html "html"
	"strings"

	"archlens/server/internal/model"
	"archlens/server/internal/store"
)

// Export 导出项目为指定格式：dsl | json | markdown。
func Export(ctx context.Context, projectId int64, format string) (string, string, error) {
	p, err := store.GetProject(ctx, projectId)
	if err != nil {
		return "", "", err
	}
	if p == nil {
		return "", "", fmt.Errorf("project not found")
	}
	elems, _ := store.ListElements(ctx, projectId)
	rels, _ := store.ListRelationships(ctx, projectId)
	reqs, _ := store.ListRequirements(ctx, projectId)
	protos, _ := store.ListPrototypes(ctx, projectId)
	links, _ := store.ListTraceLinks(ctx, projectId)

	switch format {
	case "dsl":
		return buildDSL(p, elems, rels), "text/plain; charset=utf-8", nil
	case "markdown":
		return buildMarkdown(p, elems, rels, reqs, protos, links), "text/markdown; charset=utf-8", nil
	case "html":
		return buildHTML(p, elems, rels, reqs, protos, links), "text/html; charset=utf-8", nil
	default: // json
		data := map[string]interface{}{
			"project":       p,
			"elements":      elems,
			"relationships": rels,
			"requirements":  reqs,
			"prototypes":    protos,
			"traceLinks":    links,
		}
		b, err := json.MarshalIndent(data, "", "  ")
		if err != nil {
			return "", "", err
		}
		return string(b), "application/json; charset=utf-8", nil
	}
}

// buildDSL 生成类 Structurizr DSL 的文本。
func buildDSL(p *model.Project, elems []model.Element, rels []model.Relationship) string {
	var b strings.Builder
	name := p.Name
	if name == "" {
		name = "Untitled"
	}
	b.WriteString(fmt.Sprintf("workspace \"%s\" {\n", name))
	b.WriteString("  model {\n")

	byID := map[int64]*model.Element{}
	for i := range elems {
		byID[elems[i].Id] = &elems[i]
	}
	children := map[int64][]*model.Element{}
	roots := []*model.Element{}
	for i := range elems {
		e := &elems[i]
		if e.ParentId != nil {
			if _, ok := byID[*e.ParentId]; ok {
				children[*e.ParentId] = append(children[*e.ParentId], e)
				continue
			}
		}
		roots = append(roots, e)
	}

	var renderNode func(e *model.Element, indent int)
	renderNode = func(e *model.Element, indent int) {
		pad := strings.Repeat(" ", indent)
		kw := keyword(e.Type)
		if len(children[e.Id]) > 0 {
			b.WriteString(fmt.Sprintf("%s%s \"%s\" {\n", pad, kw, e.Name))
			for _, c := range children[e.Id] {
				renderNode(c, indent+2)
			}
			b.WriteString(pad + "}\n")
		} else {
			b.WriteString(fmt.Sprintf("%s%s \"%s\"\n", pad, kw, e.Name))
		}
	}

	for _, e := range roots {
		renderNode(e, 4)
	}

	// 关系
	for _, rel := range rels {
		s := byID[rel.SourceId]
		t := byID[rel.TargetId]
		if s == nil || t == nil {
			continue
		}
		label := rel.Label
		if label == "" {
			label = "uses"
		}
		b.WriteString(fmt.Sprintf("    \"%s\" -> \"%s\" \"%s\"\n", s.Name, t.Name, label))
	}

	b.WriteString("  }\n")
	b.WriteString("  views {\n    systemContext \"Context\" { include * }\n    container \"Containers\" { include * }\n    component \"Components\" { include * }\n  }\n")
	b.WriteString("}\n")
	return b.String()
}

// buildHTML 生成自包含的单文件 HTML 报告。
func buildHTML(p *model.Project, elems []model.Element, rels []model.Relationship, reqs []model.Requirement, protos []model.Prototype, links []model.TraceLink) string {
	levelName := map[int]string{1: "Context", 2: "Container", 3: "Component"}

	// 追溯矩阵
	reqName := map[int64]string{}
	for _, r := range reqs {
		reqName[r.Id] = r.Code + " " + r.Title
	}
	protoName := map[int64]string{}
	for _, pr := range protos {
		protoName[pr.Id] = pr.Name
	}
	reqLinked := map[int64][]int64{}
	protoLinked := map[int64][]int64{}
	for _, l := range links {
		if l.FromType == "requirement" && l.ToType == "element" {
			reqLinked[l.ToId] = append(reqLinked[l.ToId], l.FromId)
		}
		if l.FromType == "element" && l.ToType == "requirement" {
			reqLinked[l.FromId] = append(reqLinked[l.FromId], l.ToId)
		}
		if l.FromType == "element" && l.ToType == "prototype" {
			protoLinked[l.FromId] = append(protoLinked[l.FromId], l.ToId)
		}
		if l.FromType == "prototype" && l.ToType == "element" {
			protoLinked[l.ToId] = append(protoLinked[l.ToId], l.FromId)
		}
	}
	join := func(ids []int64) string {
		out := ""
		for i, id := range ids {
			if i > 0 {
				out += ", "
			}
			if n, ok := reqName[id]; ok {
				out += n
			}
		}
		return out
	}
	joinProto := func(ids []int64) string {
		out := ""
		for i, id := range ids {
			if i > 0 {
				out += ", "
			}
			if n, ok := protoName[id]; ok {
				out += n
			}
		}
		return out
	}

	var b strings.Builder
	b.WriteString(`<!doctype html><html lang="zh"><head><meta charset="utf-8"><title>`)
	b.WriteString(html.EscapeString(p.Name))
	b.WriteString(`</title><style>
body{font-family:-apple-system,'Microsoft YaHei',sans-serif;color:#1f2937;margin:0;background:#f4f6f9}
.wrap{max-width:960px;margin:0 auto;padding:24px}
header{background:#2563eb;color:#fff;padding:24px;border-radius:12px}
h1{margin:0 0 4px;font-size:26px}
h2{margin:24px 0 8px;font-size:18px;border-left:4px solid #2563eb;padding-left:10px}
table{width:100%;border-collapse:collapse;background:#fff;font-size:13px;margin-top:8px}
th,td{border:1px solid #e5e7eb;padding:6px 8px;text-align:left}
th{background:#f9fafb}
.muted{color:#6b7280}.level1{color:#0f766e}.level2{color:#1d4ed8}.level3{color:#b45309}
footer{margin-top:24px;color:#9ca3af;font-size:12px}
</style></head><body><div class="wrap"><header><h1>`)
	b.WriteString(html.EscapeString(nameOr(p.Name, "未命名")))
	b.WriteString(`</h1><div>`)
	b.WriteString(html.EscapeString(p.Description))
	b.WriteString(`</div></header>`)

	b.WriteString(`<h2>模型元素</h2><table><thead><tr><th>层级</th><th>类型</th><th>名称</th><th>技术</th><th>描述</th></tr></thead><tbody>`)
	for _, e := range elems {
		b.WriteString(fmt.Sprintf(`<tr><td class="level%d">%s</td><td>%s</td><td>%s</td><td>%s</td><td>%s</td></tr>`,
			e.Level, levelName[e.Level], html.EscapeString(e.Type), html.EscapeString(e.Name), html.EscapeString(e.Technology), html.EscapeString(e.Description)))
	}
	b.WriteString(`</tbody></table>`)

	b.WriteString(`<h2>关系</h2><table><thead><tr><th>源</th><th>目标</th><th>标签</th><th>说明</th></tr></thead><tbody>`)
	byID := map[int64]string{}
	for _, e := range elems {
		byID[e.Id] = e.Name
	}
	for _, rel := range rels {
		b.WriteString(fmt.Sprintf(`<tr><td>%s</td><td>%s</td><td>%s</td><td>%s</td></tr>`,
			html.EscapeString(byID[rel.SourceId]), html.EscapeString(byID[rel.TargetId]), html.EscapeString(rel.Label), html.EscapeString(rel.Description)))
	}
	b.WriteString(`</tbody></table>`)

	b.WriteString(`<h2>需求</h2><table><thead><tr><th>编号</th><th>标题</th><th>优先级</th><th>状态</th><th>描述</th></tr></thead><tbody>`)
	for _, r := range reqs {
		b.WriteString(fmt.Sprintf(`<tr><td>%s</td><td>%s</td><td>%s</td><td>%s</td><td>%s</td></tr>`,
			html.EscapeString(r.Code), html.EscapeString(r.Title), html.EscapeString(r.Priority), html.EscapeString(r.Status), html.EscapeString(r.Description)))
	}
	b.WriteString(`</tbody></table>`)

	b.WriteString(`<h2>界面原型</h2><table><thead><tr><th>名称</th><th>类型</th><th>资源</th></tr></thead><tbody>`)
	for _, pr := range protos {
		b.WriteString(fmt.Sprintf(`<tr><td>%s</td><td>%s</td><td>%s</td></tr>`,
			html.EscapeString(pr.Name), html.EscapeString(pr.Type), html.EscapeString(pr.Uri)))
	}
	b.WriteString(`</tbody></table>`)

	b.WriteString(`<h2>追溯矩阵</h2><table><thead><tr><th>元素</th><th>层级</th><th>关联需求</th><th>关联原型</th></tr></thead><tbody>`)
	for _, e := range elems {
		b.WriteString(fmt.Sprintf(`<tr><td>%s</td><td class="level%d">%s</td><td>%s</td><td>%s</td></tr>`,
			html.EscapeString(e.Name), e.Level, levelName[e.Level], join(reqLinked[e.Id]), joinProto(protoLinked[e.Id])))
	}
	b.WriteString(`</tbody></table>`)

	b.WriteString(`<footer>Generated by ArchLens</footer></div></body></html>`)
	return b.String()
}

func nameOr(s, def string) string {
	if s == "" {
		return def
	}
	return s
}

func keyword(t string) string {
	switch t {
	case model.TypePerson:
		return "person"
	case model.TypeSoftwareSystem:
		return "softwareSystem"
	case model.TypeContainer:
		return "container"
	case model.TypeComponent:
		return "component"
	default:
		return "element"
	}
}

func buildMarkdown(p *model.Project, elems []model.Element, rels []model.Relationship, reqs []model.Requirement, protos []model.Prototype, links []model.TraceLink) string {
	var b strings.Builder
	b.WriteString(fmt.Sprintf("# %s\n\n%s\n\n", p.Name, p.Description))

	b.WriteString("## 模型元素\n\n")
	b.WriteString("| 层级 | 类型 | 名称 | 技术 | 描述 |\n|---|---|---|---|---|\n")
	levelName := map[int]string{1: "Context", 2: "Container", 3: "Component"}
	for _, e := range elems {
		b.WriteString(fmt.Sprintf("| %s | %s | %s | %s | %s |\n", levelName[e.Level], e.Type, e.Name, e.Technology, e.Description))
	}

	b.WriteString("\n## 关系\n\n")
	b.WriteString("| 源 | 目标 | 标签 | 说明 |\n|---|---|---|---|\n")
	byID := map[int64]string{}
	for _, e := range elems {
		byID[e.Id] = e.Name
	}
	for _, rel := range rels {
		b.WriteString(fmt.Sprintf("| %s | %s | %s | %s |\n", byID[rel.SourceId], byID[rel.TargetId], rel.Label, rel.Description))
	}

	b.WriteString("\n## 需求\n\n")
	b.WriteString("| 编号 | 标题 | 优先级 | 状态 |\n|---|---|---|---|\n")
	for _, r := range reqs {
		b.WriteString(fmt.Sprintf("| %s | %s | %s | %s |\n", r.Code, r.Title, r.Priority, r.Status))
	}

	b.WriteString("\n## 原型\n\n")
	b.WriteString("| 名称 | 类型 | 资源 |\n|---|---|---|\n")
	for _, pr := range protos {
		b.WriteString(fmt.Sprintf("| %s | %s | %s |\n", pr.Name, pr.Type, pr.Uri))
	}

	return b.String()
}
