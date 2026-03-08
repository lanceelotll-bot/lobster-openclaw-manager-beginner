use crate::models::{
    AIConfigOverview, ChannelConfig, ChannelOverviewItem, ChannelsOverview,
    CronJobDelivery, CronJobDraft, CronJobItem, CronJobPayload, CronJobSchedule, CronJobState,
    CronOverview, CronSchedulerStatus,
    ConfiguredModel, ConfiguredProvider, ModelConfig, OfficialProvider, SuggestedModel,
    ProviderUsageItem, SessionUsageItem, UsageOverview, UsageWindow,
};
use crate::utils::{file, platform, shell};
use log::{debug, error, info, warn};
use serde_json::{json, Value};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use tauri::command;

/// 获取 openclaw.json 配置
fn load_openclaw_config() -> Result<Value, String> {
    let config_path = platform::get_config_file_path();
    
    if !file::file_exists(&config_path) {
        return Ok(json!({}));
    }
    
    let content =
        file::read_file(&config_path).map_err(|e| format!("读取配置文件失败: {}", e))?;
    
    serde_json::from_str(&content).map_err(|e| format!("解析配置文件失败: {}", e))
}

/// 保存 openclaw.json 配置
fn save_openclaw_config(config: &Value) -> Result<(), String> {
    let config_path = platform::get_config_file_path();
    
    let content =
        serde_json::to_string_pretty(config).map_err(|e| format!("序列化配置失败: {}", e))?;
    
    file::write_file(&config_path, &content).map_err(|e| format!("写入配置文件失败: {}", e))
}

/// 获取完整配置
#[command]
pub async fn get_config() -> Result<Value, String> {
    info!("[获取配置] 读取 openclaw.json 配置...");
    let result = load_openclaw_config();
    match &result {
        Ok(_) => info!("[获取配置] ✓ 配置读取成功"),
        Err(e) => error!("[获取配置] ✗ 配置读取失败: {}", e),
    }
    result
}

/// 保存配置
#[command]
pub async fn save_config(config: Value) -> Result<String, String> {
    info!("[保存配置] 保存 openclaw.json 配置...");
    debug!(
        "[保存配置] 配置内容: {}",
        serde_json::to_string_pretty(&config).unwrap_or_default()
    );
    match save_openclaw_config(&config) {
        Ok(_) => {
            info!("[保存配置] ✓ 配置保存成功");
            Ok("配置已保存".to_string())
        }
        Err(e) => {
            error!("[保存配置] ✗ 配置保存失败: {}", e);
            Err(e)
        }
    }
}

/// 获取环境变量值
#[command]
pub async fn get_env_value(key: String) -> Result<Option<String>, String> {
    info!("[获取环境变量] 读取环境变量: {}", key);
    let env_path = platform::get_env_file_path();
    let value = file::read_env_value(&env_path, &key);
    match &value {
        Some(v) => debug!(
            "[获取环境变量] {}={} (已脱敏)",
            key,
            if v.len() > 8 { "***" } else { v }
        ),
        None => debug!("[获取环境变量] {} 不存在", key),
    }
    Ok(value)
}

/// 保存环境变量值
#[command]
pub async fn save_env_value(key: String, value: String) -> Result<String, String> {
    info!("[保存环境变量] 保存环境变量: {}", key);
    let env_path = platform::get_env_file_path();
    debug!("[保存环境变量] 环境文件路径: {}", env_path);
    
    match file::set_env_value(&env_path, &key, &value) {
        Ok(_) => {
            info!("[保存环境变量] ✓ 环境变量 {} 保存成功", key);
            Ok("环境变量已保存".to_string())
        }
        Err(e) => {
            error!("[保存环境变量] ✗ 保存失败: {}", e);
            Err(format!("保存环境变量失败: {}", e))
        }
    }
}

// ============ Gateway Token 命令 ============

/// 生成随机 token
fn generate_token() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    
    // 使用时间戳和随机数生成 token
    let random_part: u64 = (timestamp as u64) ^ 0x5DEECE66Du64;
    format!("{:016x}{:016x}{:016x}", 
        random_part, 
        random_part.wrapping_mul(0x5DEECE66Du64),
        timestamp as u64
    )
}

/// 获取或生成 Gateway Token
#[command]
pub async fn get_or_create_gateway_token() -> Result<String, String> {
    info!("[Gateway Token] 获取或创建 Gateway Token...");
    
    let mut config = load_openclaw_config()?;
    
    // 检查是否已有 token
    if let Some(token) = config
        .pointer("/gateway/auth/token")
        .and_then(|v| v.as_str())
    {
        if !token.is_empty() {
            info!("[Gateway Token] ✓ 使用现有 Token");
            return Ok(token.to_string());
        }
    }
    
    // 生成新 token
    let new_token = generate_token();
    info!("[Gateway Token] 生成新 Token: {}...", &new_token[..8]);
    
    // 确保路径存在
    if config.get("gateway").is_none() {
        config["gateway"] = json!({});
    }
    if config["gateway"].get("auth").is_none() {
        config["gateway"]["auth"] = json!({});
    }
    
    // 设置 token 和 mode
    config["gateway"]["auth"]["token"] = json!(new_token);
    config["gateway"]["auth"]["mode"] = json!("token");
    config["gateway"]["mode"] = json!("local");
    
    // 保存配置
    save_openclaw_config(&config)?;
    
    info!("[Gateway Token] ✓ Token 已保存到配置");
    Ok(new_token)
}

/// 获取 Dashboard URL（带 token）
fn score_dashboard_session(session: &Value) -> i64 {
    let key = session
        .get("key")
        .and_then(|value| value.as_str())
        .unwrap_or_default();
    let mut score = 0i64;

    let parts: Vec<&str> = key.split(':').collect();
    if parts.len() == 3 && parts.first() == Some(&"agent") && parts.last() == Some(&"main") {
        score += 120;
    }
    if session.get("kind").and_then(|value| value.as_str()) == Some("direct") {
        score += 40;
    }
    if !key.contains(":cron:") {
        score += 30;
    }
    if ["telegram", "whatsapp", "discord", "slack", "feishu", "imessage"]
        .iter()
        .any(|needle| key.contains(needle))
    {
        score -= 10;
    }

    score
}

fn encode_query_component(value: &str) -> String {
    let mut encoded = String::new();
    for byte in value.bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                encoded.push(byte as char);
            }
            _ => encoded.push_str(&format!("%{:02X}", byte)),
        }
    }
    encoded
}

fn get_preferred_dashboard_session_key() -> String {
    match shell::run_openclaw(&["sessions", "--json"]) {
        Ok(output) => match serde_json::from_str::<Value>(&output) {
            Ok(payload) => payload
                .get("sessions")
                .and_then(|value| value.as_array())
                .and_then(|sessions| {
                    sessions
                        .iter()
                        .filter_map(|session| {
                            let key = session.get("key").and_then(|value| value.as_str())?;
                            Some((
                                key.to_string(),
                                score_dashboard_session(session),
                                session.get("updatedAt").and_then(|value| value.as_i64()).unwrap_or(0),
                            ))
                        })
                        .max_by(|left, right| left.1.cmp(&right.1).then(left.2.cmp(&right.2)))
                        .map(|item| item.0)
                })
                .unwrap_or_else(|| "agent:main:main".to_string()),
            Err(error) => {
                warn!("[Dashboard URL] 解析 sessions --json 失败: {}", error);
                "agent:main:main".to_string()
            }
        },
        Err(error) => {
            warn!("[Dashboard URL] 获取 sessions --json 失败: {}", error);
            "agent:main:main".to_string()
        }
    }
}

