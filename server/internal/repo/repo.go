package repo

import (
	"context"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

var skipDirs = map[string]bool{
	".git": true, "node_modules": true, "vendor": true, "dist": true, "build": true,
	"target": true, "bin": true, "obj": true, "__pycache__": true, ".venv": true,
	"venv": true, ".idea": true,
}

var textExt = map[string]bool{
	".go": true, ".ts": true, ".tsx": true, ".js": true, ".jsx": true, ".py": true,
	".java": true, ".rs": true, ".c": true, ".cpp": true, ".cs": true, ".rb": true,
	".php": true, ".vue": true, ".json": true, ".yaml": true, ".yml": true,
	".toml": true, ".sql": true, ".sh": true, ".md": true, ".html": true, ".css": true,
}

// Scan 扫描本地代码目录，返回用于 AI 推断的文本摘要（文件树 + 关键文件片段）。
func Scan(ctx context.Context, dir string) (string, error) {
	info, err := os.Stat(dir)
	if err != nil {
		return "", err
	}
	if !info.IsDir() {
		return "", fmt.Errorf("不是目录: %s", dir)
	}

	var b strings.Builder
	b.WriteString("代码目录文件树：\n")

	type snippet struct {
		path string
		text string
	}
	var files []string
	var snippets []snippet
	limit := 200

	_ = filepath.WalkDir(dir, func(p string, d fs.DirEntry, err error) error {
		if err != nil {
			return nil
		}
		if ctx.Err() != nil {
			return filepath.SkipDir
		}
		name := d.Name()
		if d.IsDir() {
			if skipDirs[name] || strings.HasPrefix(name, ".") {
				return filepath.SkipDir
			}
			return nil
		}
		if len(files) >= limit {
			return filepath.SkipDir
		}
		rel, _ := filepath.Rel(dir, p)
		files = append(files, filepath.ToSlash(rel))

		// 采集少量源码片段（限大小、限数量）
		ext := strings.ToLower(filepath.Ext(name))
		if textExt[ext] && len(snippets) < 40 {
			if fi, err := d.Info(); err == nil && fi.Size() < 100*1024 {
				if data, err := os.ReadFile(p); err == nil {
					lines := strings.Split(string(data), "\n")
					if len(lines) > 25 {
						lines = lines[:25]
					}
					snippets = append(snippets, snippet{path: rel, text: strings.Join(lines, "\n")})
				}
			}
		}
		return nil
	})
	if ctx.Err() != nil {
		return "", ctx.Err()
	}

	sort.Strings(files)
	for _, f := range files {
		b.WriteString("- " + f + "\n")
	}
	b.WriteString("\n关键文件片段：\n")
	for _, s := range snippets {
		b.WriteString("### " + s.path + "\n" + s.text + "\n")
	}
	return b.String(), nil
}
