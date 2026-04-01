import { useReducer, useState, useRef, useCallback } from "react";
import { message as antdMessage } from "antd";
import { chatReducer, type ChatAction } from "./useChatReducer";
import { generateConversationId, generateQuestionId } from "../lib/uuid";
import { handleSSEStream } from "../lib/sse";
import APIs, { type IProductConversations, type IProductDetail, type IAttachment } from "../lib/apis";
import type { IModelConversation, IMcpToolCall, IMcpToolResponse, IMessageChunk } from "../types";
import type { SSEOptions } from "../lib/sse";

// ============ SSE Callbacks Factory ============

interface SSEContext {
  modelId: string;
  conversationId: string;
  questionId: string;
  fullContentRef: { current: string };
  dispatch: React.Dispatch<ChatAction>;
  setIsMcpExecuting: (v: boolean) => void;
}

function createSSECallbacks(ctx: SSEContext): SSEOptions {
  const { modelId, conversationId, questionId, fullContentRef, dispatch, setIsMcpExecuting } = ctx;
  return {
    onToolCall: (toolCall: IMcpToolCall) => {
      setIsMcpExecuting(true);
      dispatch({ type: 'ADD_TOOL_CALL', payload: { modelId, conversationId, questionId, toolCall } });
    },
    onToolResponse: (toolResponse: IMcpToolResponse) => {
      setIsMcpExecuting(false);
      dispatch({ type: 'ADD_TOOL_RESPONSE', payload: { modelId, conversationId, questionId, toolResponse } });
    },
    onThinking: (content: string) => {
      dispatch({ type: 'APPEND_THINKING_CHUNK', payload: { modelId, conversationId, questionId, content } });
    },
    onChunk: (chunk: string) => {
      fullContentRef.current += chunk;
      dispatch({
        type: 'APPEND_CHUNK',
        payload: { modelId, conversationId, questionId, chunk, fullContent: fullContentRef.current },
      });
    },
    onComplete: (_content: string, _chatId: string, usage) => {
      setIsMcpExecuting(false);
      dispatch({
        type: 'COMPLETE',
        payload: { modelId, conversationId, questionId, fullContent: fullContentRef.current, usage },
      });
    },
    onError: (errorMsg: string) => {
      setIsMcpExecuting(false);
      dispatch({
        type: 'SEND_ERROR',
        payload: { modelId, conversationId, questionId, errorMsg, fullContent: fullContentRef.current },
      });
    },
  };
}

// ============ SSE Request Helper ============

async function executeSSERequest(
  _modelId: string,
  messagePayload: Record<string, unknown>,
  abortController: AbortController,
  sseCallbacks: SSEOptions,
) {
  const streamUrl = APIs.getChatMessageStreamUrl();
  const accessToken = localStorage.getItem('access_token');
  await handleSSEStream(
    streamUrl,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': accessToken ? `Bearer ${accessToken}` : '',
      },
      body: JSON.stringify(messagePayload),
    },
    sseCallbacks,
    abortController.signal,
  );
}

// ============ Hook ============

