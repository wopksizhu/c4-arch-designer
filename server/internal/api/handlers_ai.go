package api

import (
	"strings"

	"github.com/gogf/gf/v2/net/ghttp"
	"github.com/gogf/gf/v2/util/gconv"

	"archlens/server/internal/ai"
	"archlens/server/internal/dsl"
	"archlens/server/internal/model"
	"archlens/server/internal/store"
)

// exportProject 导出项目：format=dsl|json|markdown。
func exportProject(r *ghttp.Request) {
	pid := idOf(r, "id")
	format := r.Get("format").String()
	if format == "" {
		format = "json"
	}
	content, ct, err := dsl.Export(r.Context(), pid, format)
	if err != nil {
		fail(r, 500, err.Error())
		return
	}
	r.Response.Header().Set("Content-Type", ct)
	r.Response.Write(content)
}

// aiGenerate 从文字/需求生成 C4 初稿。
func aiGenerate(r *ghttp.Request) {
	pid := idOf(r, "id")
	var req model.AiGenerateReq
	if err := r.Parse(&req); err != nil {
		fail(r, 51, err.Error())
		return
	}
	if req.Text == "" {
		fail(r, 51, "请提供需求/描述文本")
		return
	}
	if err := store.RequireProject(r.Context(), pid); err != nil {
		fail(r, 404, err.Error())
		return
	}
	prompt := buildGeneratePrompt(req.Text)
	text, err := ai.Chat(r.Context(), prompt)
	if err != nil {
		fail(r, 500, "AI 调用失败: "+err.Error())
		return
	}
	ok(r, ghttpData{"text": text})
}

// aiValidate 一致性校验。
func aiValidate(r *ghttp.Request) {
	pid := idOf(r, "id")
	var req model.AiValidateReq
	if err := r.Parse(&req); err != nil {
		fail(r, 51, err.Error())
		return
	}
	mode := req.Mode
	if mode == "" {
		mode = "all"
	}
	elems, _ := store.ListElements(r.Context(), pid)
	rels, _ := store.ListRelationships(r.Context(), pid)
	links, _ := store.ListTraceLinks(r.Context(), pid)
	prompt := buildValidatePrompt(mode, elems, rels, links)
	text, err := ai.Chat(r.Context(), prompt)
	if err != nil {
		fail(r, 500, "AI 校验失败: "+err.Error())
		return
	}
	ok(r, ghttpData{"text": text})
}

type ghttpData map[string]interface{}

func buildGeneratePrompt(text string) string {
	return `请根据以下需求/描述，用 C4 模型生成软件架构初稿。
按 JSON 输出，格式：
{"elements":[{"type":"person|softwareSystem|container|component","name":"","description":"","technology":"","level":1|2|3,"parent":"父元素名称(可空)"}],"relationships":[{"source":"源名称","target":"目标名称","label":"关系说明"}]}
要求：尽量贴合描述；level 1=Context, 2=Container, 3=Component；只输出 JSON，不要额外解释。

描述：
` + text
}

func buildValidatePrompt(mode string, elems []model.Element, rels []model.Relationship, links []model.TraceLink) string {
	var b strings.Builder
	b.WriteString("请对以下 C4 架构做一致性检查，输出问题清单（每条一行；没有问题则输出“未发现问题”）。\n")
	b.WriteString("检查模式：" + mode + "\n\n当前元素：\n")
	for _, e := range elems {
		b.WriteString("- " + e.Type + " " + e.Name + " (level " + intToStr(int64(e.Level)) + ")\n")
	}
	b.WriteString("关系：\n")
	for _, rel := range rels {
		b.WriteString("- " + intToStr(rel.SourceId) + " -> " + intToStr(rel.TargetId) + " " + rel.Label + "\n")
	}
	b.WriteString("追溯链接数量：" + intToStr(int64(len(links))) + "\n")
	return b.String()
}

func intToStr(i int64) string {
	return gconv.String(i)
}
