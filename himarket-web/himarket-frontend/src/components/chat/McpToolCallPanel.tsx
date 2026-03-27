import { useState } from "react";
import { Collapse } from "antd";
import { Mcp } from "../icon";
import type { IMcpToolCall, IMcpToolResponse } from "../../types";

interface McpToolCallItemProps {
  toolCall: IMcpToolCall;
  toolResponse?: IMcpToolResponse;
  panelKey?: string;
  activeKey?: string | string[];
  onActiveKeyChange?: (key: string | string[]) => void;
}

type ToolCallSource = "mcp" | "local" | "skill";

function parseToolArguments(raw: IMcpToolCall["arguments"]) {
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return raw;
    }
  }
  return raw;
}

function detectToolCallSource(toolCall: IMcpToolCall, parsedInput: unknown): ToolCallSource {
  const skillId = typeof parsedInput === "object" && parsedInput !== null
    ? (parsedInput as Record<string, unknown>).skillId
    : undefined;
  if (typeof skillId === "string" && skillId.trim()) {
    return "skill";
  }
  if (toolCall.mcpServerName) {
    return "mcp";
  }
  return "local";
}

function getSourceTitle(source: ToolCallSource, finished: boolean) {
  if (source === "skill") {
    return finished ? "技能加载完成" : "技能加载中";
  }
  if (source === "mcp") {
    return finished ? "MCP 工具执行完成" : "MCP 工具执行中";
  }
  return finished ? "本地工具执行完成" : "本地工具执行中";
}

function getSourceMeta(source: ToolCallSource, mcpServerName?: string) {
  if (source === "skill") {
    return {
      badgeText: "Skills",
      sourceName: "Skill Loader",
      sourceLabel: "Source",
      badgeClass: "bg-violet-100 text-violet-700 border-violet-200",
      iconClass: "fill-violet-500",
      panelClass: "border-violet-200 bg-violet-50/40",
      titleClass: "text-violet-700",
    };
  }
  if (source === "mcp") {
    return {
      badgeText: "MCP",
      sourceName: mcpServerName || "-",
      sourceLabel: "MCP Server",
      badgeClass: "bg-blue-100 text-blue-700 border-blue-200",
      iconClass: "fill-colorPrimary",
      panelClass: "border-blue-200 bg-blue-50/40",
      titleClass: "text-colorPrimary",
    };
  }
  return {
    badgeText: "Local",
    sourceName: "Local Tool",
    sourceLabel: "Runtime",
    badgeClass: "bg-emerald-100 text-emerald-700 border-emerald-200",
    iconClass: "fill-emerald-500",
    panelClass: "border-emerald-200 bg-emerald-50/40",
    titleClass: "text-emerald-700",
  };
}

export function McpToolCallItem({ 
  toolCall, 
  toolResponse, 
  panelKey = "mcp-tool-0",
  activeKey: externalActiveKey,
  onActiveKeyChange 
}: McpToolCallItemProps) {
  const [internalActiveKey, setInternalActiveKey] = useState<string | string[]>([]);
  
  const activeKey = externalActiveKey !== undefined ? externalActiveKey : internalActiveKey;
  const setActiveKey = onActiveKeyChange || setInternalActiveKey;

  const toolName = toolCall.name;
  const parsedInput = parseToolArguments(toolCall.arguments);
  const source = detectToolCallSource(toolCall, parsedInput);
  const sourceMeta = getSourceMeta(source, toolCall.mcpServerName);

  let parsedResponse: unknown = null;
  try {
    const resultString = typeof toolResponse?.result === 'string' ? toolResponse.result : JSON.stringify(toolResponse?.result || {});
    parsedResponse = JSON.parse(resultString || "{}");
  } catch {
    parsedResponse = toolResponse?.result;
  }

  return (
    <Collapse
      activeKey={activeKey}
      onChange={setActiveKey}
      expandIconPosition="end"
      items={[
        {
          key: panelKey,
          label: (
            <div className="flex items-center gap-2">
              <Mcp className={`w-4 h-4 ${sourceMeta.iconClass}`} />
              <span className={`font-medium ${sourceMeta.titleClass}`}>
                {getSourceTitle(source, !!toolResponse)}
              </span>
              <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs ${sourceMeta.badgeClass}`}>
                {sourceMeta.badgeText}
              </span>
              <span className="text-gray-500">{sourceMeta.sourceName}</span>
            </div>
          ),
          children: (
            <div className="space-y-4">
              <div>
                <div className="text-xs font-medium text-gray-800 mb-1">{sourceMeta.sourceLabel}:</div>
                <div className="text-sm p-2 border border-[#e5e5e5] rounded-lg text-gray-800">{sourceMeta.sourceName}</div>
              </div>

              <div>
                <div className="text-xs font-medium text-gray-800 mb-1">Tool:</div>
                <div className="text-sm text-gray-800 border border-[#e5e5e5] p-2 rounded-lg">{toolName}</div>
              </div>

              <div>
                <div className="text-xs font-medium text-gray-800 mb-1">Parameters:</div>
                <div className="rounded-lg p-2 overflow-x-auto border border-[#e5e5e5]">
                  <pre className="text-xs text-gray-800 whitespace-pre-wrap">
                    {typeof parsedInput === "object"
                      ? JSON.stringify(parsedInput, null, 2)
                      : String(parsedInput)}
                  </pre>
                </div>
              </div>

              {toolResponse && (
                <div>
                  <div className="text-xs font-medium text-gray-800 mb-1">Results:</div>
                  <div className="bg-white rounded-lg p-2 overflow-x-auto border border-[#e5e5e5]">
                    <pre className="text-xs text-gray-800 whitespace-pre-wrap">
                      {typeof parsedResponse === "object"
                        ? JSON.stringify(parsedResponse, null, 2)
                        : String(parsedResponse)}
                    </pre>
                  </div>
                </div>
              )}

              {!toolResponse && (
                <div className="text-sm text-gray-400 italic">等待工具响应...</div>
              )}
            </div>
          ),
        },
      ]}
      className={`border ${sourceMeta.panelClass}`}
    />
  );
}

interface McpToolCallPanelProps {
  toolCalls?: IMcpToolCall[];
  toolResponses?: IMcpToolResponse[];
}

export function McpToolCallPanel({ toolCalls = [], toolResponses = [] }: McpToolCallPanelProps) {
  const [activeKey, setActiveKey] = useState<string | string[]>([]);

  if (toolCalls.length === 0) {
    return null;
  }

  // 合并 toolCall 和 toolResponse（通过 id 匹配）
  const toolItems = toolCalls.map((toolCall) => {
    const toolResponse = toolResponses?.find((resp) => resp.id === toolCall.id);
    return { toolCall, toolResponse };
  });

  return (
    <div className="space-y-2">
      {toolItems.map(({ toolCall, toolResponse }, index) => (
        <McpToolCallItem
          key={`mcp-tool-${index}`}
          toolCall={toolCall}
          toolResponse={toolResponse}
          panelKey={`mcp-tool-${index}`}
          activeKey={activeKey}
          onActiveKeyChange={setActiveKey}
        />
      ))}
    </div>
  );
}