#[command]
pub async fn get_dashboard_url() -> Result<String, String> {
    info!("[Dashboard URL] 获取 Dashboard URL...");
    
    let token = get_or_create_gateway_token().await?;
    let session_key = get_preferred_dashboard_session_key();
    let url = format!(
        "http://127.0.0.1:18789/chat?session={}&token={}",
        encode_query_component(&session_key),
        encode_query_component(&token)
    );
    
    info!("[Dashboard URL] ✓ URL: {}...", &url[..50.min(url.len())]);
    Ok(url)
}

// ============ AI 配置相关命令 ============

/// 获取官方 Provider 列表（预设模板）
#[command]
pub async fn get_official_providers() -> Result<Vec<OfficialProvider>, String> {
    info!("[官方 Provider] 获取官方 Provider 预设列表...");

    let providers = vec![
        OfficialProvider {
            id: "anthropic".to_string(),
            name: "Anthropic Claude".to_string(),
            icon: "🟣".to_string(),
            default_base_url: Some("https://api.anthropic.com".to_string()),
            api_type: "anthropic-messages".to_string(),
            requires_api_key: true,
            docs_url: Some("https://docs.openclaw.ai/providers/anthropic".to_string()),
            suggested_models: vec![
                SuggestedModel {
                    id: "claude-opus-4-5-20251101".to_string(),
                    name: "Claude Opus 4.5".to_string(),
                    description: Some("最强大版本，适合复杂任务".to_string()),
                    context_window: Some(200000),
                    max_tokens: Some(8192),
                    recommended: true,
                },
                SuggestedModel {
                    id: "claude-sonnet-4-5-20250929".to_string(),
                    name: "Claude Sonnet 4.5".to_string(),
                    description: Some("平衡版本，性价比高".to_string()),
                    context_window: Some(200000),
                    max_tokens: Some(8192),
                    recommended: false,
                },
            ],
        },
        OfficialProvider {
            id: "openai".to_string(),
            name: "OpenAI".to_string(),
            icon: "🟢".to_string(),
            default_base_url: Some("https://api.openai.com/v1".to_string()),
            api_type: "openai-completions".to_string(),
            requires_api_key: true,
            docs_url: Some("https://docs.openclaw.ai/providers/openai".to_string()),
            suggested_models: vec![
                SuggestedModel {
                    id: "gpt-4o".to_string(),
                    name: "GPT-4o".to_string(),
                    description: Some("最新多模态模型".to_string()),
                    context_window: Some(128000),
                    max_tokens: Some(4096),
                    recommended: true,
                },
                SuggestedModel {
                    id: "gpt-4o-mini".to_string(),
                    name: "GPT-4o Mini".to_string(),
                    description: Some("快速经济版".to_string()),
                    context_window: Some(128000),
                    max_tokens: Some(4096),
                    recommended: false,
                },
            ],
        },
        OfficialProvider {
            id: "moonshot".to_string(),
            name: "Moonshot".to_string(),
            icon: "🌙".to_string(),
            default_base_url: Some("https://api.moonshot.cn/v1".to_string()),
            api_type: "openai-completions".to_string(),
            requires_api_key: true,
            docs_url: Some("https://docs.openclaw.ai/providers/moonshot".to_string()),
            suggested_models: vec![
                SuggestedModel {
                    id: "kimi-k2.5".to_string(),
                    name: "Kimi K2.5".to_string(),
                    description: Some("最新旗舰模型".to_string()),
                    context_window: Some(200000),
                    max_tokens: Some(8192),
                    recommended: true,
                },
                SuggestedModel {
                    id: "moonshot-v1-128k".to_string(),
                    name: "Moonshot 128K".to_string(),
                    description: Some("超长上下文".to_string()),
                    context_window: Some(128000),
                    max_tokens: Some(8192),
                    recommended: false,
                },
            ],
        },
        OfficialProvider {
            id: "qwen".to_string(),
            name: "Qwen (通义千问)".to_string(),
            icon: "🔮".to_string(),
            default_base_url: Some("https://dashscope.aliyuncs.com/compatible-mode/v1".to_string()),
            api_type: "openai-completions".to_string(),
            requires_api_key: true,
            docs_url: Some("https://docs.openclaw.ai/providers/qwen".to_string()),
            suggested_models: vec![
                SuggestedModel {
                    id: "qwen-max".to_string(),
                    name: "Qwen Max".to_string(),
                    description: Some("最强大版本".to_string()),
                    context_window: Some(128000),
                    max_tokens: Some(8192),
                    recommended: true,
                },
                SuggestedModel {
                    id: "qwen-plus".to_string(),
                    name: "Qwen Plus".to_string(),
                    description: Some("平衡版本".to_string()),
                    context_window: Some(128000),
                    max_tokens: Some(8192),
                    recommended: false,
                },
            ],
        },
        OfficialProvider {
            id: "deepseek".to_string(),
            name: "DeepSeek".to_string(),
            icon: "🔵".to_string(),
            default_base_url: Some("https://api.deepseek.com".to_string()),
            api_type: "openai-completions".to_string(),
            requires_api_key: true,
            docs_url: None,
            suggested_models: vec![
                SuggestedModel {
                    id: "deepseek-chat".to_string(),
                    name: "DeepSeek V3".to_string(),
                    description: Some("最新对话模型".to_string()),
                    context_window: Some(128000),
                    max_tokens: Some(8192),
                    recommended: true,
                },
                SuggestedModel {
                    id: "deepseek-reasoner".to_string(),
                    name: "DeepSeek R1".to_string(),
                    description: Some("推理增强模型".to_string()),
                    context_window: Some(128000),
                    max_tokens: Some(8192),
                    recommended: false,
                },
            ],
        },
        OfficialProvider {
            id: "glm".to_string(),
            name: "GLM (智谱)".to_string(),
            icon: "🔷".to_string(),
            default_base_url: Some("https://open.bigmodel.cn/api/paas/v4".to_string()),
            api_type: "openai-completions".to_string(),
            requires_api_key: true,
            docs_url: Some("https://docs.openclaw.ai/providers/glm".to_string()),
            suggested_models: vec![
                SuggestedModel {
                    id: "glm-4".to_string(),
                    name: "GLM-4".to_string(),
                    description: Some("最新旗舰模型".to_string()),
                    context_window: Some(128000),
                    max_tokens: Some(8192),
                    recommended: true,
                },
            ],
        },
        OfficialProvider {
            id: "minimax".to_string(),
            name: "MiniMax".to_string(),
            icon: "🟡".to_string(),
            default_base_url: Some("https://api.minimax.io/anthropic".to_string()),
            api_type: "anthropic-messages".to_string(),
            requires_api_key: true,
            docs_url: Some("https://docs.openclaw.ai/providers/minimax".to_string()),
            suggested_models: vec![
                SuggestedModel {
                    id: "minimax-m2.1".to_string(),
                    name: "MiniMax M2.1".to_string(),
                    description: Some("最新模型".to_string()),
                    context_window: Some(200000),
                    max_tokens: Some(8192),
                    recommended: true,
                },
            ],
        },
        OfficialProvider {
            id: "venice".to_string(),
            name: "Venice AI".to_string(),
            icon: "🏛️".to_string(),
            default_base_url: Some("https://api.venice.ai/api/v1".to_string()),
            api_type: "openai-completions".to_string(),
            requires_api_key: true,
            docs_url: Some("https://docs.openclaw.ai/providers/venice".to_string()),
            suggested_models: vec![
                SuggestedModel {
                    id: "llama-3.3-70b".to_string(),
                    name: "Llama 3.3 70B".to_string(),
                    description: Some("隐私优先推理".to_string()),
                    context_window: Some(128000),
                    max_tokens: Some(8192),
                    recommended: true,
                },
            ],
        },
        OfficialProvider {
            id: "openrouter".to_string(),
            name: "OpenRouter".to_string(),
            icon: "🔄".to_string(),
            default_base_url: Some("https://openrouter.ai/api/v1".to_string()),
            api_type: "openai-completions".to_string(),
            requires_api_key: true,
            docs_url: Some("https://docs.openclaw.ai/providers/openrouter".to_string()),
            suggested_models: vec![
                SuggestedModel {
                    id: "anthropic/claude-opus-4-5".to_string(),
                    name: "Claude Opus 4.5".to_string(),
                    description: Some("通过 OpenRouter 访问".to_string()),
                    context_window: Some(200000),
                    max_tokens: Some(8192),
                    recommended: true,
                },
            ],
        },
        OfficialProvider {
            id: "ollama".to_string(),
            name: "Ollama (本地)".to_string(),
            icon: "🟠".to_string(),
            default_base_url: Some("http://localhost:11434".to_string()),
            api_type: "openai-completions".to_string(),
            requires_api_key: false,
            docs_url: Some("https://docs.openclaw.ai/providers/ollama".to_string()),
            suggested_models: vec![
                SuggestedModel {
                    id: "llama3".to_string(),
                    name: "Llama 3".to_string(),
                    description: Some("本地运行".to_string()),
                    context_window: Some(8192),
                    max_tokens: Some(4096),
                    recommended: true,
                },
            ],
        },
    ];

    info!(
        "[官方 Provider] ✓ 返回 {} 个官方 Provider 预设",
        providers.len()
    );
    Ok(providers)
}

