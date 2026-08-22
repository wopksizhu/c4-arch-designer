package api

import (
	"path/filepath"

	"github.com/gogf/gf/v2/net/ghttp"

	"archlens/server/internal/model"
	"archlens/server/internal/store"
)

// ---- Requirement ----

func listRequirements(r *ghttp.Request) {
	pid := idOf(r, "id")
	list, err := store.ListRequirements(r.Context(), pid)
	if err != nil {
		fail(r, 500, err.Error())
		return
	}
	ok(r, list)
}

func createRequirement(r *ghttp.Request) {
	pid := idOf(r, "id")
	var req model.Requirement
	if err := r.Parse(&req); err != nil {
		fail(r, 51, err.Error())
		return
	}
	if err := store.RequireProject(r.Context(), pid); err != nil {
		fail(r, 404, err.Error())
		return
	}
	req.ProjectId = pid
	if req.Priority == "" {
		req.Priority = "medium"
	}
	if req.Status == "" {
		req.Status = "draft"
	}
	if req.Source == "" {
		req.Source = "manual"
	}
	id, err := store.CreateRequirement(r.Context(), &req)
	if err != nil {
		fail(r, 500, err.Error())
		return
	}
	got, _ := store.GetRequirement(r.Context(), id)
	ok(r, got)
}

func updateRequirement(r *ghttp.Request) {
	id := idOf(r, "id")
	var req model.Requirement
	if err := r.Parse(&req); err != nil {
		fail(r, 51, err.Error())
		return
	}
	req.Id = id
	if err := store.UpdateRequirement(r.Context(), &req); err != nil {
		fail(r, 500, err.Error())
		return
	}
	ok(r, req)
}

func deleteRequirement(r *ghttp.Request) {
	id := idOf(r, "id")
	if err := store.DeleteRequirement(r.Context(), id); err != nil {
		fail(r, 500, err.Error())
		return
	}
	ok(r, nil)
}

// ---- Prototype ----

func listPrototypes(r *ghttp.Request) {
	pid := idOf(r, "id")
	list, err := store.ListPrototypes(r.Context(), pid)
	if err != nil {
		fail(r, 500, err.Error())
		return
	}
	ok(r, list)
}

func createPrototype(r *ghttp.Request) {
	pid := idOf(r, "id")
	if err := store.RequireProject(r.Context(), pid); err != nil {
		fail(r, 404, err.Error())
		return
	}

	name := r.GetForm("name").String()
	ptype := r.GetForm("type").String()
	notes := r.GetForm("notes").String()
	uri := r.GetForm("uri").String()
	if name == "" {
		name = "未命名原型"
	}
	if ptype == "" {
		ptype = "url"
	}

	// 处理图片上传
	if ptype == "image" {
		file := r.GetUploadFile("file")
		if file == nil {
			fail(r, 51, "请选择原型图片")
			return
		}
		dir := filepath.Join("data", "uploads")
		saved, err := file.Save(dir, true)
		if err != nil {
			fail(r, 500, "保存图片失败: "+err.Error())
			return
		}
		uri = "/uploads/" + saved
	}

	p := &model.Prototype{ProjectId: pid, Name: name, Type: ptype, Uri: uri, Notes: notes}
	id, err := store.CreatePrototype(r.Context(), p)
	if err != nil {
		fail(r, 500, err.Error())
		return
	}
	got, _ := store.GetPrototype(r.Context(), id)
	ok(r, got)
}

func updatePrototype(r *ghttp.Request) {
	id := idOf(r, "id")
	var p model.Prototype
	if err := r.Parse(&p); err != nil {
		fail(r, 51, err.Error())
		return
	}
	p.Id = id
	if err := store.UpdatePrototype(r.Context(), &p); err != nil {
		fail(r, 500, err.Error())
		return
	}
	ok(r, p)
}

func deletePrototype(r *ghttp.Request) {
	id := idOf(r, "id")
	if err := store.DeletePrototype(r.Context(), id); err != nil {
		fail(r, 500, err.Error())
		return
	}
	ok(r, nil)
}

// ---- TraceLink ----

func listTraceLinks(r *ghttp.Request) {
	pid := idOf(r, "id")
	list, err := store.ListTraceLinks(r.Context(), pid)
	if err != nil {
		fail(r, 500, err.Error())
		return
	}
	ok(r, list)
}

func createTraceLink(r *ghttp.Request) {
	pid := idOf(r, "id")
	var t model.TraceLink
	if err := r.Parse(&t); err != nil {
		fail(r, 51, err.Error())
		return
	}
	if err := store.RequireProject(r.Context(), pid); err != nil {
		fail(r, 404, err.Error())
		return
	}
	t.ProjectId = pid
	if t.LinkType == "" {
		t.LinkType = "satisfies"
	}
	// 防止重复关联（同一条需求/元素不能重复挂到同一个目标）
	if store.TraceLinkExists(r.Context(), pid, t.FromType, t.FromId, t.ToType, t.ToId) {
		fail(r, 400, "该关联已存在，避免重复")
		return
	}
	id, err := store.CreateTraceLink(r.Context(), &t)
	if err != nil {
		fail(r, 500, err.Error())
		return
	}
	ok(r, id)
}

func deleteTraceLink(r *ghttp.Request) {
	id := idOf(r, "id")
	if err := store.DeleteTraceLink(r.Context(), id); err != nil {
		fail(r, 500, err.Error())
		return
	}
	ok(r, nil)
}
