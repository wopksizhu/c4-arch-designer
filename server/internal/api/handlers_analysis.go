package api

import (
	"github.com/gogf/gf/v2/net/ghttp"
	"github.com/gogf/gf/v2/util/gconv"

	"archlens/server/internal/model"
	"archlens/server/internal/store"
)

// traceMatrix 聚合展示：每个 Element 关联的需求与原型。
func traceMatrix(r *ghttp.Request) {
	pid := idOf(r, "id")
	elements, err := store.ListElements(r.Context(), pid)
	if err != nil {
		fail(r, 500, err.Error())
		return
	}
	links, _ := store.ListTraceLinks(r.Context(), pid)
	reqs, _ := store.ListRequirements(r.Context(), pid)
	protos, _ := store.ListPrototypes(r.Context(), pid)

	reqName := nameMap(reqs)
	protoName := protoNameMap(protos)

	rows := make([]model.TraceMatrixRow, 0, len(elements))
	for _, e := range elements {
		reqIds := []int64{}
		protoIds := []int64{}
		for _, l := range links {
			if l.FromType == "requirement" && l.ToType == "element" && l.ToId == e.Id {
				reqIds = append(reqIds, l.FromId)
			}
			if l.FromType == "element" && l.FromId == e.Id && l.ToType == "requirement" {
				reqIds = append(reqIds, l.ToId)
			}
			if l.FromType == "element" && l.FromId == e.Id && l.ToType == "prototype" {
				protoIds = append(protoIds, l.ToId)
			}
			if l.FromType == "prototype" && l.ToType == "element" && l.ToId == e.Id {
				protoIds = append(protoIds, l.FromId)
			}
		}
		reqIds = dedup(reqIds)
		protoIds = dedup(protoIds)
		rows = append(rows, model.TraceMatrixRow{
			ElementId:       e.Id,
			ElementName:     e.Name,
			ElementType:     e.Type,
			Level:           e.Level,
			RequirementIds:  reqIds,
			RequirementText: joinNames(reqIds, reqName),
			PrototypeIds:    protoIds,
			PrototypeText:   joinNames(protoIds, protoName),
		})
	}
	ok(r, rows)
}

// impactAnalysis 影响分析：从给定节点沿追溯链与元素关系扩散受影响对象。
// 入参：type=requirement|element|prototype, oid=<对象id>。
func impactAnalysis(r *ghttp.Request) {
	pid := idOf(r, "id")
	typ := r.Get("type").String()
	oid := r.Get("oid").Int64()
	if typ == "" || oid == 0 {
		fail(r, 400, "请传入 type 与 oid 参数")
		return
	}

	links, _ := store.ListTraceLinks(r.Context(), pid)
	rels, _ := store.ListRelationships(r.Context(), pid)
	elements, _ := store.ListElements(r.Context(), pid)
	reqs, _ := store.ListRequirements(r.Context(), pid)
	protos, _ := store.ListPrototypes(r.Context(), pid)

	root := model.ImpactNode{Type: typ, Id: oid, Name: impactName(typ, oid, elements, reqs, protos)}
	visited := map[string]bool{impactKey(typ, oid): true}
	affected := []model.ImpactNode{}
	chains := [][]model.ImpactNode{}

	queue := []model.ImpactNode{root}
	for len(queue) > 0 {
		cur := queue[0]
		queue = queue[1:]
		for _, nb := range neighborsOf(cur, links, rels, elements, reqs, protos) {
			if visited[impactKey(nb.Type, nb.Id)] {
				continue
			}
			visited[impactKey(nb.Type, nb.Id)] = true
			affected = append(affected, nb)
			chains = append(chains, []model.ImpactNode{cur, nb})
			queue = append(queue, nb)
		}
	}

	ok(r, model.ImpactResult{Root: root, Affected: affected, Trips: chains})
}

// ---- 辅助 ----

func dedup(ids []int64) []int64 {
	seen := map[int64]bool{}
	out := []int64{}
	for _, id := range ids {
		if !seen[id] {
			seen[id] = true
			out = append(out, id)
		}
	}
	return out
}

func nameMap(items []model.Requirement) map[int64]string {
	m := map[int64]string{}
	for _, x := range items {
		n := x.Code
		if n != "" {
			n += " "
		}
		m[x.Id] = n + x.Title
	}
	return m
}

func protoNameMap(items []model.Prototype) map[int64]string {
	m := map[int64]string{}
	for _, x := range items {
		m[x.Id] = x.Name
	}
	return m
}

func joinNames(ids []int64, names map[int64]string) string {
	out := ""
	for i, id := range ids {
		if i > 0 {
			out += ", "
		}
		if n, ok := names[id]; ok {
			out += n
		}
	}
	return out
}

func impactKey(t string, id int64) string {
	return t + ":" + gconv.String(id)
}

func impactName(t string, id int64, elements []model.Element, reqs []model.Requirement, protos []model.Prototype) string {
	switch t {
	case "element":
		for _, e := range elements {
			if e.Id == id {
				return e.Name
			}
		}
	case "requirement":
		for _, x := range reqs {
			if x.Id == id {
				return x.Title
			}
		}
	case "prototype":
		for _, x := range protos {
			if x.Id == id {
				return x.Name
			}
		}
	}
	return ""
}

// neighborsOf 返回与当前节点直接相连的相邻节点（追溯链 + 元素关系）。
func neighborsOf(cur model.ImpactNode, links []model.TraceLink, rels []model.Relationship, elements []model.Element, reqs []model.Requirement, protos []model.Prototype) []model.ImpactNode {
	add := func(m map[string]model.ImpactNode, nb model.ImpactNode) {
		if nb.Id != 0 {
			m[impactKey(nb.Type, nb.Id)] = nb
		}
	}
	out := map[string]model.ImpactNode{}

	// 追溯链双向扩散
	for _, l := range links {
		switch {
		case l.FromType == cur.Type && l.FromId == cur.Id:
			add(out, model.ImpactNode{Type: l.ToType, Id: l.ToId})
		case l.ToType == cur.Type && l.ToId == cur.Id:
			add(out, model.ImpactNode{Type: l.FromType, Id: l.FromId})
		}
	}
	// 元素关系：从当前元素出发/到达的元素
	if cur.Type == "element" {
		for _, rel := range rels {
			if rel.SourceId == cur.Id {
				add(out, model.ImpactNode{Type: "element", Id: rel.TargetId})
			}
			if rel.TargetId == cur.Id {
				add(out, model.ImpactNode{Type: "element", Id: rel.SourceId})
			}
		}
	}

	result := []model.ImpactNode{}
	for _, nb := range out {
		nb.Name = impactName(nb.Type, nb.Id, elements, reqs, protos)
		result = append(result, nb)
	}
	return result
}