/// 获取 AI 配置概览
#[command]
pub async fn get_ai_config() -> Result<AIConfigOverview, String> {
    info!("[AI 配置] 获取 AI 配置概览...");

    let config_path = platform::get_config_file_path();
    info!("[AI 配置] 配置文件路径: {}", config_path);

    let config = load_openclaw_config()?;
    debug!("[AI 配置] 配置内容: {}", serde_json::to_string_pretty(&config).unwrap_or_default());

    // 解析主模型
    let primary_model = config
        .pointer("/agents/defaults/model/primary")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    info!("[AI 配置] 主模型: {:?}", primary_model);

    // 解析可用模型列表
    let available_models: Vec<String> = config
        .pointer("/agents/defaults/models")
        .and_then(|v| v.as_object())
        .map(|obj| obj.keys().cloned().collect())
        .unwrap_or_default();
    info!("[AI 配置] 可用模型数: {}", available_models.len());

    // 解析已配置的 Provider
    let mut configured_providers: Vec<ConfiguredProvider> = Vec::new();

    let providers_value = config.pointer("/models/providers");
    info!("[AI 配置] providers 节点存在: {}", providers_value.is_some());

    if let Some(providers) = providers_value.and_then(|v| v.as_object()) {
        info!("[AI 配置] 找到 {} 个 Provider", providers.len());
        
        for (provider_name, provider_config) in providers {
            info!("[AI 配置] 解析 Provider: {}", provider_name);
            
            let base_url = provider_config
                .get("baseUrl")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();

            let api_key = provider_config
                .get("apiKey")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());

            let api_key_masked = api_key.as_ref().map(|key| {
                if key.len() > 8 {
                    format!("{}...{}", &key[..4], &key[key.len() - 4..])
                } else {
                    "****".to_string()
                }
            });

            // 解析模型列表
            let models_array = provider_config.get("models").and_then(|v| v.as_array());
            info!("[AI 配置] Provider {} 的 models 数组: {:?}", provider_name, models_array.map(|a| a.len()));
            
            let models: Vec<ConfiguredModel> = models_array
                .map(|arr| {
                    arr.iter()
                        .filter_map(|m| {
                            let id = m.get("id")?.as_str()?.to_string();
                            let name = m
                                .get("name")
                                .and_then(|v| v.as_str())
                                .unwrap_or(&id)
                                .to_string();
                            let full_id = format!("{}/{}", provider_name, id);
                            let is_primary = primary_model.as_ref() == Some(&full_id);

                            info!("[AI 配置] 解析模型: {} (is_primary: {})", full_id, is_primary);

                            Some(ConfiguredModel {
                                full_id,
                                id,
                                name,
                                api_type: m.get("api").and_then(|v| v.as_str()).map(|s| s.to_string()),
                                context_window: m
                                    .get("contextWindow")
                                    .and_then(|v| v.as_u64())
                                    .map(|n| n as u32),
                                max_tokens: m
                                    .get("maxTokens")
                                    .and_then(|v| v.as_u64())
                                    .map(|n| n as u32),
                                is_primary,
                            })
                        })
                        .collect()
                })
                .unwrap_or_default();

            info!("[AI 配置] Provider {} 解析完成: {} 个模型", provider_name, models.len());

            configured_providers.push(ConfiguredProvider {
                name: provider_name.clone(),
                base_url,
                api_key_masked,
                has_api_key: api_key.is_some(),
                models,
            });
        }
    } else {
        info!("[AI 配置] 未找到 providers 配置或格式不正确");
    }

    info!(
        "[AI 配置] ✓ 最终结果 - 主模型: {:?}, {} 个 Provider, {} 个可用模型",
        primary_model,
        configured_providers.len(),
        available_models.len()
    );

    Ok(AIConfigOverview {
        primary_model,
        configured_providers,
        available_models,
    })
}

