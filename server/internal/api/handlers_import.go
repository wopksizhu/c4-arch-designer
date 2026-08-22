package api

import (
	"encoding/csv"
	"strings"

	"github.com/gogf/gf/v2/net/ghttp"

	"archlens/server/internal/dsl"
	"archlens/server/internal/model"
	"archlens/server/internal/rules"
	"archlens/server/internal/store"
)

// importDSL 导入 Structurizr DSL，创建元素与关系。
func importDSL(r *ghttp.Request) {
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
	elems, rels, err := dsl.ImportDSL(r.Context(), pid, content)
	if err != nil {
		fail(r, 500, err.Error())
		return
	}
	ok(r, ghttpData{"elements": elems, "relationships": rels})
}

// importCSVRequirements 导入 CSV 需求。表头：code,title,description,priority,status,tags。
func importCSVRequirements(r *ghttp.Request) {
	pid := idOf(r, "id")
	content := r.Get("content").String()
	if err := store.RequireProject(r.Context(), pid); err != nil {
		fail(r, 404, err.Error())
		return
	}

	reader := csv.NewReader(strings.NewReader(content))
	reader.FieldsPerRecord = -1
	records, err := reader.ReadAll()
	if err != nil {
		fail(r, 51, "CSV 解析失败: "+err.Error())
		return
	}
	if len(records) == 0 {
		fail(r, 51, "CSV 为空")
		return
	}

	// 表头列映射（大小写不敏感）
	col := map[string]int{}
	for i, h := range records[0] {
		col[strings.ToLower(strings.TrimSpace(h))] = i
	}
	get := func(rec []string, key string) string {
		i, ok := col[key]
		if !ok || i >= len(rec) {
			// 无表头时按 fixed 顺序兼容
			switch key {
			case "code":
				if len(col) == 0 && len(rec) > 0 {
					return rec[0]
				}
			case "title":
				if len(col) == 0 && len(rec) > 1 {
					return rec[1]
				}
			case "description":
				if len(col) == 0 && len(rec) > 2 {
					return rec[2]
				}
			case "priority":
				if len(col) == 0 && len(rec) > 3 {
					return rec[3]
				}
			}
			return ""
		}
		return strings.TrimSpace(rec[i])
	}

	count := 0
	for _, rec := range records[1:] {
		title := get(rec, "title")
		if title == "" {
			continue
		}
		req := &model.Requirement{
			ProjectId: pid, Code: get(rec, "code"), Title: title,
			Description: get(rec, "description"),
			Priority:    defPriority(get(rec, "priority")),
			Status:      defStatus(get(rec, "status")),
			Source:      "csv", Tags: get(rec, "tags"),
		}
		if _, err := store.CreateRequirement(r.Context(), req); err == nil {
			count++
		}
	}
	ok(r, ghttpData{"created": count})
}

// rulesValidate 静态校验规则（无需 AI）。
func rulesValidate(r *ghttp.Request) {
	pid := idOf(r, "id")
	issues, err := rules.Rules(r.Context(), pid)
	if err != nil {
		fail(r, 500, err.Error())
		return
	}
	ok(r, issues)
}

func defPriority(s string) string {
	if s == "" {
		return "medium"
	}
	return s
}
func defStatus(s string) string {
	if s == "" {
		return "draft"
	}
	return s
}
