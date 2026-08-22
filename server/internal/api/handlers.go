package api

import (
	"github.com/gogf/gf/v2/net/ghttp"

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
	var e model.Element
	if err := r.Parse(&e); err != nil {
		fail(r, 51, err.Error())
		return
	}
	e.Id = id
	if err := store.UpdateElement(r.Context(), &e); err != nil {
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
	var rel model.Relationship
	if err := r.Parse(&rel); err != nil {
		fail(r, 51, err.Error())
		return
	}
	rel.Id = id
	if err := store.UpdateRelationship(r.Context(), &rel); err != nil {
		fail(r, 500, err.Error())
		return
	}
	ok(r, rel)
}

func deleteRelationship(r *ghttp.Request) {
	id := idOf(r, "id")
	if err := store.DeleteRelationship(r.Context(), id); err != nil {
		fail(r, 500, err.Error())
		return
	}
	ok(r, nil)
}
