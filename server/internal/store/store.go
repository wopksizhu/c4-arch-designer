package store

import (
	"context"
	"fmt"

	"github.com/gogf/gf/v2/frame/g"

	"archlens/server/internal/model"
)

// nn 确保空切片返回 [] 而非 null，避免前端崩溃。
func nn[T any](s []T) []T {
	if s == nil {
		return []T{}
	}
	return s
}

// ---- Project ----

func ListProjects(ctx context.Context) ([]model.Project, error) {
	res, err := g.DB().GetAll(ctx, "SELECT * FROM projects ORDER BY updated_at DESC")
	if err != nil {
		return nil, err
	}
	var out []model.Project
	if err := res.Structs(&out); err != nil {
		return nil, err
	}
	return nn(out), nil
}

func GetProject(ctx context.Context, id int64) (*model.Project, error) {
	rec, err := g.DB().GetOne(ctx, "SELECT * FROM projects WHERE id=?", id)
	if err != nil {
		return nil, err
	}
	if rec.IsEmpty() {
		return nil, nil
	}
	var p model.Project
	if err := rec.Struct(&p); err != nil {
		return nil, err
	}
	return &p, nil
}

func CreateProject(ctx context.Context, p *model.Project) (int64, error) {
	res, err := g.DB().Exec(ctx, "INSERT INTO projects(name, description) VALUES(?, ?)", p.Name, p.Description)
	if err != nil {
		return 0, err
	}
	id, err := res.LastInsertId()
	if err != nil {
		return 0, err
	}
	return id, nil
}

func UpdateProject(ctx context.Context, p *model.Project) error {
	_, err := g.DB().Exec(ctx, "UPDATE projects SET name=?, description=?, updated_at=CURRENT_TIMESTAMP WHERE id=?",
		p.Name, p.Description, p.Id)
	return err
}

func DeleteProject(ctx context.Context, id int64) error {
	_, err := g.DB().Exec(ctx, "DELETE FROM projects WHERE id=?", id)
	if err != nil {
		return err
	}
	// 级联清理子表
	for _, sql := range []string{
		"DELETE FROM elements WHERE project_id=?",
		"DELETE FROM relationships WHERE project_id=?",
		"DELETE FROM requirements WHERE project_id=?",
		"DELETE FROM prototypes WHERE project_id=?",
		"DELETE FROM trace_links WHERE project_id=?",
		"DELETE FROM ai_suggestions WHERE project_id=?",
	} {
		if _, err := g.DB().Exec(ctx, sql, id); err != nil {
			return err
		}
	}
	return nil
}

// ---- Element ----

func ListElements(ctx context.Context, projectId int64) ([]model.Element, error) {
	res, err := g.DB().GetAll(ctx, "SELECT * FROM elements WHERE project_id=? ORDER BY id", projectId)
	if err != nil {
		return nil, err
	}
	var out []model.Element
	if err := res.Structs(&out); err != nil {
		return nil, err
	}
	return nn(out), nil
}

func GetElement(ctx context.Context, id int64) (*model.Element, error) {
	rec, err := g.DB().GetOne(ctx, "SELECT * FROM elements WHERE id=?", id)
	if err != nil {
		return nil, err
	}
	if rec.IsEmpty() {
		return nil, nil
	}
	var e model.Element
	if err := rec.Struct(&e); err != nil {
		return nil, err
	}
	return &e, nil
}

