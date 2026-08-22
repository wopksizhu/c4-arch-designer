package dsl

import (
	"context"
	"encoding/json"
	"fmt"
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
