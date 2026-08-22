package ai

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/gogf/gf/v2/frame/g"
)

// Chat 调用 OpenAI-compatible 聊天接口。baseUrl/apiKey/model 从配置读取。
// 未配置 baseUrl 或 apiKey 时走本地 stub。
func Chat(ctx context.Context, prompt string) (string, error) {
	baseURL := g.Cfg().MustGet(ctx, "archlens.ai.baseUrl").String()
	apiKey := g.Cfg().MustGet(ctx, "archlens.ai.apiKey").String()
	model := g.Cfg().MustGet(ctx, "archlens.ai.model").String()
	if model == "" {
		model = "deepseek-chat"
	}

	if baseURL == "" || apiKey == "" {
		return stub(prompt), nil
	}

	body := map[string]interface{}{
		"model":       model,
		"temperature": 0.4,
		"messages": []map[string]string{
			{"role": "system", "content": "You are an expert software architect using the C4 model. Reply concisely and use Chinese."},
			{"role": "user", "content": prompt},
		},
	}
	b, _ := json.Marshal(body)

	url := strings.TrimRight(baseURL, "/") + "/chat/completions"
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(b))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+apiKey)

	client := &http.Client{Timeout: 120 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	rb, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("llm http %d: %s", resp.StatusCode, string(rb))
	}

	var parsed struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
	}
	if err := json.Unmarshal(rb, &parsed); err != nil {
		return "", err
	}
	if len(parsed.Choices) == 0 {
		return "", fmt.Errorf("llm empty choice")
	}
	return parsed.Choices[0].Message.Content, nil
}

func stub(prompt string) string {
	return "（离线 stub）未配置 AI 密钥，已按规则生成占位分析。请在后端配置 archlens.ai.* 后重试。\n\n输入片段：" + truncate(prompt, 80)
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "..."
}
