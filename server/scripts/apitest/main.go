// ArchLens 系统性 API 集成测试。
// 覆盖项目管理、C4 建模、关系、需求、原型、追溯、影响分析、导出、导入、规则校验、部分更新、重复追溯去重。
//
// 用法（需服务已运行）：
//   go run ./scripts/apitest -base http://127.0.0.1:8080            # 默认
//   go run ./scripts/apitest -base http://127.0.0.1:8080 -ai        # 额外执行 AI 测试（走 DeepSeek，较慢）
package main

import (
	"bytes"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
)

var base string
var passing, failing int

type env struct {
	Code    int             `json:"code"`
	Message string          `json:"message"`
	Data    json.RawMessage `json:"data"`
}

func req(method, path string, body interface{}) (int, string) {
	var buf io.Reader
	if body != nil {
		b, _ := json.Marshal(body)
		buf = bytes.NewReader(b)
	}
	r, _ := http.NewRequest(method, base+path, buf)
	r.Header.Set("Content-Type", "application/json")
	resp, err := http.DefaultClient.Do(r)
	if err != nil {
		return -1, err.Error()
	}
	defer resp.Body.Close()
	rb, _ := io.ReadAll(resp.Body)
	var e env
	json.Unmarshal(rb, &e)
	return e.Code, string(rb)
}

func check(label string, cond bool, detail string) {
	if cond {
		passing++
		fmt.Printf("  [PASS] %s\n", label)
	} else {
		failing++
		fmt.Printf("  [FAIL] %s :: %s\n", label, detail)
	}
}

