use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// OpenClaw 完整配置 - 对应 openclaw.json 结构
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct OpenClawConfig {
    /// Agent 配置
    #[serde(default)]
    pub agents: AgentsConfig,
    /// 模型配置
    #[serde(default)]
    pub models: ModelsConfig,
    /// 网关配置
    #[serde(default)]
    pub gateway: GatewayConfig,
    /// 渠道配置
    #[serde(default)]
    pub channels: HashMap<String, serde_json::Value>,
    /// 插件配置
    #[serde(default)]
    pub plugins: PluginsConfig,
    /// 元数据
    #[serde(default)]
    pub meta: MetaConfig,
}

/// Agent 配置
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct AgentsConfig {
    /// 默认配置
    #[serde(default)]
    pub defaults: AgentDefaults,
}

/// Agent 默认配置
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct AgentDefaults {
    /// 模型配置
    #[serde(default)]
    pub model: AgentModelConfig,
    /// 可用模型列表 (provider/model -> {})
    #[serde(default)]
    pub models: HashMap<String, serde_json::Value>,
    /// 压缩配置
    #[serde(default)]
    pub compaction: Option<serde_json::Value>,
    /// 上下文裁剪
    #[serde(rename = "contextPruning", default)]
    pub context_pruning: Option<serde_json::Value>,
    /// 心跳配置
    #[serde(default)]
    pub heartbeat: Option<serde_json::Value>,
    /// 最大并发数
    #[serde(rename = "maxConcurrent", default)]
    pub max_concurrent: Option<u32>,
    /// 子代理配置
    #[serde(default)]
    pub subagents: Option<serde_json::Value>,
}

/// Agent 模型配置
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct AgentModelConfig {
    /// 主模型 (格式: provider/model-id)
    #[serde(default)]
    pub primary: Option<String>,
}

/// 模型配置
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ModelsConfig {
    /// Provider 配置映射
    #[serde(default)]
    pub providers: HashMap<String, ProviderConfig>,
}

/// Provider 配置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProviderConfig {
    /// API 地址
    #[serde(rename = "baseUrl")]
    pub base_url: String,
    /// API Key
    #[serde(rename = "apiKey")]
    pub api_key: Option<String>,
    /// 模型列表
    #[serde(default)]
    pub models: Vec<ModelConfig>,
}

/// 模型配置详情
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelConfig {
    /// 模型 ID
    pub id: String,
    /// 显示名称
    pub name: String,
    /// API 类型 (anthropic-messages / openai-completions)
    #[serde(default)]
    pub api: Option<String>,
    /// 支持的输入类型
    #[serde(default)]
    pub input: Vec<String>,
    /// 上下文窗口大小
    #[serde(rename = "contextWindow", default)]
    pub context_window: Option<u32>,
    /// 最大输出 Token
    #[serde(rename = "maxTokens", default)]
    pub max_tokens: Option<u32>,
    /// 是否支持推理模式
    #[serde(default)]
    pub reasoning: Option<bool>,
    /// 成本配置
    #[serde(default)]
    pub cost: Option<ModelCostConfig>,
}

/// 模型成本配置
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ModelCostConfig {
    #[serde(default)]
    pub input: f64,
    #[serde(default)]
    pub output: f64,
    #[serde(rename = "cacheRead", default)]
    pub cache_read: f64,
    #[serde(rename = "cacheWrite", default)]
    pub cache_write: f64,
}

/// 网关配置
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct GatewayConfig {
    /// 模式：local 或 cloud
    #[serde(default)]
    pub mode: Option<String>,
    /// 认证配置
    #[serde(default)]
    pub auth: Option<GatewayAuthConfig>,
}

/// 网关认证配置
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct GatewayAuthConfig {
    #[serde(default)]
    pub mode: Option<String>,
    #[serde(default)]
    pub token: Option<String>,
}

/// 插件配置
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct PluginsConfig {
    #[serde(default)]
    pub allow: Vec<String>,
    #[serde(default)]
    pub entries: HashMap<String, serde_json::Value>,
    #[serde(default)]
    pub installs: HashMap<String, serde_json::Value>,
}