export function useChatSession() {
  const [state, dispatch] = useReducer(chatReducer, []);
  const [generating, setGenerating] = useState(false);
  const [isMcpExecuting, setIsMcpExecuting] = useState(false);
  const [currentSessionId, setCurrentSessionId] = useState<string>();
  const [sidebarRefreshTrigger, setSidebarRefreshTrigger] = useState(0);
  const abortControllersRef = useRef<AbortController[]>([]);

  // 停止生成
  const handleStop = useCallback(() => {
    abortControllersRef.current.forEach(c => c.abort());
    abortControllersRef.current = [];
    setGenerating(false);
    setIsMcpExecuting(false);
  }, []);

  // 新建会话
  const handleNewChat = useCallback(() => {
    dispatch({ type: 'RESET' });
    setCurrentSessionId(undefined);
  }, []);

  // 发送消息
  const sendMessage = useCallback(async (
    content: string,
    mcps: IProductDetail[],
    enableWebSearch: boolean,
    modelMap: Map<string, IProductDetail>,
    selectedModel: IProductDetail,
    attachments: IAttachment[] = [],
  ) => {
    try {
      setGenerating(true);

      // 如果没有会话，先创建
      let sessionId = currentSessionId;
      if (!sessionId) {
        const sessionResponse = await APIs.createSession({
          talkType: "MODEL",
          name: content.length > 20 ? content.substring(0, 20) + "..." : content,
          products: state.length ? state.map(v => v.id) : [selectedModel.productId],
        });
        if (sessionResponse.code === "SUCCESS") {
          sessionId = sessionResponse.data.sessionId;
          setCurrentSessionId(sessionId);
          setSidebarRefreshTrigger(prev => prev + 1);
        } else {
          setGenerating(false);
          throw new Error("创建会话失败");
        }
      }

      const conversationId = generateConversationId();
      const questionId = generateQuestionId();

      if (!sessionId) throw new Error("会话ID不存在");

      const modelIds = state.length ? state.map(m => m.id) : [selectedModel.productId];
      abortControllersRef.current = [];

      const requests = modelIds.map(async (modelId) => {
        const abortController = new AbortController();
        abortControllersRef.current.push(abortController);

        const isSupport = modelMap.get(modelId)?.feature?.modelFeature?.webSearch || false;
        const messagePayload = {
          productId: modelId,
          sessionId,
          conversationId,
          questionId,
          question: content,
          stream: true,
          needMemory: true,
          mcpProducts: mcps.map(mcp => mcp.productId),
          enableWebSearch: enableWebSearch ? isSupport : false,
          attachments: attachments.map(a => ({ attachmentId: a.attachmentId })),
        };

        // 添加对话到 state
        dispatch({
          type: 'ADD_CONVERSATION',
          payload: {
            modelId,
            conversationId,
            questionId,
            content,
            attachments,
            selectedModelId: selectedModel.productId,
            sessionId: currentSessionId,
          },
        });

        const fullContentRef = { current: '' };
        const sseCallbacks = createSSECallbacks({
          modelId, conversationId, questionId, fullContentRef, dispatch, setIsMcpExecuting,
        });

        await executeSSERequest(modelId, messagePayload, abortController, sseCallbacks);
      });

      await Promise.allSettled(requests);
      setGenerating(false);
      abortControllersRef.current = [];
    } catch (error) {
      dispatch({ type: 'GLOBAL_ERROR', payload: { errorMsg: "网络错误，请重试" } });
      setGenerating(false);
      console.error("Failed to send message:", error);
    }
  }, [currentSessionId, state]);

  // 重新生成答案
  const regenerateMessage = useCallback(async ({
    modelId, conversationId, questionId, content,
    mcps, enableWebSearch, modelMap, attachments = [],
  }: {
    modelId: string; conversationId: string; questionId: string; content: string;
    mcps: IProductDetail[]; enableWebSearch: boolean; modelMap: Map<string, IProductDetail>;
    attachments?: IAttachment[];
  }) => {
    setGenerating(true);
    const abortController = new AbortController();
    abortControllersRef.current = [abortController];

    const isSupportWebSearch = modelMap.get(modelId)?.feature?.modelFeature?.webSearch || false;
    try {
      const messagePayload = {
        productId: modelId,
        sessionId: currentSessionId,
        conversationId,
        questionId,
        question: content,
        stream: true,
        needMemory: true,
        mcpProducts: mcps.map(mcp => mcp.productId),
        enableWebSearch: enableWebSearch ? isSupportWebSearch : false,
        attachments: attachments.map(a => ({ attachmentId: a.attachmentId })),
      };

      // 设置 loading 和 isNewQuestion
      dispatch({ type: 'SET_LOADING', payload: { modelId, conversationId, loading: true } });
      dispatch({ type: 'SET_NEW_QUESTION', payload: { modelId, conversationId, questionId } });

      const fullContentRef = { current: '' };
      const lastIdxRef = { current: -1 };

      // 创建 regenerate 专用的 SSE 回调（onChunk 和 onComplete 逻辑不同）
      const sseCallbacks: SSEOptions = {
        ...createSSECallbacks({ modelId, conversationId, questionId, fullContentRef, dispatch, setIsMcpExecuting }),
        onChunk: (chunk: string) => {
          fullContentRef.current += chunk;
          // regenerate 时需要追加新 answer 或更新最后一个 answer
          dispatch({
            type: 'REGENERATE_CHUNK',
            payload: {
              modelId, conversationId, questionId,
              chunk,
              fullContent: fullContentRef.current,
              lastIdx: lastIdxRef.current,
            },
          });
          if (lastIdxRef.current === -1) {
            lastIdxRef.current = 1; // 标记已初始化
          }
        },
        onComplete: (_content: string, _chatId: string, usage) => {
          setIsMcpExecuting(false);
          // regenerate 完成时更新最后一个 answer 的 usage
          dispatch({
            type: 'COMPLETE',
            payload: {
              modelId, conversationId, questionId,
              fullContent: fullContentRef.current,
              usage,
            },
          });
          setGenerating(false);
        },
        onError: (errorMsg: string) => {
          setIsMcpExecuting(false);
          // regenerate 错误时追加一个错误 answer
          dispatch({
            type: 'ERROR',
            payload: { modelId, conversationId, questionId, errorMsg, fullContent: fullContentRef.current },
          });
          setGenerating(false);
        },
      };

      await executeSSERequest(modelId, messagePayload, abortController, sseCallbacks);
    } catch (error) {
      setGenerating(false);
      console.error("Failed to generate message:", error);
    }
  }, [currentSessionId]);

  // 选择历史会话
  const handleSelectSession = useCallback(async (sessionId: string) => {
    if (currentSessionId === sessionId) return;
    setGenerating(false);

    try {
      setCurrentSessionId(sessionId);
      const response = await APIs.getConversationsV2(sessionId);

      if (response.code === "SUCCESS" && response.data) {
        const models: IProductConversations[] = response.data;
        const m: IModelConversation[] = models.map(model => ({
          id: model.productId,
          sessionId,
          name: "-",
          conversations: model.conversations.map(conversation => ({
            id: conversation.conversationId,
            loading: false,
            questions: conversation.questions.map(question => {
              const activeAnswerIndex = question.answers.length - 1;
              const activeAnswer = question.answers[activeAnswerIndex];
              const toolCalls = activeAnswer?.toolCalls || [];

              const mcpToolCalls: IMcpToolCall[] = toolCalls.map(tc => ({
                id: tc.id,
                type: "function",
                name: tc.name,
                arguments: typeof tc.arguments === 'string' ? tc.arguments : JSON.stringify(tc.arguments),
                mcpServerName: tc.mcpServerName,
              }));

              const mcpToolResponses: IMcpToolResponse[] = toolCalls
                .filter(tc => tc.result !== undefined && tc.result !== null)
                .map(tc => ({ id: tc.id, name: tc.name, result: tc.result }));

              // 构建 messageChunks：从 answer.content 中解析 thinking、text 和 tool_call 内容
              const messageChunks: IMessageChunk[] = [];
              
              // 处理所有答案，提取 messageChunks
              question.answers.forEach((answer, ansIdx) => {
                // 尝试解析 answer.content，它是 JSON 数组字符串
                // 格式：[{"content":"...","eventType":"THINKING"},{"content":{...},"eventType":"TOOL_CALL"},...]
                let parsedContent: Array<{ content: string | Record<string, unknown>; eventType: string }> | null = null;
                
                try {
                  if (answer.content && typeof answer.content === 'string') {
                    // 第一次解析：得到字符串数组
                    const outerArray = JSON.parse(answer.content);
                    
                    if (Array.isArray(outerArray)) {
                      // 第二次解析：数组中的每个元素也是 JSON 字符串
                      parsedContent = outerArray.map((item: string) => {
                        if (typeof item === 'string') {
                          return JSON.parse(item);
                        }
                        return item;
                      });
                    }
                  }
                } catch (e) {
                  console.error('[ChatSession] Parse error:', e);
                  // 解析失败，按普通文本处理
                }
                
                if (parsedContent && Array.isArray(parsedContent)) {
                  // 新格式：解析 JSON 数组
                  parsedContent.forEach((item, idx) => {
                    if (item.eventType === 'THINKING' && typeof item.content === 'string') {
                      messageChunks.push({
                        id: `chunk-thinking-${ansIdx}-${idx}`,
                        type: 'thinking',
                        content: item.content,
                      });
                    } else if (item.eventType === 'ASSISTANT' && typeof item.content === 'string') {
                      messageChunks.push({
                        id: `chunk-text-${ansIdx}-${idx}`,
                        type: 'text',
                        content: item.content,
                      });
                    } else if (item.eventType === 'TOOL_CALL' && typeof item.content === 'object') {
                      // TOOL_CALL: 创建 tool_call chunk
                      const toolCallContent = item.content as Record<string, unknown>;
                      const toolCall: IMcpToolCall = {
                        id: String(toolCallContent.id || `tool-${ansIdx}-${idx}`),
                        type: 'function',
                        name: String(toolCallContent.name || ''),
                        arguments: toolCallContent.arguments as Record<string, unknown> || {},
                        mcpServerName: toolCallContent.mcpServerName as string | undefined,
                      };
                      messageChunks.push({
                        id: `chunk-toolcall-${ansIdx}-${idx}`,
                        type: 'tool_call',
                        toolCall,
                      });
                    } else if (item.eventType === 'TOOL_RESULT' && typeof item.content === 'object') {
                      // TOOL_RESULT: 创建 tool_result chunk
                      const toolResultContent = item.content as Record<string, unknown>;
                      const toolResult: IMcpToolResponse = {
                        id: String(toolResultContent.id || `tool-${ansIdx}-${idx}`),
                        name: String(toolResultContent.name || ''),
                        result: toolResultContent.result ?? toolResultContent,
                      };
                      messageChunks.push({
                        id: `chunk-toolresult-${ansIdx}-${idx}`,
                        type: 'tool_result',
                        toolResult,
                      });
                    }
                  });
                } else if (answer.content) {
                  // 旧格式：直接作为 text 内容
                  if (messageChunks.length === 0 || messageChunks[messageChunks.length - 1]?.type !== 'text') {
                    messageChunks.push({
                      id: `chunk-text-${ansIdx}`,
                      type: 'text',
                      content: answer.content,
                    });
                  } else {
                    // 合并到最后一个 text chunk
                    const lastIdx = messageChunks.length - 1;
                    messageChunks[lastIdx] = {
                      ...messageChunks[lastIdx],
                      content: (messageChunks[lastIdx].content || '') + answer.content,
                    };
                  }
                }
              });
              
              console.log('[ChatSession] Final messageChunks:', messageChunks.length, messageChunks.map(c => c.type));

              return {
                id: question.questionId,
                content: question.content,
                createdAt: question.createdAt,
                activeAnswerIndex,
                isNewQuestion: false,
                attachments: question.attachments,
                mcpToolCalls: mcpToolCalls.length > 0 ? mcpToolCalls : undefined,
                mcpToolResponses: mcpToolResponses.length > 0 ? mcpToolResponses : undefined,
                messageChunks: messageChunks.length > 0 ? messageChunks : undefined,
                answers: question.answers.map(answer => ({
                  errorMsg: "",
                  content: answer.content,
                  firstTokenTime: answer.usage?.firstByteTimeout || 0,
                  totalTime: answer.usage?.elapsedTime || 0,
                  inputTokens: answer.usage?.inputTokens || 0,
                  outputTokens: answer.usage?.outputTokens || 0,
                })),
              };
            }),
          })),
        }));
        dispatch({ type: 'SET_CONVERSATIONS', payload: m });
      }
    } catch (error) {
      console.error("Failed to load conversation:", error);
      antdMessage.error("加载聊天记录失败");
    }
  }, [currentSessionId]);

  // 切换活跃答案
  const onChangeActiveAnswer = useCallback((
    modelId: string, conversationId: string, questionId: string, direction: 'prev' | 'next'
  ) => {
    dispatch({ type: 'CHANGE_ACTIVE_ANSWER', payload: { modelId, conversationId, questionId, direction } });
  }, []);

  // 添加模型
  const addModels = useCallback((modelIds: string[], selectedModelId?: string) => {
    setCurrentSessionId(undefined);
    dispatch({ type: 'ADD_MODELS', payload: { modelIds, selectedModelId, sessionId: currentSessionId } });
  }, [currentSessionId]);

  // 关闭模型
  const closeModel = useCallback((modelId: string) => {
    dispatch({ type: 'CLOSE_MODEL', payload: { modelId } });
  }, []);

  return {
    modelConversation: state,
    generating,
    isMcpExecuting,
    currentSessionId,
    sidebarRefreshTrigger,
    sendMessage,
    regenerateMessage,
    handleStop,
    handleNewChat,
    handleSelectSession,
    onChangeActiveAnswer,
    addModels,
    closeModel,
    setCurrentSessionId,
    dispatch,
  };
}
