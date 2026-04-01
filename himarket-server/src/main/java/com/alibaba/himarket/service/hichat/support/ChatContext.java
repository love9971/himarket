package com.alibaba.himarket.service.hichat.support;

import com.alibaba.fastjson.JSON;
import com.alibaba.himarket.dto.result.chat.LlmInvokeResult;
import com.alibaba.himarket.support.chat.ChatUsage;
import com.alibaba.himarket.support.chat.ToolCallInfo;
import lombok.Data;
import lombok.extern.slf4j.Slf4j;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Slf4j
@Data
public class ChatContext {

    /**
     * Chat ID for tracking
     */
    private final String chatId;

    /**
     * sort
     */
    private List<ChatContent> contents = new ArrayList<>();

    /**
     * 计数器
     */
    private ChatEvent.EventType currentEventType = null;

    private ChatContent currentContent = null;

    /**
     * Chat usage (tokens)
     */
    private ChatUsage usage;

    /**
     * Success flag
     */
    private boolean success = true;

    /**
     * Request start time in milliseconds
     */
    private Long startTime;

    /**
     * First byte timeout (time to first byte in milliseconds)
     */
    private Long firstByteTimeout;

    /**
     * Tool name to tool metadata mapping
     */
    private Map<String, ToolMeta> toolMetas;

    /**
     * Tool call information map (keyed by tool call ID for matching with results)
     */
    private final Map<String, ToolCallInfo> toolCallMap = new LinkedHashMap<>();

    public ChatContext(String chatId) {
        this.chatId = chatId;
    }

    public void start() {
        this.startTime = System.currentTimeMillis();
    }

    /**
     * Record first byte arrival time
     */
    public void recordFirstByteTimeout() {
        if (firstByteTimeout == null && startTime != null) {
            firstByteTimeout = System.currentTimeMillis() - startTime;
            log.debug("First byte received after {} ms", firstByteTimeout);
        }
    }

    /**
     * Stop timing and update usage with elapsed time
     */
    public void stop() {
        if (startTime == null) {
            return;
        }

        long elapsedTime = System.currentTimeMillis() - startTime;

        if (usage != null) {
            usage.setElapsedTime(elapsedTime);
            log.debug("Total elapsed time: {} ms", elapsedTime);

            if (firstByteTimeout != null) {
                usage.setFirstByteTimeout(firstByteTimeout);
            }
        }
    }

    /**
     * Collect chat event and update context
     *
     * @param event ChatEvent to collect
     */
    public void collect(ChatEvent event) {
        if (event == null) {
            return;
        }

        if (this.currentEventType == null) {
            this.currentEventType = event.getType();
        }

        if (this.currentEventType != event.getType() && this.currentContent != null) {
            this.contents.add(this.currentContent);
            this.currentContent = null;
            this.currentEventType = event.getType();
        }


        switch (event.getType()) {
            case ASSISTANT:
                if (this.currentContent == null) {
                    this.currentContent = new ChatContent(new StringBuilder(), event.getType());
                }

                // Accumulate assistant response and thinking content
                if (event.getContent() != null) {
                    // Record first byte arrival time
                    recordFirstByteTimeout();
                    StringBuilder content = (StringBuilder) this.currentContent.getContent();
                    content.append(event.getContent());
                }
                break;

            case THINKING:
                if (this.currentContent == null) {
                    this.currentContent = new ChatContent(new StringBuilder(), event.getType());
                }

                // Accumulate assistant response and thinking content
                if (event.getContent() != null) {
                    // Record first byte arrival time
                    recordFirstByteTimeout();
                    StringBuilder content = (StringBuilder) this.currentContent.getContent();
                    content.append(event.getContent());
                }
                break;

            case TOOL_CALL:
                if (this.currentContent == null) {
                    this.currentContent = new ChatContent(event.getType());
                }

                // Collect tool call information
                if (event.getContent() instanceof ChatEvent.ToolCallContent tc) {
                    ToolCallInfo toolCallInfo =
                            ToolCallInfo.builder()
                                    .id(tc.getId())
                                    .name(tc.getName())
                                    .arguments(tc.getArguments())
                                    .mcpServerName(tc.getMcpServerName())
                                    .build();
                    toolCallMap.put(tc.getId(), toolCallInfo);

                    if (currentContent.getContent() == null) {
                        currentContent.setContent(toolCallInfo);
                    }
                }
                break;

            case TOOL_RESULT:
                if (this.currentContent == null) {
                    this.currentContent = new ChatContent(event.getType());
                }

                // Update tool call with result
                if (event.getContent() instanceof ChatEvent.ToolResultContent tr) {
                    ToolCallInfo toolCallInfo = toolCallMap.get(tr.getId());
                    if (toolCallInfo != null) {
                        toolCallInfo.setResult(tr.getResult());

                        if (currentContent.getContent() == null) {
                            currentContent.setContent(toolCallInfo);
                        }
                    }
                }
                break;

            case DONE:
                break;

            case ERROR:
                if (this.currentContent == null) {
                    this.currentContent = new ChatContent(new StringBuilder(), event.getType());
                }

                // Mark as failed
                this.success = false;
                if (event.getMessage() != null) {
                    StringBuilder content = (StringBuilder) this.currentContent.getContent();
                    content.append(event.getMessage());
                }
                break;

            default:
                // Ignore other event types (START)
                break;
        }
    }

    /**
     * Append additional content to answer
     *
     * @param content Content to append
     */
    public void appendAnswer(String content, ChatEvent.EventType type) {
        if (content != null) {
            ChatContent chatContent = new ChatContent(content, type);
            this.contents.add(chatContent);
        }
    }

    /**
     * Get complete answer content
     *
     * @return Complete answer as string
     */
    public String getAnswer() {
        if (this.currentContent != null) {
            this.contents.add(this.currentContent);
        }

        List<String> collect = contents.stream().map(JSON::toJSONString).collect(Collectors.toList());
        return JSON.toJSONString(collect);
    }

    /**
     * Get tool metadata for a given tool name
     *
     * @param toolName tool name
     * @return ToolMeta, or null if not found
     */
    public ToolMeta getToolMeta(String toolName) {
        return toolMetas != null ? toolMetas.get(toolName) : null;
    }

    /**
     * Get collected tool calls as a list
     *
     * @return List of tool call info, or null if empty
     */
    public List<ToolCallInfo> getToolCalls() {
        return toolCallMap.isEmpty() ? null : new ArrayList<>(toolCallMap.values());
    }

    /**
     * Convert to LlmInvokeResult for database persistence
     *
     * @return LlmInvokeResult instance
     */
    public LlmInvokeResult toResult() {
        return LlmInvokeResult.builder()
                .success(success)
                .answer(getAnswer())
                .usage(usage)
//                .toolCalls(getToolCalls())
                .build();
    }

    public void fail() {
        this.success = false;
    }


    @Data
    public static class ChatContent {
        private Object content;
        private ChatEvent.EventType eventType;

        public ChatContent(ChatEvent.EventType eventType) {
            this.eventType = eventType;
        }

        public ChatContent(Object content, ChatEvent.EventType eventType) {
            this.content = content;
            this.eventType = eventType;
        }
    }
}
