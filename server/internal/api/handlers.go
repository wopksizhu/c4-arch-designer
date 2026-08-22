package api

import (
	"encoding/json"
	"strings"

	"github.com/gogf/gf/v2/frame/g"
	"github.com/gogf/gf/v2/net/ghttp"
	"github.com/gogf/gf/v2/util/gconv"

	"archlens/server/internal/model"
	"archlens/server/internal/store"
)

// ---- Project ----

func listProjects(r *ghttp.Request) {
	list, err := store.ListProjects(r.Context())
	if err != nil {
		fail(r, 500, err.Error())
		return
	}
	ok(r, list)
}

func createProject(r *ghttp.Request) {
	var p model.Project
	if err := r.Parse(&p); err != nil {
		fail(r, 51, err.Error())
		return
	}
	if p.Name == "" {
		fail(r, 51, "项目名称不能为空")
		return
	}
	id, err := store.CreateProject(r.Context(), &p)
	if err != nil {
		fail(r, 500, err.Error())
		return
	}
	got, _ := store.GetProject(r.Context(), id)
	ok(r, got)
}

func getProject(r *ghttp.Request) {
	id := idOf(r, "id")
	p, err := store.GetProject(r.Context(), id)
	if err != nil {
		fail(r, 500, err.Error())
		return
	}
	if p == nil {
		fail(r, 404, "项目不存在")
		return
	}
	ok(r, p)
}

func updateProject(r *ghttp.Request) {
	id := idOf(r, "id")
	var p model.Project
	if err := r.Parse(&p); err != nil {
		fail(r, 51, err.Error())
		return
	}
	p.Id = id
	if err := store.UpdateProject(r.Context(), &p); err != nil {
		fail(r, 500, err.Error())
		return
	}
	got, _ := store.GetProject(r.Context(), id)
	ok(r, got)
}

func deleteProject(r *ghttp.Request) {
	id := idOf(r, "id")
	if err := store.DeleteProject(r.Context(), id); err != nil {
		fail(r, 500, err.Error())
		return
	}
	ok(r, nil)
}

// ---- Element ----

func listElements(r *ghttp.Request) {
	pid := idOf(r, "id")
	list, err := store.ListElements(r.Context(), pid)
	if err != nil {
		fail(r, 500, err.Error())
		return
	}
	ok(r, list)
}

func createElement(r *ghttp.Request) {
	pid := idOf(r, "id")
	var e model.Element
	if err := r.Parse(&e); err != nil {
		fail(r, 51, err.Error())
		return
	}
	if err := store.RequireProject(r.Context(), pid); err != nil {
		fail(r, 404, err.Error())
		return
	}
	e.ProjectId = pid
	if e.Level == 0 {
		e.Level = model.LevelContext
	}
	if e.Type == "" {
		e.Type = model.TypeComponent
	}
	id, err := store.CreateElement(r.Context(), &e)
	if err != nil {
		fail(r, 500, err.Error())
		return
	}
	got, _ := store.GetElement(r.Context(), id)
	ok(r, got)
}

func updateElement(r *ghttp.Request) {
	id := idOf(r, "id")
	var body map[string]interface{}
	if err := json.Unmarshal(r.GetBody(), &body); err != nil {
		fail(r, 51, err.Error())
		return
	}
	sets := []string{}
	args := []interface{}{}
	add := func(col string, val interface{}) {
		sets = append(sets, col+"=?")
		args = append(args, val)
	}
	if v, ok := body["level"]; ok {
		add("level", gconv.Int(v))
	}
	if v, ok := body["type"]; ok {
		add("type", gconv.String(v))
	}
	if v, ok := body["name"]; ok {
		add("name", gconv.String(v))
	}
	if v, ok := body["description"]; ok {
		add("description", gconv.String(v))
	}
	if v, ok := body["technology"]; ok {
		add("technology", gconv.String(v))
	}
	if v, ok := body["tags"]; ok {
		add("tags", gconv.String(v))
	}
	if v, ok := body["parentId"]; ok {
		if v == nil {
			add("parent_id", nil)
		} else {
			add("parent_id", gconv.Int64(v))
		}
	}
	if v, ok := body["posX"]; ok {
		add("pos_x", gconv.Float64(v))
	}
	if v, ok := body["posY"]; ok {
		add("pos_y", gconv.Float64(v))
	}
	if len(sets) == 0 {
		got, _ := store.GetElement(r.Context(), id)
		ok(r, got)
		return
	}
	sets = append(sets, "updated_at=CURRENT_TIMESTAMP")
	sql := "UPDATE elements SET " + strings.Join(sets, ", ") + " WHERE id=?"
	args = append(args, id)
	if _, err := g.DB().Exec(r.Context(), sql, args...); err != nil {
		fail(r, 500, err.Error())
		return
	}
	got, _ := store.GetElement(r.Context(), id)
	ok(r, got)
}