/// 添加或更新 Provider
#[command]
pub async fn save_provider(
    provider_name: String,
    base_url: String,
    api_key: Option<String>,
    api_type: String,
    models: Vec<ModelConfig>,
) -> Result<String, String> {
    info!(
        "[保存 Provider] 保存 Provider: {} ({} 个模型)",
        provider_name,
        models.len()
    );

    let mut config = load_openclaw_config()?;

    // 确保路径存在
    if config.get("models").is_none() {
        config["models"] = json!({});
    }
    if config["models"].get("providers").is_none() {
        config["models"]["providers"] = json!({});
    }
    if config.get("agents").is_none() {
        config["agents"] = json!({});
    }
    if config["agents"].get("defaults").is_none() {
        config["agents"]["defaults"] = json!({});
    }
    if config["agents"]["defaults"].get("models").is_none() {
        config["agents"]["defaults"]["models"] = json!({});
    }

    // 构建模型配置
    let models_json: Vec<Value> = models
        .iter()
        .map(|m| {
            let mut model_obj = json!({
                "id": m.id,
                "name": m.name,
                "api": m.api.clone().unwrap_or(api_type.clone()),
                "input": if m.input.is_empty() { vec!["text".to_string()] } else { m.input.clone() },
            });

            if let Some(cw) = m.context_window {
                model_obj["contextWindow"] = json!(cw);
            }
            if let Some(mt) = m.max_tokens {
                model_obj["maxTokens"] = json!(mt);
            }
            if let Some(r) = m.reasoning {
                model_obj["reasoning"] = json!(r);
            }
            if let Some(cost) = &m.cost {
                model_obj["cost"] = json!({
                    "input": cost.input,
                    "output": cost.output,
                    "cacheRead": cost.cache_read,
                    "cacheWrite": cost.cache_write,
                });
            } else {
                model_obj["cost"] = json!({
                    "input": 0,
                    "output": 0,
                    "cacheRead": 0,
                    "cacheWrite": 0,
                });
            }

            model_obj
        })
        .collect();

    // 构建 Provider 配置
    let mut provider_config = json!({
        "baseUrl": base_url,
        "models": models_json,
    });

    // 处理 API Key：如果传入了新的非空 key，使用新的；否则保留原有的
    if let Some(key) = api_key {
        if !key.is_empty() {
            // 使用新传入的 API Key
            provider_config["apiKey"] = json!(key);
            info!("[保存 Provider] 使用新的 API Key");
        } else {
            // 空字符串表示不更改，尝试保留原有的 API Key
            if let Some(existing_key) = config
                .pointer(&format!("/models/providers/{}/apiKey", provider_name))
                .and_then(|v| v.as_str())
            {
                provider_config["apiKey"] = json!(existing_key);
                info!("[保存 Provider] 保留原有的 API Key");
            }
        }
    } else {
        // None 表示不更改，尝试保留原有的 API Key
        if let Some(existing_key) = config
            .pointer(&format!("/models/providers/{}/apiKey", provider_name))
            .and_then(|v| v.as_str())
        {
            provider_config["apiKey"] = json!(existing_key);
            info!("[保存 Provider] 保留原有的 API Key");
        }
    }

    // 保存 Provider 配置
    config["models"]["providers"][&provider_name] = provider_config;

    // 将模型添加到 agents.defaults.models
    for model in &models {
        let full_id = format!("{}/{}", provider_name, model.id);
        config["agents"]["defaults"]["models"][&full_id] = json!({});
    }

    // 更新元数据
    let now = chrono::Utc::now().to_rfc3339();
    if config.get("meta").is_none() {
        config["meta"] = json!({});
    }
    config["meta"]["lastTouchedAt"] = json!(now);

    save_openclaw_config(&config)?;
    info!("[保存 Provider] ✓ Provider {} 保存成功", provider_name);

    Ok(format!("Provider {} 已保存", provider_name))
}

/// 删除 Provider
#[command]
pub async fn delete_provider(provider_name: String) -> Result<String, String> {
    info!("[删除 Provider] 删除 Provider: {}", provider_name);

    let mut config = load_openclaw_config()?;

    // 删除 Provider 配置
    if let Some(providers) = config
        .pointer_mut("/models/providers")
        .and_then(|v| v.as_object_mut())
    {
        providers.remove(&provider_name);
    }

    // 删除相关模型
    if let Some(models) = config
        .pointer_mut("/agents/defaults/models")
        .and_then(|v| v.as_object_mut())
    {
        let keys_to_remove: Vec<String> = models
            .keys()
            .filter(|k| k.starts_with(&format!("{}/", provider_name)))
            .cloned()
            .collect();

        for key in keys_to_remove {
            models.remove(&key);
        }
    }

    // 如果主模型属于该 Provider，清除主模型
    if let Some(primary) = config
        .pointer("/agents/defaults/model/primary")
        .and_then(|v| v.as_str())
    {
        if primary.starts_with(&format!("{}/", provider_name)) {
            config["agents"]["defaults"]["model"]["primary"] = json!(null);
        }
    }

    save_openclaw_config(&config)?;
    info!("[删除 Provider] ✓ Provider {} 已删除", provider_name);

    Ok(format!("Provider {} 已删除", provider_name))
}

/// 设置主模型
#[command]
pub async fn set_primary_model(model_id: String) -> Result<String, String> {
    info!("[设置主模型] 设置主模型: {}", model_id);

    let mut config = load_openclaw_config()?;

    // 确保路径存在
    if config.get("agents").is_none() {
        config["agents"] = json!({});
    }
    if config["agents"].get("defaults").is_none() {
        config["agents"]["defaults"] = json!({});
    }
    if config["agents"]["defaults"].get("model").is_none() {
        config["agents"]["defaults"]["model"] = json!({});
    }

    // 设置主模型
    config["agents"]["defaults"]["model"]["primary"] = json!(model_id);

    save_openclaw_config(&config)?;
    info!("[设置主模型] ✓ 主模型已设置为: {}", model_id);

    Ok(format!("主模型已设置为 {}", model_id))
}

/// 添加模型到可用列表
#[command]
pub async fn add_available_model(model_id: String) -> Result<String, String> {
    info!("[添加模型] 添加模型到可用列表: {}", model_id);

    let mut config = load_openclaw_config()?;

    // 确保路径存在
    if config.get("agents").is_none() {
        config["agents"] = json!({});
    }
    if config["agents"].get("defaults").is_none() {
        config["agents"]["defaults"] = json!({});
    }
    if config["agents"]["defaults"].get("models").is_none() {
        config["agents"]["defaults"]["models"] = json!({});
    }

    // 添加模型
    config["agents"]["defaults"]["models"][&model_id] = json!({});

    save_openclaw_config(&config)?;
    info!("[添加模型] ✓ 模型 {} 已添加", model_id);

    Ok(format!("模型 {} 已添加", model_id))
}

/// 从可用列表移除模型
#[command]
pub async fn remove_available_model(model_id: String) -> Result<String, String> {
    info!("[移除模型] 从可用列表移除模型: {}", model_id);

    let mut config = load_openclaw_config()?;

    if let Some(models) = config
        .pointer_mut("/agents/defaults/models")
        .and_then(|v| v.as_object_mut())
    {
        models.remove(&model_id);
    }

    save_openclaw_config(&config)?;
    info!("[移除模型] ✓ 模型 {} 已移除", model_id);

    Ok(format!("模型 {} 已移除", model_id))
}

// ============ 旧版兼容 ============

/// 获取所有支持的 AI Provider（旧版兼容）
#[command]
pub async fn get_ai_providers() -> Result<Vec<crate::models::AIProviderOption>, String> {
    info!("[AI Provider] 获取支持的 AI Provider 列表（旧版）...");

    let official = get_official_providers().await?;
    let providers: Vec<crate::models::AIProviderOption> = official
        .into_iter()
        .map(|p| crate::models::AIProviderOption {
            id: p.id,
            name: p.name,
            icon: p.icon,
            default_base_url: p.default_base_url,
            requires_api_key: p.requires_api_key,
            models: p
                .suggested_models
                .into_iter()
                .map(|m| crate::models::AIModelOption {
                    id: m.id,
                    name: m.name,
                    description: m.description,
                    recommended: m.recommended,
                })
                .collect(),
        })
        .collect();

    Ok(providers)
}

