package dsl

import (
	"context"
	"regexp"
	"strings"

	"archlens/server/internal/model"
	"archlens/server/internal/store"
)

var (
	reElem = regexp.MustCompile(`\b(person|softwareSystem|container|component)\s+"([^"]+)"\s*(\{)?`)
	reRel  = regexp.MustCompile(`"([^"]+)"\s*->\s*"([^"]+)"\s*"([^"]*)"\s*(?:"([^"]*)")?`)
)

type parsedElem struct {
	Type   string
	Name   string
	Parent string
}
type parsedRel struct {
	Src, Dst, Label, Protocol string
}

// ImportDSL 解析类 Structurizr DSL，把元素与关系写入项目。
// 支持 person/softwareSystem/container/component 声明（含 { 嵌套）与 "A" -> "B" "label" 关系。
func ImportDSL(ctx context.Context, projectId int64, content string) (int, int, error) {
	// 把花括号独立成行，兼容单行/多行两种写法
	content = strings.ReplaceAll(content, "{", "\n{\n")
	content = strings.ReplaceAll(content, "}", "\n}\n")

	var elems []parsedElem
	var rels []parsedRel

	stack := []string{}  // 块所有者（元素名，随 { 推入、} 弹出）
	lastElem := ""       // 最近声明的元素名
	expectOpen := false  // 下一个 { 是否为 lastElem 开启子块
	for _, raw := range strings.Split(content, "\n") {
		line := strings.TrimSpace(raw)
		if line == "" || strings.HasPrefix(line, "//") || strings.HasPrefix(line, "#") {
			continue
		}
		if line == "{" {
			if expectOpen && lastElem != "" {
				stack = append(stack, lastElem)
			}
			expectOpen = false
			continue
		}
		if line == "}" {
			if len(stack) > 0 {
				stack = stack[:len(stack)-1]
			}
			expectOpen = false
			continue
		}
		if strings.HasPrefix(line, "workspace") || strings.HasPrefix(line, "model") || strings.HasPrefix(line, "views") {
			continue
		}
		if ms := reElem.FindAllStringSubmatch(line, -1); len(ms) > 0 {
			for _, m := range ms {
				typ, name := m[1], m[2]
				parent := ""
				if len(stack) > 0 {
					parent = stack[len(stack)-1]
				}
				elems = append(elems, parsedElem{Type: typ, Name: name, Parent: parent})
				lastElem = name
				expectOpen = typ == "softwareSystem" || typ == "container"
			}
			continue
		}
		if m := reRel.FindStringSubmatch(line); m != nil {
			rels = append(rels, parsedRel{Src: m[1], Dst: m[2], Label: m[3], Protocol: m[4]})
		}
	}

	ids := map[string]int64{}
	created := 0
	for _, e := range elems {
		name := strings.TrimSpace(e.Name)
		if name == "" {
			continue
		}
		if _, ok := ids[name]; ok {
			continue
		}
		var pid *int64
		if e.Parent != "" {
			if v, ok := ids[e.Parent]; ok {
				pid = &v
			}
		}
		id, err := store.CreateElement(ctx, &model.Element{
			ProjectId: projectId,
			Level:     importLevel(e.Type),
			Type:      importType(e.Type),
			Name:      name,
			ParentId:  pid,
		})
		if err != nil {
			return created, 0, err
		}
		ids[name] = id
		created++
	}

	relCreated := 0
	for _, r := range rels {
		s, sok := ids[strings.TrimSpace(r.Src)]
		t, tok := ids[strings.TrimSpace(r.Dst)]
		if sok && tok && s != t {
			if _, err := store.CreateRelationship(ctx, &model.Relationship{
				ProjectId: projectId, SourceId: s, TargetId: t,
				Label: orDef(r.Label, "uses"), Interaction: strings.TrimSpace(r.Label), Protocol: strings.TrimSpace(r.Protocol),
			}); err == nil {
				relCreated++
			}
		}
	}

	return created, relCreated, nil
}

func importLevel(t string) int {
	switch importType(t) {
	case model.TypePerson, model.TypeSoftwareSystem:
		return model.LevelContext
	case model.TypeContainer:
		return model.LevelContainer
	default:
		return model.LevelComponent
	}
}

func importType(t string) string {
	switch strings.ToLower(t) {
	case "person":
		return model.TypePerson
	case "softwaresystem", "system":
		return model.TypeSoftwareSystem
	case "container":
		return model.TypeContainer
	default:
		return model.TypeComponent
	}
}

func orDef(s, def string) string {
	if strings.TrimSpace(s) == "" {
		return def
	}
	return s
}