func CreateElement(ctx context.Context, e *model.Element) (int64, error) {
	res, err := g.DB().Exec(ctx, `INSERT INTO elements(project_id, level, type, name, description, technology, tags, parent_id, pos_x, pos_y)
		VALUES(?,?,?,?,?,?,?,?,?,?)`,
		e.ProjectId, e.Level, e.Type, e.Name, e.Description, e.Technology, e.Tags, e.ParentId, e.PosX, e.PosY)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

func UpdateElement(ctx context.Context, e *model.Element) error {
	_, err := g.DB().Exec(ctx, `UPDATE elements SET level=?, type=?, name=?, description=?, technology=?, tags=?, parent_id=?, pos_x=?, pos_y=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`,
		e.Level, e.Type, e.Name, e.Description, e.Technology, e.Tags, e.ParentId, e.PosX, e.PosY, e.Id)
	return err
}

func DeleteElement(ctx context.Context, id int64) error {
	_, err := g.DB().Exec(ctx, "DELETE FROM elements WHERE id=?", id)
	if err != nil {
		return err
	}
	_, err = g.DB().Exec(ctx, "DELETE FROM relationships WHERE source_id=? OR target_id=?", id, id)
	if err != nil {
		return err
	}
	_, err = g.DB().Exec(ctx, "DELETE FROM trace_links WHERE (from_type='element' AND from_id=?) OR (to_type='element' AND to_id=?)", id, id)
	return err
}

// ---- Relationship ----

func ListRelationships(ctx context.Context, projectId int64) ([]model.Relationship, error) {
	res, err := g.DB().GetAll(ctx, "SELECT * FROM relationships WHERE project_id=? ORDER BY id", projectId)
	if err != nil {
		return nil, err
	}
	var out []model.Relationship
	if err := res.Structs(&out); err != nil {
		return nil, err
	}
	return nn(out), nil
}

func GetRelationship(ctx context.Context, id int64) (*model.Relationship, error) {
	rec, err := g.DB().GetOne(ctx, "SELECT * FROM relationships WHERE id=?", id)
	if err != nil {
		return nil, err
	}
	if rec.IsEmpty() {
		return nil, nil
	}
	var r model.Relationship
	if err := rec.Struct(&r); err != nil {
		return nil, err
	}
	return &r, nil
}

func CreateRelationship(ctx context.Context, r *model.Relationship) (int64, error) {
	res, err := g.DB().Exec(ctx, `INSERT INTO relationships(project_id, source_id, target_id, label, description, technology, level) VALUES(?,?,?,?,?,?,?)`,
		r.ProjectId, r.SourceId, r.TargetId, r.Label, r.Description, r.Technology, r.Level)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

func UpdateRelationship(ctx context.Context, r *model.Relationship) error {
	_, err := g.DB().Exec(ctx, `UPDATE relationships SET source_id=?, target_id=?, label=?, description=?, technology=?, level=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`,
		r.SourceId, r.TargetId, r.Label, r.Description, r.Technology, r.Level, r.Id)
	return err
}

func DeleteRelationship(ctx context.Context, id int64) error {
	_, err := g.DB().Exec(ctx, "DELETE FROM relationships WHERE id=?", id)
	return err
}

// ---- Requirement ----

func ListRequirements(ctx context.Context, projectId int64) ([]model.Requirement, error) {
	res, err := g.DB().GetAll(ctx, "SELECT * FROM requirements WHERE project_id=? ORDER BY id", projectId)
	if err != nil {
		return nil, err
	}
	var out []model.Requirement
	if err := res.Structs(&out); err != nil {
		return nil, err
	}
	return nn(out), nil
}

func GetRequirement(ctx context.Context, id int64) (*model.Requirement, error) {
	rec, err := g.DB().GetOne(ctx, "SELECT * FROM requirements WHERE id=?", id)
	if err != nil {
		return nil, err
	}
	if rec.IsEmpty() {
		return nil, nil
	}
	var p model.Requirement
	if err := rec.Struct(&p); err != nil {
		return nil, err
	}
	return &p, nil
}

func CreateRequirement(ctx context.Context, r *model.Requirement) (int64, error) {
	res, err := g.DB().Exec(ctx, `INSERT INTO requirements(project_id, code, title, description, priority, status, source, tags) VALUES(?,?,?,?,?,?,?,?)`,
		r.ProjectId, r.Code, r.Title, r.Description, r.Priority, r.Status, r.Source, r.Tags)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

func UpdateRequirement(ctx context.Context, r *model.Requirement) error {
	_, err := g.DB().Exec(ctx, `UPDATE requirements SET code=?, title=?, description=?, priority=?, status=?, source=?, tags=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`,
		r.Code, r.Title, r.Description, r.Priority, r.Status, r.Source, r.Tags, r.Id)
	return err
}

func DeleteRequirement(ctx context.Context, id int64) error {
	_, err := g.DB().Exec(ctx, "DELETE FROM requirements WHERE id=?", id)
	if err != nil {
		return err
	}
	_, err = g.DB().Exec(ctx, "DELETE FROM trace_links WHERE (from_type='requirement' AND from_id=?) OR (to_type='requirement' AND to_id=?)", id, id)
	return err
}

// ---- Prototype ----

func ListPrototypes(ctx context.Context, projectId int64) ([]model.Prototype, error) {
	res, err := g.DB().GetAll(ctx, "SELECT * FROM prototypes WHERE project_id=? ORDER BY id", projectId)
	if err != nil {
		return nil, err
	}
	var out []model.Prototype
	if err := res.Structs(&out); err != nil {
		return nil, err
	}
	return nn(out), nil
}

func GetPrototype(ctx context.Context, id int64) (*model.Prototype, error) {
	rec, err := g.DB().GetOne(ctx, "SELECT * FROM prototypes WHERE id=?", id)
	if err != nil {
		return nil, err
	}
	if rec.IsEmpty() {
		return nil, nil
	}
	var p model.Prototype
	if err := rec.Struct(&p); err != nil {
		return nil, err
	}
	return &p, nil
}

func CreatePrototype(ctx context.Context, p *model.Prototype) (int64, error) {
	res, err := g.DB().Exec(ctx, `INSERT INTO prototypes(project_id, name, type, uri, notes) VALUES(?,?,?,?,?)`,
		p.ProjectId, p.Name, p.Type, p.Uri, p.Notes)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

func UpdatePrototype(ctx context.Context, p *model.Prototype) error {
	_, err := g.DB().Exec(ctx, `UPDATE prototypes SET name=?, type=?, uri=?, notes=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`,
		p.Name, p.Type, p.Uri, p.Notes, p.Id)
	return err
}

func DeletePrototype(ctx context.Context, id int64) error {
	_, err := g.DB().Exec(ctx, "DELETE FROM prototypes WHERE id=?", id)
	if err != nil {
		return err
	}
	_, err = g.DB().Exec(ctx, "DELETE FROM trace_links WHERE (from_type='prototype' AND from_id=?) OR (to_type='prototype' AND to_id=?)", id, id)
	return err
}

// ---- TraceLink ----

func ListTraceLinks(ctx context.Context, projectId int64) ([]model.TraceLink, error) {
	res, err := g.DB().GetAll(ctx, "SELECT * FROM trace_links WHERE project_id=? ORDER BY id", projectId)
	if err != nil {
		return nil, err
	}
	var out []model.TraceLink
	if err := res.Structs(&out); err != nil {
		return nil, err
	}
	return nn(out), nil
}

func CreateTraceLink(ctx context.Context, t *model.TraceLink) (int64, error) {
	res, err := g.DB().Exec(ctx, `INSERT INTO trace_links(project_id, from_type, from_id, to_type, to_id, link_type) VALUES(?,?,?,?,?,?)`,
		t.ProjectId, t.FromType, t.FromId, t.ToType, t.ToId, t.LinkType)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

func DeleteTraceLink(ctx context.Context, id int64) error {
	_, err := g.DB().Exec(ctx, "DELETE FROM trace_links WHERE id=?", id)
	return err
}

// ---- 辅助 ----

// RequireProject 校验项目存在，避免写入孤儿记录。
func RequireProject(ctx context.Context, projectId int64) error {
	rec, err := g.DB().GetOne(ctx, "SELECT 1 FROM projects WHERE id=?", projectId)
	if err != nil {
		return err
	}
	if rec.IsEmpty() {
		return fmt.Errorf("project %d not found", projectId)
	}
	return nil
}