func deleteElement(r *ghttp.Request) {
	id := idOf(r, "id")
	if err := store.DeleteElement(r.Context(), id); err != nil {
		fail(r, 500, err.Error())
		return
	}
	ok(r, nil)
}

// ---- Relationship ----

func listRelationships(r *ghttp.Request) {
	pid := idOf(r, "id")
	list, err := store.ListRelationships(r.Context(), pid)
	if err != nil {
		fail(r, 500, err.Error())
		return
	}
	ok(r, list)
}

func createRelationship(r *ghttp.Request) {
	pid := idOf(r, "id")
	var rel model.Relationship
	if err := r.Parse(&rel); err != nil {
		fail(r, 51, err.Error())
		return
	}
	if err := store.RequireProject(r.Context(), pid); err != nil {
		fail(r, 404, err.Error())
		return
	}
	rel.ProjectId = pid
	id, err := store.CreateRelationship(r.Context(), &rel)
	if err != nil {
		fail(r, 500, err.Error())
		return
	}
	got, _ := store.GetRelationship(r.Context(), id)
	ok(r, got)
}

func updateRelationship(r *ghttp.Request) {
	id := idOf(r, "id")
	var body map[string]interface{}
	if err := json.Unmarshal(r.GetBody(), &body); err != nil {
		fail(r, 51, err.Error())
		return
	}
	sets := []string{}
	args := []interface{}{}
	add := func(col string, val interface{}) {
		sets = append(sets, col+"=?")
		args = append(args, val)
	}
	if v, ok := body["sourceId"]; ok {
		add("source_id", gconv.Int64(v))
	}
	if v, ok := body["targetId"]; ok {
		add("target_id", gconv.Int64(v))
	}
	if v, ok := body["label"]; ok {
		add("label", gconv.String(v))
	}
	if v, ok := body["interaction"]; ok {
		add("interaction", gconv.String(v))
	}
	if v, ok := body["protocol"]; ok {
		add("protocol", gconv.String(v))
	}
	if v, ok := body["description"]; ok {
		add("description", gconv.String(v))
	}
	if v, ok := body["technology"]; ok {
		add("technology", gconv.String(v))
	}
	if v, ok := body["level"]; ok {
		add("level", gconv.Int(v))
	}
	if len(sets) == 0 {
		got, _ := store.GetRelationship(r.Context(), id)
		ok(r, got)
		return
	}
	sets = append(sets, "updated_at=CURRENT_TIMESTAMP")
	sql := "UPDATE relationships SET " + strings.Join(sets, ", ") + " WHERE id=?"
	args = append(args, id)
	if _, err := g.DB().Exec(r.Context(), sql, args...); err != nil {
		fail(r, 500, err.Error())
		return
	}
	got, _ := store.GetRelationship(r.Context(), id)
	ok(r, got)
}

func deleteRelationship(r *ghttp.Request) {
	id := idOf(r, "id")
	if err := store.DeleteRelationship(r.Context(), id); err != nil {
		fail(r, 500, err.Error())
		return
	}
	ok(r, nil)
}