/// 元数据配置
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct MetaConfig {
    #[serde(rename = "lastTouchedAt", default)]
    pub last_touched_at: Option<String>,
    #[serde(rename = "lastTouchedVersion", default)]
    pub last_touched_version: Option<String>,
}

// ============ 前端展示用数据结构 ============

/// 官方 Provider 预设（用于前端展示）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OfficialProvider {
    /// Provider ID (用于配置中)
    pub id: String,
    /// 显示名称
    pub name: String,
    /// 图标（emoji）
    pub icon: String,
    /// 官方 API 地址
    pub default_base_url: Option<String>,
    /// API 类型
    pub api_type: String,
    /// 推荐模型列表
    pub suggested_models: Vec<SuggestedModel>,
    /// 是否需要 API Key
    pub requires_api_key: bool,
    /// 文档链接
    pub docs_url: Option<String>,
}

/// 推荐模型
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SuggestedModel {
    /// 模型 ID
    pub id: String,
    /// 显示名称
    pub name: String,
    /// 描述
    pub description: Option<String>,
    /// 上下文窗口
    pub context_window: Option<u32>,
    /// 最大输出
    pub max_tokens: Option<u32>,
    /// 是否推荐
    pub recommended: bool,
}

/// 已配置的 Provider（从配置文件读取）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConfiguredProvider {
    /// Provider 名称 (配置中的 key)
    pub name: String,
    /// API 地址
    pub base_url: String,
    /// API Key (脱敏显示)
    pub api_key_masked: Option<String>,
    /// 是否有 API Key
    pub has_api_key: bool,
    /// 配置的模型列表
    pub models: Vec<ConfiguredModel>,
}

/// 已配置的模型
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConfiguredModel {
    /// 完整模型 ID (provider/model-id)
    pub full_id: String,
    /// 模型 ID
    pub id: String,
    /// 显示名称
    pub name: String,
    /// API 类型
    pub api_type: Option<String>,
    /// 上下文窗口
    pub context_window: Option<u32>,
    /// 最大输出
    pub max_tokens: Option<u32>,
    /// 是否为主模型
    pub is_primary: bool,
}

/// AI 配置概览（返回给前端）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AIConfigOverview {
    /// 主模型
    pub primary_model: Option<String>,
    /// 已配置的 Provider 列表
    pub configured_providers: Vec<ConfiguredProvider>,
    /// 可用模型列表
    pub available_models: Vec<String>,
}

// ============ 旧数据结构保持兼容 ============

/// AI Provider 选项（用于前端展示）- 旧版兼容
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AIProviderOption {
    /// Provider ID
    pub id: String,
    /// 显示名称
    pub name: String,
    /// 图标（emoji）
    pub icon: String,
    /// 官方 API 地址
    pub default_base_url: Option<String>,
    /// 推荐模型列表
    pub models: Vec<AIModelOption>,
    /// 是否需要 API Key
    pub requires_api_key: bool,
}

/// AI 模型选项 - 旧版兼容
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AIModelOption {
    /// 模型 ID
    pub id: String,
    /// 显示名称
    pub name: String,
    /// 描述
    pub description: Option<String>,
    /// 是否推荐
    pub recommended: bool,
}

/// 渠道配置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChannelConfig {
    /// 渠道 ID
    pub id: String,
    /// 渠道类型
    pub channel_type: String,
    /// 是否启用
    pub enabled: bool,
    /// 配置详情
    pub config: HashMap<String, serde_json::Value>,
}

/// 单个渠道的运行总览
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChannelOverviewItem {
    /// 渠道 ID
    pub id: String,
    /// 渠道类型
    pub channel_type: String,
    /// 是否已配置
    pub configured: bool,
    /// 是否正在运行
    pub running: bool,
    /// 账号数量
    pub account_count: usize,
    /// 正在运行的账号数量
    pub running_account_count: usize,
    /// 连接模式（如 polling / websocket）
    pub mode: Option<String>,
    /// 最近错误
    pub last_error: Option<String>,
}