// ============ 渠道配置 ============

/// 获取渠道配置 - 从 openclaw.json 和 env 文件读取
#[command]
pub async fn get_channels_config() -> Result<Vec<ChannelConfig>, String> {
    info!("[渠道配置] 获取渠道配置列表...");
    
    let config = load_openclaw_config()?;
    let channels_obj = config.get("channels").cloned().unwrap_or(json!({}));
    let env_path = platform::get_env_file_path();
    debug!("[渠道配置] 环境文件路径: {}", env_path);
    
    let mut channels = Vec::new();
    
    // 支持的渠道类型列表及其测试字段
    let channel_types = vec![
        ("telegram", "telegram", vec!["userId"]),
        ("discord", "discord", vec!["testChannelId"]),
        ("slack", "slack", vec!["testChannelId"]),
        ("feishu", "feishu", vec!["testChatId"]),
        ("whatsapp", "whatsapp", vec![]),
        ("imessage", "imessage", vec![]),
        ("wechat", "wechat", vec![]),
        ("dingtalk", "dingtalk", vec![]),
    ];
    
    for (channel_id, channel_type, test_fields) in channel_types {
        let channel_config = channels_obj.get(channel_id);
        
        let enabled = channel_config
            .and_then(|c| c.get("enabled"))
            .and_then(|v| v.as_bool())
            .unwrap_or(false);
        
        // 将渠道配置转换为 HashMap
        let mut config_map: HashMap<String, Value> = if let Some(cfg) = channel_config {
            if let Some(obj) = cfg.as_object() {
                obj.iter()
                    .filter(|(k, _)| *k != "enabled") // 排除 enabled 字段
                    .map(|(k, v)| (k.clone(), v.clone()))
                    .collect()
            } else {
                HashMap::new()
            }
        } else {
            HashMap::new()
        };
        
        // 从 env 文件读取测试字段
        for field in test_fields {
            let env_key = format!(
                "OPENCLAW_{}_{}",
                channel_id.to_uppercase(),
                field.to_uppercase()
            );
            if let Some(value) = file::read_env_value(&env_path, &env_key) {
                config_map.insert(field.to_string(), json!(value));
            }
        }
        
        // 判断是否已配置（有任何非空配置项）
        let has_config = !config_map.is_empty() || enabled;
        
        channels.push(ChannelConfig {
            id: channel_id.to_string(),
            channel_type: channel_type.to_string(),
            enabled: has_config,
            config: config_map,
        });
    }
    
    info!("[渠道配置] ✓ 返回 {} 个渠道配置", channels.len());
    for ch in &channels {
        debug!("[渠道配置] - {}: enabled={}", ch.id, ch.enabled);
    }
    Ok(channels)
}

/// 获取渠道运行总览 - 合并静态配置和实时状态
#[command]
pub async fn get_channels_overview() -> Result<ChannelsOverview, String> {
    info!("[渠道总览] 获取渠道总览...");

    let channels = get_channels_config().await?;
    let status_result = shell::run_openclaw(&["channels", "status", "--json"]);

    let (status_available, status_error, status_payload) = match status_result {
        Ok(output) => match serde_json::from_str::<Value>(&output) {
            Ok(payload) => (true, None, Some(payload)),
            Err(error) => {
                warn!("[渠道总览] 解析 channels status 输出失败: {}", error);
                (false, Some(format!("解析实时状态失败: {}", error)), None)
            }
        },
        Err(error) => {
            warn!("[渠道总览] 获取 channels status 失败: {}", error);
            (false, Some(error), None)
        }
    };

    let status_channels = status_payload
        .as_ref()
        .and_then(|value| value.get("channels"))
        .and_then(|value| value.as_object());
    let channel_accounts = status_payload
        .as_ref()
        .and_then(|value| value.get("channelAccounts"))
        .and_then(|value| value.as_object());
    let channel_order: Vec<String> = status_payload
        .as_ref()
        .and_then(|value| value.get("channelOrder"))
        .and_then(|value| value.as_array())
        .map(|items| {
            items
                .iter()
                .filter_map(|item| item.as_str().map(|value| value.to_string()))
                .collect()
        })
        .unwrap_or_default();

    let items: Vec<ChannelOverviewItem> = channels
        .into_iter()
        .map(|channel| {
            let status_item = status_channels.and_then(|items| items.get(&channel.id));
            let accounts = channel_accounts
                .and_then(|items| items.get(&channel.id))
                .and_then(|value| value.as_array());

            let account_count = accounts.map(|items| items.len()).unwrap_or(0);
            let running_account_count = accounts
                .map(|items| {
                    items
                        .iter()
                        .filter(|item| {
                            item.get("running")
                                .and_then(|value| value.as_bool())
                                .unwrap_or(false)
                        })
                        .count()
                })
                .unwrap_or(0);

            let configured = channel.enabled
                || status_item
                    .and_then(|item| item.get("configured"))
                    .and_then(|value| value.as_bool())
                    .unwrap_or(false);
            let running = status_item
                .and_then(|item| item.get("running"))
                .and_then(|value| value.as_bool())
                .unwrap_or(false)
                || running_account_count > 0;

            ChannelOverviewItem {
                id: channel.id.clone(),
                channel_type: channel.channel_type,
                configured,
                running,
                account_count,
                running_account_count,
                mode: status_item
                    .and_then(|item| item.get("mode"))
                    .and_then(|value| value.as_str())
                    .map(|value| value.to_string()),
                last_error: status_item
                    .and_then(|item| item.get("lastError"))
                    .and_then(|value| value.as_str())
                    .map(|value| value.to_string()),
            }
        })
        .collect();

    let configured_count = items.iter().filter(|item| item.configured).count();
    let running_count = items.iter().filter(|item| item.running).count();
    let recommended_focus_channel = items
        .iter()
        .find(|item| item.running)
        .or_else(|| items.iter().find(|item| item.configured))
        .map(|item| item.id.clone());

    Ok(ChannelsOverview {
        channels: items,
        configured_count,
        running_count,
        coexistence_enabled: configured_count > 1,
        recommended_focus_channel,
        channel_order,
        status_available,
        status_error,
    })
}

fn value_as_string(value: Option<&Value>) -> Option<String> {
    value
        .and_then(|value| value.as_str())
        .map(|value| value.trim())
        .filter(|value| !value.is_empty())
        .map(|value| value.to_string())
}

fn value_as_i64(value: Option<&Value>) -> Option<i64> {
    value
        .and_then(|value| value.as_i64().or_else(|| value.as_u64().and_then(|n| {
            if n <= i64::MAX as u64 {
                Some(n as i64)
            } else {
                None
            }
        })))
}

fn value_as_u64(value: Option<&Value>) -> Option<u64> {
    value.and_then(|value| value.as_u64())
}

fn parse_usage_window(value: &Value) -> Option<UsageWindow> {
    Some(UsageWindow {
        label: value.get("label")?.as_str()?.to_string(),
        used_percent: value.get("usedPercent").and_then(|item| item.as_u64()).unwrap_or(0),
        reset_at: value_as_i64(value.get("resetAt")),
    })
}

