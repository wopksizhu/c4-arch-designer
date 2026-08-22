package api

import (
	"github.com/gogf/gf/v2/frame/g"
	"github.com/gogf/gf/v2/net/ghttp"
)

// ok / fail 统一响应信封 {code, message, data}。
func ok(r *ghttp.Request, data interface{}) {
	r.Response.WriteJson(g.Map{"code": 0, "message": "", "data": data})
}

func fail(r *ghttp.Request, code int, msg string) {
	r.Response.WriteJson(g.Map{"code": code, "message": msg, "data": nil})
}

func idOf(r *ghttp.Request, key string) int64 {
	return r.Get(key).Int64()
}