/// 渠道总览
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChannelsOverview {
    /// 所有渠道项
    pub channels: Vec<ChannelOverviewItem>,
    /// 已配置渠道数量
    pub configured_count: usize,
    /// 正在运行渠道数量
    pub running_count: usize,
    /// 是否处于多渠道共存模式
    pub coexistence_enabled: bool,
    /// 推荐作为当前关注渠道的 ID
    pub recommended_focus_channel: Option<String>,
    /// 后端返回的渠道顺序
    pub channel_order: Vec<String>,
    /// 是否成功获取了实时状态
    pub status_available: bool,
    /// 实时状态获取失败时的错误信息
    pub status_error: Option<String>,
}

/// 使用窗口
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UsageWindow {
    pub label: String,
    pub used_percent: u64,
    pub reset_at: Option<i64>,
}

/// Provider 使用情况
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProviderUsageItem {
    pub provider: String,
    pub display_name: String,
    pub plan: Option<String>,
    pub error: Option<String>,
    pub windows: Vec<UsageWindow>,
}

/// 会话使用情况
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionUsageItem {
    pub key: String,
    pub updated_at: i64,
    pub age_ms: Option<i64>,
    pub input_tokens: Option<u64>,
    pub output_tokens: Option<u64>,
    pub total_tokens: Option<u64>,
    pub context_tokens: Option<u64>,
    pub model: Option<String>,
    pub model_provider: Option<String>,
    pub kind: Option<String>,
}

/// 使用总览
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UsageOverview {
    pub updated_at: Option<i64>,
    pub providers: Vec<ProviderUsageItem>,
    pub sessions: Vec<SessionUsageItem>,
    pub total_sessions: usize,
    pub total_token_estimate: u64,
}

/// 定时任务调度器状态
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CronSchedulerStatus {
    pub enabled: bool,
    pub store_path: Option<String>,
    pub jobs: usize,
    pub next_wake_at_ms: Option<i64>,
}

/// 定时任务调度配置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CronJobSchedule {
    pub kind: String,
    pub expr: Option<String>,
    pub every: Option<String>,
    pub at: Option<String>,
    pub tz: Option<String>,
}

/// 定时任务载荷
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CronJobPayload {
    pub kind: String,
    pub message: Option<String>,
    pub text: Option<String>,
    pub model: Option<String>,
}

/// 定时任务运行状态
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CronJobState {
    pub next_run_at_ms: Option<i64>,
    pub last_run_at_ms: Option<i64>,
    pub last_status: Option<String>,
    pub last_run_status: Option<String>,
    pub last_duration_ms: Option<i64>,
    pub last_error: Option<String>,
    pub consecutive_errors: u64,
}

/// 定时任务投递配置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CronJobDelivery {
    pub mode: Option<String>,
    pub channel: Option<String>,
    pub to: Option<String>,
    pub account_id: Option<String>,
}

/// 定时任务
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CronJobItem {
    pub id: String,
    pub agent_id: Option<String>,
    pub name: String,
    pub description: Option<String>,
    pub enabled: bool,
    pub schedule: CronJobSchedule,
    pub payload: CronJobPayload,
    pub session_target: Option<String>,
    pub wake_mode: Option<String>,
    pub state: CronJobState,
    pub delivery: CronJobDelivery,
    pub created_at_ms: Option<i64>,
    pub updated_at_ms: Option<i64>,
}

/// 定时任务总览
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CronOverview {
    pub scheduler: Option<CronSchedulerStatus>,
    pub jobs: Vec<CronJobItem>,
}

/// 定时任务草稿（来自前端）
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CronJobDraft {
    pub id: Option<String>,
    pub name: String,
    pub description: String,
    pub schedule_type: String,
    pub schedule_value: String,
    pub timezone: String,
    pub payload_kind: String,
    pub message: String,
    pub model: String,
    pub session_target: String,
    pub enabled: bool,
    pub announce: bool,
    pub channel: String,
    pub to: String,
    pub account_id: String,
    pub wake_mode: String,
}

/// 环境变量配置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EnvConfig {
    pub key: String,
    pub value: String,
}
