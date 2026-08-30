package db

import (
	"context"
	"fmt"
	"os"
	"path/filepath"

	"github.com/gogf/gf/v2/frame/g"
)

// schema 定义 MVP 数据表结构。使用纯 Go SQLite。
const schema = `
CREATE TABLE IF NOT EXISTS projects (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	name TEXT NOT NULL,
	description TEXT NOT NULL DEFAULT '',
	created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
	updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS elements (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	project_id INTEGER NOT NULL,
	level INTEGER NOT NULL DEFAULT 1,        -- 1=context 2=container 3=component
	type TEXT NOT NULL DEFAULT 'component',  -- person|softwareSystem|container|component
	name TEXT NOT NULL,
	description TEXT NOT NULL DEFAULT '',
	technology TEXT NOT NULL DEFAULT '',
	tags TEXT NOT NULL DEFAULT '',
	category TEXT NOT NULL DEFAULT '',
	parent_id INTEGER,
	pos_x REAL NOT NULL DEFAULT 0,
	pos_y REAL NOT NULL DEFAULT 0,
	created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
	updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS relationships (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	project_id INTEGER NOT NULL,
	source_id INTEGER NOT NULL,
	target_id INTEGER NOT NULL,
	label TEXT NOT NULL DEFAULT '',
	interaction TEXT NOT NULL DEFAULT '',
	protocol TEXT NOT NULL DEFAULT '',
	description TEXT NOT NULL DEFAULT '',
	technology TEXT NOT NULL DEFAULT '',
	level INTEGER NOT NULL DEFAULT 1,
	source_container_id INTEGER,
	target_container_id INTEGER,
	messages TEXT NOT NULL DEFAULT '[]',
	created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
	updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS requirements (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	project_id INTEGER NOT NULL,
	code TEXT NOT NULL DEFAULT '',
	title TEXT NOT NULL,
	description TEXT NOT NULL DEFAULT '',
	priority TEXT NOT NULL DEFAULT 'medium',
	status TEXT NOT NULL DEFAULT 'draft',
	source TEXT NOT NULL DEFAULT 'manual',
	tags TEXT NOT NULL DEFAULT '',
	created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
	updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS prototypes (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	project_id INTEGER NOT NULL,
	name TEXT NOT NULL,
	type TEXT NOT NULL DEFAULT 'image',   -- image|url
	uri TEXT NOT NULL DEFAULT '',
	notes TEXT NOT NULL DEFAULT '',
	created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
	updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS trace_links (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	project_id INTEGER NOT NULL,
	from_type TEXT NOT NULL,   -- requirement|element|prototype
	from_id INTEGER NOT NULL,
	to_type TEXT NOT NULL,
	to_id INTEGER NOT NULL,
	link_type TEXT NOT NULL DEFAULT 'satisfies',
	created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ai_suggestions (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	project_id INTEGER NOT NULL,
	type TEXT NOT NULL,        -- generate|validate
	payload TEXT NOT NULL,     -- JSON 字符串
	status TEXT NOT NULL DEFAULT 'pending',  -- pending|accepted|rejected
	created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS views (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	project_id INTEGER NOT NULL,
	name TEXT NOT NULL,
	payload TEXT NOT NULL DEFAULT '[]',
	is_default INTEGER NOT NULL DEFAULT 0,
	created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
	updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_elem_project ON elements(project_id);
CREATE INDEX IF NOT EXISTS idx_rel_project ON relationships(project_id);
CREATE INDEX IF NOT EXISTS idx_req_project ON requirements(project_id);
CREATE INDEX IF NOT EXISTS idx_proto_project ON prototypes(project_id);
CREATE INDEX IF NOT EXISTS idx_trace_project ON trace_links(project_id);
`

// Init 初始化数据库连接并建表。
func Init(ctx context.Context) error {
	// 确保数据目录存在（SQLite 无法在不存在目录下建库文件）
	for _, d := range []string{"data", filepath.Join("data", "uploads")} {
		if err := os.MkdirAll(d, 0o755); err != nil {
			return fmt.Errorf("mkdir %s failed: %w", d, err)
		}
	}

	db := g.DB()
	if _, err := db.Exec(ctx, "SELECT 1;"); err != nil {
		return fmt.Errorf("sqlite ping failed: %w", err)
	}
	if _, err := db.Exec(ctx, schema); err != nil {
		return fmt.Errorf("migrate schema failed: %w", err)
	}
	// 轻量迁移：为已存在的关系表补缺失列（SQLite 重复 ADD COLUMN 会报错，故忽略）
	for _, alter := range []string{
		"ALTER TABLE relationships ADD COLUMN interaction TEXT NOT NULL DEFAULT ''",
		"ALTER TABLE relationships ADD COLUMN protocol TEXT NOT NULL DEFAULT ''",
		"ALTER TABLE relationships ADD COLUMN source_container_id INTEGER",
		"ALTER TABLE relationships ADD COLUMN target_container_id INTEGER",
		"ALTER TABLE relationships ADD COLUMN messages TEXT NOT NULL DEFAULT '[]'",
		"ALTER TABLE elements ADD COLUMN category TEXT NOT NULL DEFAULT ''",
	} {
		_, _ = db.Exec(ctx, alter)
	}
	return nil
}