fn parse_provider_usage_item(value: &Value) -> Option<ProviderUsageItem> {
    let provider = value.get("provider")?.as_str()?.to_string();
    let display_name = value
        .get("displayName")
        .and_then(|item| item.as_str())
        .unwrap_or(&provider)
        .to_string();
    let windows = value
        .get("windows")
        .and_then(|item| item.as_array())
        .map(|items| items.iter().filter_map(parse_usage_window).collect())
        .unwrap_or_default();

    Some(ProviderUsageItem {
        provider,
        display_name,
        plan: value_as_string(value.get("plan")),
        error: value_as_string(value.get("error")),
        windows,
    })
}

fn is_visible_usage_session(key: &str) -> bool {
    !key.contains(":run:")
}

fn parse_session_usage_item(value: &Value) -> Option<SessionUsageItem> {
    let key = value.get("key")?.as_str()?.to_string();
    if !is_visible_usage_session(&key) {
        return None;
    }

    Some(SessionUsageItem {
        key,
        updated_at: value_as_i64(value.get("updatedAt")).unwrap_or(0),
        age_ms: value_as_i64(value.get("ageMs")),
        input_tokens: value_as_u64(value.get("inputTokens")),
        output_tokens: value_as_u64(value.get("outputTokens")),
        total_tokens: value_as_u64(value.get("totalTokens")),
        context_tokens: value_as_u64(value.get("contextTokens")),
        model: value_as_string(value.get("model")),
        model_provider: value_as_string(value.get("modelProvider")),
        kind: value_as_string(value.get("kind")),
    })
}

/// 获取 token / 会话使用情况
#[command]
pub async fn get_usage_overview() -> Result<UsageOverview, String> {
    info!("[使用情况] 获取 provider 与会话消耗情况...");

    let channels_list_result = shell::run_openclaw(&["channels", "list", "--json"]);
    let sessions_result = shell::run_openclaw(&["sessions", "--json"]);

    let mut updated_at = None;
    let mut providers: Vec<ProviderUsageItem> = Vec::new();
    let mut sessions: Vec<SessionUsageItem> = Vec::new();

    match channels_list_result {
        Ok(output) => match serde_json::from_str::<Value>(&output) {
            Ok(payload) => {
                updated_at = value_as_i64(payload.pointer("/usage/updatedAt"));
                providers = payload
                    .pointer("/usage/providers")
                    .and_then(|value| value.as_array())
                    .map(|items| items.iter().filter_map(parse_provider_usage_item).collect())
                    .unwrap_or_default();
            }
            Err(error) => {
                warn!("[使用情况] 解析 channels list 输出失败: {}", error);
            }
        },
        Err(error) => {
            warn!("[使用情况] 获取 channels list 失败: {}", error);
        }
    }

    match sessions_result {
        Ok(output) => match serde_json::from_str::<Value>(&output) {
            Ok(payload) => {
                sessions = payload
                    .get("sessions")
                    .and_then(|value| value.as_array())
                    .map(|items| items.iter().filter_map(parse_session_usage_item).collect())
                    .unwrap_or_default();
                sessions.sort_by(|left, right| right.updated_at.cmp(&left.updated_at));
            }
            Err(error) => {
                warn!("[使用情况] 解析 sessions 输出失败: {}", error);
            }
        },
        Err(error) => {
            warn!("[使用情况] 获取 sessions 失败: {}", error);
        }
    }

    if providers.is_empty() && sessions.is_empty() {
        return Err("未能获取使用情况，请确认 OpenClaw CLI 可用".to_string());
    }

    let total_token_estimate = sessions
        .iter()
        .filter_map(|session| session.total_tokens)
        .sum();

    Ok(UsageOverview {
        updated_at,
        total_sessions: sessions.len(),
        total_token_estimate,
        providers,
        sessions,
    })
}

fn parse_cron_schedule(value: Option<&Value>) -> CronJobSchedule {
    CronJobSchedule {
        kind: value_as_string(value.and_then(|item| item.get("kind")))
            .unwrap_or_else(|| "cron".to_string()),
        expr: value_as_string(value.and_then(|item| item.get("expr"))),
        every: value_as_string(value.and_then(|item| item.get("every"))),
        at: value_as_string(value.and_then(|item| item.get("at"))),
        tz: value_as_string(value.and_then(|item| item.get("tz"))),
    }
}

fn parse_cron_payload(value: Option<&Value>) -> CronJobPayload {
    CronJobPayload {
        kind: value_as_string(value.and_then(|item| item.get("kind")))
            .unwrap_or_else(|| "agentTurn".to_string()),
        message: value_as_string(value.and_then(|item| item.get("message"))),
        text: value_as_string(value.and_then(|item| item.get("text"))),
        model: value_as_string(value.and_then(|item| item.get("model"))),
    }
}

fn parse_cron_state(value: Option<&Value>) -> CronJobState {
    CronJobState {
        next_run_at_ms: value_as_i64(value.and_then(|item| item.get("nextRunAtMs"))),
        last_run_at_ms: value_as_i64(value.and_then(|item| item.get("lastRunAtMs"))),
        last_status: value_as_string(value.and_then(|item| item.get("lastStatus"))),
        last_run_status: value_as_string(value.and_then(|item| item.get("lastRunStatus"))),
        last_duration_ms: value_as_i64(value.and_then(|item| item.get("lastDurationMs"))),
        last_error: value_as_string(value.and_then(|item| item.get("lastError"))),
        consecutive_errors: value_as_u64(value.and_then(|item| item.get("consecutiveErrors")))
            .unwrap_or(0),
    }
}

fn parse_cron_delivery(value: Option<&Value>) -> CronJobDelivery {
    CronJobDelivery {
        mode: value_as_string(value.and_then(|item| item.get("mode"))),
        channel: value_as_string(value.and_then(|item| item.get("channel"))),
        to: value_as_string(value.and_then(|item| item.get("to"))),
        account_id: value_as_string(value.and_then(|item| item.get("accountId"))),
    }
}

fn parse_cron_job_item(value: &Value) -> Option<CronJobItem> {
    Some(CronJobItem {
        id: value.get("id")?.as_str()?.to_string(),
        agent_id: value_as_string(value.get("agentId")),
        name: value
            .get("name")
            .and_then(|item| item.as_str())
            .unwrap_or("未命名任务")
            .to_string(),
        description: value_as_string(value.get("description")),
        enabled: value.get("enabled").and_then(|item| item.as_bool()).unwrap_or(true),
        schedule: parse_cron_schedule(value.get("schedule")),
        payload: parse_cron_payload(value.get("payload")),
        session_target: value_as_string(value.get("sessionTarget")),
        wake_mode: value_as_string(value.get("wakeMode")),
        state: parse_cron_state(value.get("state")),
        delivery: parse_cron_delivery(value.get("delivery")),
        created_at_ms: value_as_i64(value.get("createdAtMs")),
        updated_at_ms: value_as_i64(value.get("updatedAtMs")),
    })
}

