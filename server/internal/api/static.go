package api

import (
	"errors"
	"mime"
	"os"
	"path"
	"path/filepath"
	"strings"

	"github.com/gogf/gf/v2/net/ghttp"

	"archlens/server/internal/web"
)

var errNotUpload = errors.New("not upload path")

// RegisterStatic 注册前端静态资源（嵌入 FS + SPA 回退）与上传目录服务。
func RegisterStatic(s *ghttp.Server) {
	s.BindHandler("/*", func(r *ghttp.Request) {
		p := r.Request.URL.Path
		if strings.HasPrefix(p, "/api") {
			r.Response.WriteStatus(404)
			return
		}
		if err := serveUpload(r, p); err == nil {
			return
		}
		serveEmbedded(r, p)
	})
}

func serveUpload(r *ghttp.Request, p string) error {
	if !strings.HasPrefix(p, "/uploads/") {
		return errNotUpload
	}
	rel := strings.TrimPrefix(p, "/uploads/")
	if rel == "" || strings.Contains(rel, "..") {
		r.Response.WriteStatus(400)
		return errNotUpload
	}
	data, err := os.ReadFile(filepath.Join("data", "uploads", filepath.FromSlash(rel)))
	if err != nil {
		return err
	}
	writeFile(r, rel, data)
	return nil
}

func serveEmbedded(r *ghttp.Request, p string) {
	name := strings.TrimPrefix(p, "/")
	if name == "" {
		name = "index.html"
	}
	data, err := web.FS.ReadFile("dist/" + name)
	if err != nil {
		// SPA 回退到 index.html
		idx, derr := web.FS.ReadFile("dist/index.html")
		if derr != nil {
			r.Response.WriteStatus(404)
			return
		}
		writeFile(r, "index.html", idx)
		return
	}
	writeFile(r, name, data)
}

func writeFile(r *ghttp.Request, name string, data []byte) {
	ctype := mime.TypeByExtension(path.Ext(name))
	if ctype == "" {
		ctype = "application/octet-stream"
	}
	r.Response.Header().Set("Content-Type", ctype)
	r.Response.Write(data)
}