func main() {
	flag.StringVar(&base, "base", "http://127.0.0.1:8080", "base url of running server")
	withAI := flag.Bool("ai", false, "run AI tests (uses DeepSeek)")
	flag.Parse()

	fmt.Println("== ArchLens 系统性 API 测试 ==")
	fmt.Println("base:", base)
	if _, err := http.Get(base + "/api/projects"); err != nil {
		fmt.Println("无法连接服务:", err)
		os.Exit(1)
	}

	// 1. 创建项目
	code, body := req("POST", "/api/projects", map[string]interface{}{"name": "apitest", "description": "sys"})
	var pid float64
	if code == 0 {
		pid = jsonData(json.RawMessage(body)).getDataId()
	}
	check("创建项目", code == 0 && pid > 0, body)
	if pid == 0 {
		fmt.Println("\nRESULT: ", passing, " passed, ", failing, " failed")
		return
	}

	// 2. 添加根软件系统
	code, body = req("POST", fmt.Sprintf("/api/projects/%v/elements", pid), map[string]interface{}{"level": 1, "type": "softwareSystem", "name": "OrderSys"})
	el := jsonData(json.RawMessage(body)).getData()
	check("添加软件系统(level/type/name)", code == 0 && str(el["name"]) == "OrderSys" && str(el["type"]) == "softwareSystem" && num(el["level"]) == 1, body)
	sysID := num(el["id"])

	// 3. 添加子容器
	code, body = req("POST", fmt.Sprintf("/api/projects/%v/elements", pid), map[string]interface{}{"level": 2, "type": "container", "name": "Web", "parentId": sysID})
	el = jsonData(json.RawMessage(body)).getData()
	check("添加子容器(嵌套 parentId)", code == 0 && num(el["parentId"]) == sysID, body)
	webID := num(el["id"])

	// 4. 添加带交互/协议的关系
	code, body = req("POST", fmt.Sprintf("/api/projects/%v/relationships", pid), map[string]interface{}{"sourceId": webID, "targetId": sysID, "label": "calls", "interaction": "request", "protocol": "REST", "level": 2})
	rel := jsonData(json.RawMessage(body)).getData()
	check("添加关系(interaction+protocol)", code == 0 && str(rel["interaction"]) == "request" && str(rel["protocol"]) == "REST", body)
	relID := num(rel["id"])

	// 5. 添加需求（手工）
	code, body = req("POST", fmt.Sprintf("/api/projects/%v/requirements", pid), map[string]interface{}{"code": "R1", "title": "Ship", "priority": "high"})
	reqData := jsonData(json.RawMessage(body)).getData()
	check("添加需求(手工)", code == 0 && str(reqData["title"]) == "Ship", body)
	reqID := num(reqData["id"])

	// 5b. CSV 导入需求
	code, body = req("POST", fmt.Sprintf("/api/projects/%v/requirements/import/csv", pid), map[string]interface{}{"content": "code,title\nC1,Search\nC2,Cart"})
	check("CSV 导入需求", code == 0 && num(jsonData(json.RawMessage(body)).getData()["created"]) == 2, body)

	// 6. 添加原型（URL）
	code, body = req("POST", fmt.Sprintf("/api/projects/%v/prototypes", pid), map[string]interface{}{"name": "Web UI", "type": "url", "uri": "https://x.figma.com/a"})
	proto := jsonData(json.RawMessage(body)).getData()
	check("添加原型(URL)", code == 0 && str(proto["uri"]) == "https://x.figma.com/a", body)
	protoID := num(proto["id"])

	// 7. 追溯：需求->元素
	code, body = req("POST", fmt.Sprintf("/api/projects/%v/tracelinks", pid), map[string]interface{}{"fromType": "requirement", "fromId": reqID, "toType": "element", "toId": sysID, "linkType": "satisfies"})
	check("追溯链接 需求->元素", code == 0, body)

	// 8. 重复追溯：应被阻止
	code, body = req("POST", fmt.Sprintf("/api/projects/%v/tracelinks", pid), map[string]interface{}{"fromType": "requirement", "fromId": reqID, "toType": "element", "toId": sysID, "linkType": "satisfies"})
	check("重复追溯被阻止", code != 0, body)

	// 9. 追溯：元素->原型
	code, body = req("POST", fmt.Sprintf("/api/projects/%v/tracelinks", pid), map[string]interface{}{"fromType": "element", "fromId": sysID, "toType": "prototype", "toId": protoID, "linkType": "shows"})
	check("追溯链接 元素->原型", code == 0, body)

	// 10. 追溯矩阵
	code, body = req("GET", fmt.Sprintf("/api/projects/%v/matrix", pid), nil)
	check("追溯矩阵", code == 0 && strings.Contains(body, "OrderSys"), body)

	// 11. 影响分析
	code, body = req("GET", fmt.Sprintf("/api/projects/%v/impact?type=element&oid=%v", pid, sysID), nil)
	check("影响分析", code == 0 && strings.Contains(body, "requirement"), body)

	// 12. 导出 json/dsl/markdown/html
	for _, f := range []string{"json", "dsl", "markdown", "html"} {
		code, body = req("GET", fmt.Sprintf("/api/projects/%v/export?format=%s", pid, f), nil)
		check("导出 "+f, code == 0 && len(body) > 0, body)
	}

	// 13. DSL 导入
	dsl := `workspace "x" { model { softwareSystem "sys2" { container "api" } "api" -> "sys2" "calls" } }`
	code, body = req("POST", fmt.Sprintf("/api/projects/%v/import/dsl", pid), map[string]interface{}{"content": dsl})
	check("DSL 导入", code == 0, body)

	// 14. 静态规则校验
	code, body = req("GET", fmt.Sprintf("/api/projects/%v/validate/rules", pid), nil)
	check("静态校验规则", code == 0, body)

	// 15. 元素部分更新：只改位置，名称保留
	code, body = req("PUT", fmt.Sprintf("/api/elements/%v", sysID), map[string]interface{}{"posX": 500.0, "posY": 300.0})
	el = jsonData(json.RawMessage(body)).getData()
	check("元素部分更新(位置,名称保留)", code == 0 && str(el["name"]) == "OrderSys" && str(el["type"]) == "softwareSystem", body)

	// 16. 关系部分更新：只改协议，交互保留
	code, body = req("PUT", fmt.Sprintf("/api/relationships/%v", relID), map[string]interface{}{"protocol": "gRPC"})
	rel = jsonData(json.RawMessage(body)).getData()
	check("关系部分更新(协议,交互保留)", code == 0 && str(rel["interaction"]) == "request" && str(rel["protocol"]) == "gRPC", body)

	// 17. 级联删除：删除父元素，子元素应被一并删除
	code, body = req("POST", fmt.Sprintf("/api/projects/%v/elements", pid), map[string]interface{}{"level": 1, "type": "softwareSystem", "name": "Parent"})
	parentID := num(jsonData(json.RawMessage(body)).getData()["id"])
	req("POST", fmt.Sprintf("/api/projects/%v/elements", pid), map[string]interface{}{"level": 2, "type": "container", "name": "Child", "parentId": parentID})
	req("DELETE", fmt.Sprintf("/api/elements/%v", parentID), nil)
	code, body = req("GET", fmt.Sprintf("/api/projects/%v/elements", pid), nil)
	check("级联删除(删父元素子元素也被删)", code == 0 && !strings.Contains(body, "Child"), body)

	// 18. AI 测试（可选）
	if *withAI {
		code, body = req("POST", fmt.Sprintf("/api/projects/%v/ai/generate", pid), map[string]interface{}{"text": "build a store system"})
		gen := jsonData(json.RawMessage(body))
		check("AI 生成 C4 草稿", code == 0 && gen["draft"] != nil, body)
		code, body = req("POST", fmt.Sprintf("/api/projects/%v/ai/validate", pid), map[string]interface{}{"mode": "all"})
		check("AI 一致性校验", code == 0, body)
	}

	// 18. 删除（清理）
	code, _ = req("DELETE", fmt.Sprintf("/api/tracelinks/%v", protoID), nil)
	_ = code
	req("DELETE", fmt.Sprintf("/api/projects/%v", pid), nil)
	fmt.Println("（已清理测试项目）")

	fmt.Printf("\nRESULT: %d 通过, %d 失败\n", passing, failing)
	if failing > 0 {
		os.Exit(1)
	}
	fmt.Println("全部通过 ✓")
}

func removeProject(pid float64) {
	req("DELETE", fmt.Sprintf("/api/projects/%v", pid), nil)
}

type obj map[string]interface{}

func jsonData(raw json.RawMessage) obj {
	var m obj
	json.Unmarshal(raw, &m)
	return m
}

func (m obj) getData() obj {
	if d, ok := m["data"].(map[string]interface{}); ok {
		return obj(d)
	}
	return obj{}
}

func (m obj) getDataId() float64 {
	if d, ok := m["data"].(map[string]interface{}); ok {
		if id, ok := d["id"].(float64); ok {
			return id
		}
	}
	return 0
}

func str(v interface{}) string {
	if v == nil {
		return ""
	}
	if s, ok := v.(string); ok {
		return s
	}
	return fmt.Sprintf("%v", v)
}

func num(v interface{}) float64 {
	switch t := v.(type) {
	case float64:
		return t
	case int:
		return float64(t)
	case nil:
		return 0
	default:
		return 0
	}
}

