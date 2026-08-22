package rules

import (
	"context"
	"fmt"
	"strings"

	"archlens/server/internal/model"
	"archlens/server/internal/store"
)

// Issue 校验规则发现的问题。
type Issue struct {
	Type    string `json:"type"`
	Message string `json:"message"`
}

// Rules 执行本地静态校验规则（无需 AI）。
func Rules(ctx context.Context, projectId int64) ([]Issue, error) {
	elems, _ := store.ListElements(ctx, projectId)
	rels, _ := store.ListRelationships(ctx, projectId)
	links, _ := store.ListTraceLinks(ctx, projectId)

	var issues []Issue
	add := func(t, m string) { issues = append(issues, Issue{Type: t, Message: m}) }

	// 1. 命名：名称非空
	for _, e := range elems {
		if strings.TrimSpace(e.Name) == "" {
			add("naming", fmt.Sprintf("元素 #%d 名称为空", e.Id))
		}
	}

	// 2. 层级：level 3 组件应归属于某容器
	hasContainer := false
	for _, e := range elems {
		if e.Type == model.TypeContainer {
			hasContainer = true
		}
	}
	if hasContainer {
		for _, e := range elems {
			if e.Level == 3 && e.ParentId == nil {
				add("hierarchy", fmt.Sprintf("组件 %q 未声明所属容器", e.Name))
			}
		}
	}

	// 3. 追溯缺口：容器未关联需求
	reqLinked := map[int64]bool{}
	for _, l := range links {
		if l.ToType == "element" && l.FromType == "requirement" {
			reqLinked[l.ToId] = true
		}
		if l.FromType == "element" && l.ToType == "requirement" {
			reqLinked[l.FromId] = true
		}
	}
	for _, e := range elems {
		if e.Level == 2 && !reqLinked[e.Id] {
			add("trace", fmt.Sprintf("容器 %q 未关联任何需求", e.Name))
		}
	}

	// 4. 原型缺口：容器未关联界面原型
	protoLinked := map[int64]bool{}
	for _, l := range links {
		if l.FromType == "element" && l.ToType == "prototype" {
			protoLinked[l.FromId] = true
		}
		if l.FromType == "prototype" && l.ToType == "element" {
			protoLinked[l.ToId] = true
		}
	}
	for _, e := range elems {
		if e.Level == 2 && !protoLinked[e.Id] {
			add("prototype", fmt.Sprintf("容器 %q 未关联界面原型", e.Name))
		}
	}

	// 5. 孤立元素（除 person 外无任何关系）
	for _, e := range elems {
		if e.Type == model.TypePerson {
			continue
		}
		connected := false
		for _, r := range rels {
			if r.SourceId == e.Id || r.TargetId == e.Id {
				connected = true
				break
			}
		}
		if !connected {
			add("orphan", fmt.Sprintf("元素 %q 孤立，无任何关系", e.Name))
		}
	}

	// 6. 数据完整性：关系指向不存在的元素
	elemIDs := map[int64]bool{}
	for _, e := range elems {
		elemIDs[e.Id] = true
	}
	for _, r := range rels {
		if !elemIDs[r.SourceId] || !elemIDs[r.TargetId] {
			add("integrity", fmt.Sprintf("关系 #%d 指向不存在的元素", r.Id))
		}
	}

	if len(issues) == 0 {
		issues = append(issues, Issue{Type: "ok", Message: "未发现问题"})
	}
	return issues, nil
}