/// 获取定时任务总览
#[command]
pub async fn get_cron_overview() -> Result<CronOverview, String> {
    info!("[定时任务] 获取定时任务总览...");

    let status_result = shell::run_openclaw(&["cron", "status", "--json"]);
    let list_result = shell::run_openclaw(&["cron", "list", "--json"]);

    let scheduler = match status_result {
        Ok(output) => match serde_json::from_str::<Value>(&output) {
            Ok(payload) => Some(CronSchedulerStatus {
                enabled: payload.get("enabled").and_then(|value| value.as_bool()).unwrap_or(true),
                store_path: value_as_string(payload.get("storePath")),
                jobs: payload.get("jobs").and_then(|value| value.as_u64()).unwrap_or(0) as usize,
                next_wake_at_ms: value_as_i64(payload.get("nextWakeAtMs")),
            }),
            Err(error) => {
                warn!("[定时任务] 解析 cron status 输出失败: {}", error);
                None
            }
        },
        Err(error) => {
            warn!("[定时任务] 获取 cron status 失败: {}", error);
            None
        }
    };

    let jobs = match list_result {
        Ok(output) => match serde_json::from_str::<Value>(&output) {
            Ok(payload) => payload
                .get("jobs")
                .and_then(|value| value.as_array())
                .map(|items| items.iter().filter_map(parse_cron_job_item).collect())
                .unwrap_or_default(),
            Err(error) => {
                warn!("[定时任务] 解析 cron list 输出失败: {}", error);
                Vec::new()
            }
        },
        Err(error) => {
            warn!("[定时任务] 获取 cron list 失败: {}", error);
            Vec::new()
        }
    };

    if scheduler.is_none() && jobs.is_empty() {
        return Err("未能获取定时任务，请确认 OpenClaw CLI 可用".to_string());
    }

    Ok(CronOverview { scheduler, jobs })
}

fn push_arg(args: &mut Vec<String>, flag: &str, value: &str) {
    let value = value.trim();
    if value.is_empty() {
        return;
    }
    args.push(flag.to_string());
    args.push(value.to_string());
}

fn build_cron_job_args(input: &CronJobDraft, is_edit: bool) -> Result<Vec<String>, String> {
    let mut args = Vec::new();

    let name = input.name.trim();
    let schedule_value = input.schedule_value.trim();
    let message = input.message.trim();

    if name.is_empty() {
        return Err("请填写任务名称".to_string());
    }
    if schedule_value.is_empty() {
        return Err("请填写触发时间".to_string());
    }
    if message.is_empty() {
        return Err(match input.payload_kind.as_str() {
            "systemEvent" => "请填写系统事件内容".to_string(),
            _ => "请填写任务消息".to_string(),
        });
    }

    push_arg(&mut args, "--name", name);
    push_arg(&mut args, "--description", input.description.trim());

    match input.schedule_type.as_str() {
        "cron" => {
            push_arg(&mut args, "--cron", schedule_value);
            push_arg(&mut args, "--tz", input.timezone.trim());
        }
        "every" => push_arg(&mut args, "--every", schedule_value),
        "at" => push_arg(&mut args, "--at", schedule_value),
        _ => return Err("不支持的调度类型".to_string()),
    }

    match input.payload_kind.as_str() {
        "agentTurn" => {
            push_arg(&mut args, "--message", message);
            push_arg(&mut args, "--model", input.model.trim());
        }
        "systemEvent" => {
            push_arg(&mut args, "--system-event", message);
        }
        _ => return Err("不支持的任务载荷类型".to_string()),
    }

    push_arg(&mut args, "--session", input.session_target.trim());
    push_arg(&mut args, "--wake", input.wake_mode.trim());

    if input.announce {
        args.push("--announce".to_string());
    } else {
        args.push("--no-deliver".to_string());
    }

    push_arg(&mut args, "--channel", input.channel.trim());
    push_arg(&mut args, "--to", input.to.trim());
    push_arg(&mut args, "--account", input.account_id.trim());

    if is_edit {
        args.push(if input.enabled {
            "--enable".to_string()
        } else {
            "--disable".to_string()
        });
    } else if !input.enabled {
        args.push("--disabled".to_string());
    }

    Ok(args)
}

fn run_openclaw_owned(args: Vec<String>) -> Result<String, String> {
    let owned_refs: Vec<&str> = args.iter().map(String::as_str).collect();
    shell::run_openclaw(&owned_refs)
}

/// 创建定时任务
#[command]
pub async fn create_cron_job(input: CronJobDraft) -> Result<String, String> {
    info!("[定时任务] 创建定时任务: {}", input.name);
    let mut args = vec!["cron".to_string(), "add".to_string()];
    args.extend(build_cron_job_args(&input, false)?);
    run_openclaw_owned(args)?;
    Ok("定时任务已创建".to_string())
}

/// 更新定时任务
#[command]
pub async fn update_cron_job(input: CronJobDraft) -> Result<String, String> {
    let job_id = input.id.clone().unwrap_or_default();
    if job_id.trim().is_empty() {
        return Err("缺少任务 ID".to_string());
    }

    info!("[定时任务] 更新定时任务: {}", job_id);
    let mut args = vec!["cron".to_string(), "edit".to_string(), job_id];
    args.extend(build_cron_job_args(&input, true)?);
    run_openclaw_owned(args)?;
    Ok("定时任务已更新".to_string())
}

/// 启用定时任务
#[command]
pub async fn enable_cron_job(job_id: String) -> Result<String, String> {
    info!("[定时任务] 启用定时任务: {}", job_id);
    shell::run_openclaw(&["cron", "enable", &job_id])?;
    Ok("定时任务已启用".to_string())
}

/// 停用定时任务
#[command]
pub async fn disable_cron_job(job_id: String) -> Result<String, String> {
    info!("[定时任务] 停用定时任务: {}", job_id);
    shell::run_openclaw(&["cron", "disable", &job_id])?;
    Ok("定时任务已停用".to_string())
}

/// 立即运行定时任务
#[command]
pub async fn run_cron_job(job_id: String) -> Result<String, String> {
    info!("[定时任务] 立即运行定时任务: {}", job_id);
    shell::run_openclaw(&["cron", "run", &job_id])?;
    Ok("定时任务已手动触发".to_string())
}

/// 删除定时任务
#[command]
pub async fn remove_cron_job(job_id: String) -> Result<String, String> {
    info!("[定时任务] 删除定时任务: {}", job_id);
    shell::run_openclaw(&["cron", "rm", &job_id])?;
    Ok("定时任务已删除".to_string())
}

