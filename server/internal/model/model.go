package model

import "time"

// 常量：C4 层级与元素类型
const (
	LevelContext   = 1
	LevelContainer = 2
	LevelComponent = 3

	TypePerson         = "person"
	TypeSoftwareSystem = "softwareSystem"
	TypeContainer      = "container"
	TypeComponent      = "component"
)

// ---- 实体（对应数据库表） ----

type Project struct {
	Id          int64     `json:"id"`
	Name        string    `json:"name"`
	Description string    `json:"description"`
	CreatedAt   time.Time `json:"createdAt"`
	UpdatedAt   time.Time `json:"updatedAt"`
}

type Element struct {
	Id          int64   `json:"id"`
	ProjectId   int64   `json:"projectId"`
	Level       int     `json:"level"`
	Type        string  `json:"type"`
	Name        string  `json:"name"`
	Description string  `json:"description"`
	Technology  string  `json:"technology"`
	Tags        string  `json:"tags"`
	Category    string  `json:"category"` // 细分类别：database/queue/cache/frontend/backend/mobile/external/user...
	ParentId    *int64  `json:"parentId,omitempty"`
	PosX        float64 `json:"posX"`
	PosY        float64 `json:"posY"`
	CreatedAt   time.Time `json:"createdAt"`
	UpdatedAt   time.Time `json:"updatedAt"`
}

type Relationship struct {
	Id                int64     `json:"id"`
	ProjectId         int64     `json:"projectId"`
	SourceId          int64     `json:"sourceId"`
	TargetId          int64     `json:"targetId"`
	Label             string    `json:"label"`
	Interaction       string    `json:"interaction"` // 交互内容，如“下单”
	Protocol          string    `json:"protocol"`    // 通信协议，如 REST/HTTP, MQ
	Description       string    `json:"description"`
	Technology        string    `json:"technology"`
	Level             int       `json:"level"`
	SourceContainerId *int64    `json:"sourceContainerId,omitempty"` // 源系统展开后，消息由该系统内哪个容器发出
	TargetContainerId *int64    `json:"targetContainerId,omitempty"` // 目标系统展开后，消息落到该系统内哪个容器
	// 消息列表（JSON 字符串，形如 [{"name":"..","protocol":"..","senderId":null,"receiverId":null}]）
	Messages  string    `json:"messages"`
	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
}

type Requirement struct {
	Id          int64     `json:"id"`
	ProjectId   int64     `json:"projectId"`
	Code        string    `json:"code"`
	Title       string    `json:"title"`
	Description string    `json:"description"`
	Priority    string    `json:"priority"`
	Status      string    `json:"status"`
	Source      string    `json:"source"`
	Tags        string    `json:"tags"`
	CreatedAt   time.Time `json:"createdAt"`
	UpdatedAt   time.Time `json:"updatedAt"`
}

type Prototype struct {
	Id        int64     `json:"id"`
	ProjectId int64     `json:"projectId"`
	Name      string    `json:"name"`
	Type      string    `json:"type"`
	Uri       string    `json:"uri"`
	Notes     string    `json:"notes"`
	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
}

type TraceLink struct {
	Id        int64     `json:"id"`
	ProjectId int64     `json:"projectId"`
	FromType  string    `json:"fromType"`
	FromId    int64     `json:"fromId"`
	ToType    string    `json:"toType"`
	ToId      int64     `json:"toId"`
	LinkType  string    `json:"linkType"`
	CreatedAt time.Time `json:"createdAt"`
}

// View 画布视图：同一模型的命名布局快照（元素位置）。主视图 isDefault=1 向后兼容。
type View struct {
	Id        int64     `json:"id"`
	ProjectId int64     `json:"projectId"`
	Name      string    `json:"name"`
	Payload   string    `json:"payload"` // JSON: [{"elemId":1,"x":0,"y":0}, ...]
	IsDefault bool      `json:"isDefault"`
	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
}

// ---- 追溯矩阵与影响分析 ----

// TraceMatrix 聚合展示：需求 × 元素 × 原型 关联表。
type TraceMatrixRow struct {
	ElementId      int64  `json:"elementId"`
	ElementName    string `json:"elementName"`
	ElementType    string `json:"elementType"`
	Level          int    `json:"level"`
	RequirementIds []int64 `json:"requirementIds"`
	RequirementText string `json:"requirementText"`
	PrototypeIds   []int64 `json:"prototypeIds"`
	PrototypeText  string  `json:"prototypeText"`
}

// ImpactNode 影响分析中的受影响对象。
type ImpactNode struct {
	Type  string `json:"type"`
	Id    int64  `json:"id"`
	Name  string `json:"name"`
}

// ImpactResult 影响分析结果。
type ImpactResult struct {
	Root      ImpactNode   `json:"root"`
	Affected  []ImpactNode `json:"affected"`
	Trips     [][]ImpactNode `json:"chains"`
}

// ---- AI ----

// AiGenerateReq 从文字/需求生成 C4 初稿。
type AiGenerateReq struct {
	Text string `json:"text" v:"required"`
}

// AiValidateReq 一致性校验。
type AiValidateReq struct {
	Mode string `json:"mode"` // naming|trace|hierarchy|all
}
