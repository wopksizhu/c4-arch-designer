package api

import (
	"github.com/gogf/gf/v2/net/ghttp"
)

// Register 注册所有 /api 路由。
func Register(s *ghttp.Server) {
	s.Group("/api", func(group *ghttp.RouterGroup) {
		group.Group("/projects", func(p *ghttp.RouterGroup) {
			p.GET("/", listProjects)
			p.POST("/", createProject)
			p.GET("/{id}", getProject)
			p.PUT("/{id}", updateProject)
			p.DELETE("/{id}", deleteProject)

			p.GET("/{id}/elements", listElements)
			p.POST("/{id}/elements", createElement)
			p.GET("/{id}/relationships", listRelationships)
			p.POST("/{id}/relationships", createRelationship)
			p.GET("/{id}/requirements", listRequirements)
			p.POST("/{id}/requirements", createRequirement)
			p.POST("/{id}/requirements/import", importRequirements)
			p.GET("/{id}/prototypes", listPrototypes)
			p.POST("/{id}/prototypes", createPrototype)
			p.GET("/{id}/tracelinks", listTraceLinks)
			p.POST("/{id}/tracelinks", createTraceLink)

			p.GET("/{id}/matrix", traceMatrix)
			p.GET("/{id}/impact", impactAnalysis)
			p.GET("/{id}/export", exportProject)
			p.POST("/{id}/import/dsl", importDSL)
			p.POST("/{id}/requirements/import/csv", importCSVRequirements)
			p.GET("/{id}/validate/rules", rulesValidate)
			p.POST("/{id}/ai/generate", aiGenerate)
			p.POST("/{id}/ai/apply", aiApply)
			p.POST("/{id}/ai/validate", aiValidate)
		})

		group.DELETE("/elements/{id}", deleteElement)
		group.PUT("/elements/{id}", updateElement)
		group.DELETE("/relationships/{id}", deleteRelationship)
		group.PUT("/relationships/{id}", updateRelationship)
		group.DELETE("/requirements/{id}", deleteRequirement)
		group.PUT("/requirements/{id}", updateRequirement)
		group.DELETE("/prototypes/{id}", deletePrototype)
		group.PUT("/prototypes/{id}", updatePrototype)
		group.DELETE("/tracelinks/{id}", deleteTraceLink)
	})
}