/// 保存渠道配置 - 保存到 openclaw.json
#[command]
pub async fn save_channel_config(channel: ChannelConfig) -> Result<String, String> {
    info!(
        "[保存渠道配置] 保存渠道配置: {} ({})",
        channel.id, channel.channel_type
    );
    
    let mut config = load_openclaw_config()?;
    let env_path = platform::get_env_file_path();
    debug!("[保存渠道配置] 环境文件路径: {}", env_path);
    
    // 确保 channels 对象存在
    if config.get("channels").is_none() {
        config["channels"] = json!({});
    }
    
    // 确保 plugins 对象存在
    if config.get("plugins").is_none() {
        config["plugins"] = json!({
            "allow": [],
            "entries": {}
        });
    }
    if config["plugins"].get("allow").is_none() {
        config["plugins"]["allow"] = json!([]);
    }
    if config["plugins"].get("entries").is_none() {
        config["plugins"]["entries"] = json!({});
    }
    
    // 这些字段只用于测试，不保存到 openclaw.json，而是保存到 env 文件
    let test_only_fields = vec!["userId", "testChatId", "testChannelId"];
    
    // 构建渠道配置
    let mut channel_obj = json!({
        "enabled": true
    });
    
    // 添加渠道特定配置
    for (key, value) in &channel.config {
        if test_only_fields.contains(&key.as_str()) {
            // 保存到 env 文件
            let env_key = format!(
                "OPENCLAW_{}_{}",
                channel.id.to_uppercase(),
                key.to_uppercase()
            );
            if let Some(val_str) = value.as_str() {
                let _ = file::set_env_value(&env_path, &env_key, val_str);
            }
        } else {
            // 保存到 openclaw.json
            channel_obj[key] = value.clone();
        }
    }
    
    // 更新 channels 配置
    config["channels"][&channel.id] = channel_obj;
    
    // 更新 plugins.allow 数组 - 确保渠道在白名单中
    if let Some(allow_arr) = config["plugins"]["allow"].as_array_mut() {
        let channel_id_val = json!(&channel.id);
        if !allow_arr.contains(&channel_id_val) {
            allow_arr.push(channel_id_val);
        }
    }
    
    // 更新 plugins.entries - 确保插件已启用
    config["plugins"]["entries"][&channel.id] = json!({
        "enabled": true
    });
    
    // 保存配置
    info!("[保存渠道配置] 写入配置文件...");
    match save_openclaw_config(&config) {
        Ok(_) => {
            info!(
                "[保存渠道配置] ✓ {} 配置保存成功",
                channel.channel_type
            );
            Ok(format!("{} 配置已保存", channel.channel_type))
        }
        Err(e) => {
            error!("[保存渠道配置] ✗ 保存失败: {}", e);
            Err(e)
        }
    }
}

/// 清空渠道配置 - 从 openclaw.json 中删除指定渠道的配置
#[command]
pub async fn clear_channel_config(channel_id: String) -> Result<String, String> {
    info!("[清空渠道配置] 清空渠道配置: {}", channel_id);
    
    let mut config = load_openclaw_config()?;
    let env_path = platform::get_env_file_path();
    
    // 从 channels 对象中删除该渠道
    if let Some(channels) = config.get_mut("channels").and_then(|v| v.as_object_mut()) {
        channels.remove(&channel_id);
        info!("[清空渠道配置] 已从 channels 中删除: {}", channel_id);
    }
    
    // 从 plugins.allow 数组中删除
    if let Some(allow_arr) = config.pointer_mut("/plugins/allow").and_then(|v| v.as_array_mut()) {
        allow_arr.retain(|v| v.as_str() != Some(&channel_id));
        info!("[清空渠道配置] 已从 plugins.allow 中删除: {}", channel_id);
    }
    
    // 从 plugins.entries 中删除
    if let Some(entries) = config.pointer_mut("/plugins/entries").and_then(|v| v.as_object_mut()) {
        entries.remove(&channel_id);
        info!("[清空渠道配置] 已从 plugins.entries 中删除: {}", channel_id);
    }
    
    // 清除相关的环境变量
    let env_prefixes = vec![
        format!("OPENCLAW_{}_USERID", channel_id.to_uppercase()),
        format!("OPENCLAW_{}_TESTCHATID", channel_id.to_uppercase()),
        format!("OPENCLAW_{}_TESTCHANNELID", channel_id.to_uppercase()),
    ];
    for env_key in env_prefixes {
        let _ = file::remove_env_value(&env_path, &env_key);
    }
    
    // 保存配置
    match save_openclaw_config(&config) {
        Ok(_) => {
            info!("[清空渠道配置] ✓ {} 配置已清空", channel_id);
            Ok(format!("{} 配置已清空", channel_id))
        }
        Err(e) => {
            error!("[清空渠道配置] ✗ 清空失败: {}", e);
            Err(e)
        }
    }
}

// ============ 飞书插件管理 ============

/// 飞书插件状态
#[derive(Debug, Serialize, Deserialize)]
pub struct FeishuPluginStatus {
    pub installed: bool,
    pub version: Option<String>,
    pub plugin_name: Option<String>,
}

/// 检查飞书插件是否已安装
#[command]
pub async fn check_feishu_plugin() -> Result<FeishuPluginStatus, String> {
    info!("[飞书插件] 检查飞书插件安装状态...");
    
    // 执行 openclaw plugins list 命令
    match shell::run_openclaw(&["plugins", "list"]) {
        Ok(output) => {
            debug!("[飞书插件] plugins list 输出: {}", output);
            
            // 查找包含 feishu 的行（不区分大小写）
            let lines: Vec<&str> = output.lines().collect();
            let feishu_line = lines.iter().find(|line| {
                line.to_lowercase().contains("feishu")
            });
            
            if let Some(line) = feishu_line {
                info!("[飞书插件] ✓ 飞书插件已安装: {}", line);
                
                // 尝试解析版本号（通常格式为 "name@version" 或 "name version"）
                let version = if line.contains('@') {
                    line.split('@').last().map(|s| s.trim().to_string())
                } else {
                    // 尝试匹配版本号模式 (如 0.1.2)
                    let parts: Vec<&str> = line.split_whitespace().collect();
                    parts.iter()
                        .find(|p| p.chars().next().map(|c| c.is_ascii_digit()).unwrap_or(false))
                        .map(|s| s.to_string())
                };
                
                Ok(FeishuPluginStatus {
                    installed: true,
                    version,
                    plugin_name: Some(line.trim().to_string()),
                })
            } else {
                info!("[飞书插件] ✗ 飞书插件未安装");
                Ok(FeishuPluginStatus {
                    installed: false,
                    version: None,
                    plugin_name: None,
                })
            }
        }
        Err(e) => {
            warn!("[飞书插件] 检查插件列表失败: {}", e);
            // 如果命令失败，假设插件未安装
            Ok(FeishuPluginStatus {
                installed: false,
                version: None,
                plugin_name: None,
            })
        }
    }
}

/// 安装飞书插件
#[command]
pub async fn install_feishu_plugin() -> Result<String, String> {
    info!("[飞书插件] 开始安装飞书插件...");
    
    // 先检查是否已安装
    let status = check_feishu_plugin().await?;
    if status.installed {
        info!("[飞书插件] 飞书插件已安装，跳过");
        return Ok(format!("飞书插件已安装: {}", status.plugin_name.unwrap_or_default()));
    }
    
    // 安装飞书插件
    // 注意：使用 @m1heng-clawd/feishu 包名
    info!("[飞书插件] 执行 openclaw plugins install @m1heng-clawd/feishu ...");
    match shell::run_openclaw(&["plugins", "install", "@m1heng-clawd/feishu"]) {
        Ok(output) => {
            info!("[飞书插件] 安装输出: {}", output);
            
            // 验证安装结果
            let verify_status = check_feishu_plugin().await?;
            if verify_status.installed {
                info!("[飞书插件] ✓ 飞书插件安装成功");
                Ok(format!("飞书插件安装成功: {}", verify_status.plugin_name.unwrap_or_default()))
            } else {
                warn!("[飞书插件] 安装命令执行成功但插件未找到");
                Err("安装命令执行成功但插件未找到，请检查 openclaw 版本".to_string())
            }
        }
        Err(e) => {
            error!("[飞书插件] ✗ 安装失败: {}", e);
            Err(format!("安装飞书插件失败: {}\n\n请手动执行: openclaw plugins install @m1heng-clawd/feishu", e))
        }
    }
}
