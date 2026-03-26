package com.alibaba.himarket.service.hichat.support;

import com.alibaba.himarket.dto.result.product.ProductResult;
import com.alibaba.himarket.support.chat.mcp.MCPTransportConfig;
import com.alibaba.nacos.api.ai.model.skills.Skill;
import io.agentscope.core.message.Msg;
import lombok.Builder;
import lombok.Data;
import lombok.extern.slf4j.Slf4j;

import java.net.URI;
import java.util.List;
import java.util.Map;

@Builder
@Slf4j
@Data
public class LlmChatRequest {

    /**
     * The unique chatId
     */
    private String chatId;

    /**
     * Session ID
     */
    private String sessionId;

    /**
     * Model product
     */
    private ProductResult product;

    /**
     * User message
     */
    private Msg userMessages;

    /**
     * History messages for initializing memory
     */
    private List<Msg> historyMessages;

    /**
     * URI, use this uri to request model
     */
    private URI uri;

    /**
     * API key
     */
    private String apiKey;

    /**
     * Custom headers
     */
    private Map<String, String> headers;

    /**
     * Custom query parameters
     */
    private Map<String, String> queryParams;

    /**
     * Custom json body
     */
    private Map<String, Object> bodyParams;

    /**
     * If not empty, use these URIs to resolve DNS
     */
    private List<URI> gatewayUris;

    /**
     * MCP servers with transport config
     */
    private List<MCPTransportConfig> mcpConfigs;

    /**
     * Skills, if not empty, use these skills to resolve agent planning
     */
    private List<Skill> skills;
}
