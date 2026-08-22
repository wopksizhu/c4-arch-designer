package main

import (
	"context"
	"os"
	"path/filepath"

	_ "github.com/gogf/gf/contrib/drivers/sqlite/v2"

	"github.com/gogf/gf/v2/frame/g"
	"github.com/gogf/gf/v2/os/gctx"

	"archlens/server/internal/api"
	"archlens/server/internal/db"
)

const defaultConfig = `# ArchLens 默认配置（首次运行自动生成，可修改后重启生效）
server:
  address: ":8080"
  openapiPath: "/api.json"
  swaggerPath: "/swagger"

database:
  default:
    link: "sqlite::@file(./data/archlens.db)"
    debug: false

archlens:
  uploadDir: "./data/uploads"
  ai:
    enabled: true
    baseUrl: ""
    apiKey: ""
    model: "deepseek-chat"
    budget: 0
`

// ensureConfig 确保 GoFrame 能读到配置文件；缺失时在工作目录自举一份默认配置。
func ensureConfig(ctx context.Context) error {
	paths := []string{"manifest/config", "config"}
	for _, p := range paths {
		if _, err := os.Stat(filepath.Join(p, "config.yaml")); err == nil {
			return nil
		}
	}
	dir := filepath.Join("manifest", "config")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}
	_ = ctx
	return os.WriteFile(filepath.Join(dir, "config.yaml"), []byte(defaultConfig), 0o644)
}

func main() {
	ctx := gctx.GetInitCtx()

	if err := ensureConfig(ctx); err != nil {
		g.Log().Fatal(ctx, "init config failed: ", err)
	}
	if err := db.Init(ctx); err != nil {
		g.Log().Fatal(ctx, "init db failed: ", err)
	}

	s := g.Server()
	api.Register(s)
	api.RegisterStatic(s)

	g.Log().Infof(ctx, "ArchLens server running at http://127.0.0.1:8080")
	s.Run()
}
