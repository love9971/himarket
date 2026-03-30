import { useState, useRef, useEffect, useMemo } from "react";
import {
  SendOutlined,
  FileImageOutlined,
  FileOutlined,
  PlusOutlined,
  CloseOutlined,
  CodeOutlined,
} from "@ant-design/icons";
import { Dropdown, message, Tooltip } from "antd";
import type { MenuProps } from "antd";
import SendButton from "../send-button";
import { Global, Mcp } from "../icon";
import APIs, { type IProductDetail, type IAttachment } from "../../lib/apis";
import { AttachmentPreview } from "./AttachmentPreview";
import SkillModal, { type SkillOption } from "./SkillModal";

type UploadedAttachment = IAttachment & { url?: string };

interface InputBoxProps {
  isLoading?: boolean;
  mcpEnabled?: boolean;
  addedMcps: IProductDetail[];
  isMcpExecuting?: boolean;
  showWebSearch: boolean;
  webSearchEnabled: boolean;
  enableMultiModal?: boolean;
  onWebSearchEnable: (enabled: boolean) => void;
  onMcpClick?: () => void;
  onSendMessage: (content: string, attachments: IAttachment[], skills: string[]) => void;
  onStop?: () => void;
}

export function InputBox(props: InputBoxProps) {
  const {
    onSendMessage,
    isLoading = false,
    mcpEnabled = false,
    onMcpClick,
    addedMcps,
    isMcpExecuting = false,
    showWebSearch,
    webSearchEnabled,
    onWebSearchEnable,
    enableMultiModal = false,
    onStop,
  } = props;
  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState<UploadedAttachment[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const skillPanelRef = useRef<HTMLDivElement>(null);
  const skillButtonRef = useRef<HTMLDivElement>(null);
  const currentUploadType = useRef<string>("");

  const [skillOptions, setSkillOptions] = useState<SkillOption[]>([]);
  const [selectedSkills, setSelectedSkills] = useState<SkillOption[]>([]);
  const [skillMenuMode, setSkillMenuMode] = useState<"mention" | "button" | null>(null);
  const [mentionQuery, setMentionQuery] = useState("");
  const [mentionRange, setMentionRange] = useState<{ start: number; end: number } | null>(null);
  const [activeSkillCategory, setActiveSkillCategory] = useState("");
  const [activeMentionIndex, setActiveMentionIndex] = useState(0);
  const showMentionMenu = skillMenuMode !== null;

  useEffect(() => {
    APIs.getProducts({ type: "AGENT_SKILL", page: 0, size: 10000 }).then(res => {
      if (res.code === "SUCCESS" && res.data?.content) {
        setSkillOptions(res.data.content.map(item => ({
          productId: item.productId,
          name: item.name,
          description: item.description,
          icon: item.icon,
          categoryNames: item.categories?.map(category => category.name) || ["未分类"],
        })));
      }
    });
  }, []);

  const filteredSkills = useMemo(() => {
    const query = mentionQuery.trim().toLowerCase();
    // 只在 @ 模式下过滤已选技能，让弹窗模式可以看到所有技能供取消/选择
    return skillOptions
      .filter(skill => skillMenuMode === "mention" ? !selectedSkills.some(selected => selected.productId === skill.productId) : true)
      .filter(skill => (query ? skill.name.toLowerCase().includes(query) : true));
  }, [mentionQuery, skillOptions, selectedSkills, skillMenuMode]);

  const groupedSkills = useMemo(() => {
    const grouped = new Map<string, SkillOption[]>();
    filteredSkills.forEach(skill => {
      const categories = skill.categoryNames.length > 0 ? skill.categoryNames : ["未分类"];
      categories.forEach(category => {
        const list = grouped.get(category) || [];
        list.push(skill);
        grouped.set(category, list);
      });
    });
    return grouped;
  }, [filteredSkills]);

  const skillCategories = useMemo(() => Array.from(groupedSkills.keys()), [groupedSkills]);

  const displayedSkills = useMemo(() => {
    if (skillMenuMode === "button") {
      return groupedSkills.get(activeSkillCategory) || [];
    }
    return filteredSkills;
  }, [activeSkillCategory, filteredSkills, groupedSkills, skillMenuMode]);

  useEffect(() => {
    if (skillMenuMode !== "button") return;
    if (!skillCategories.length) {
      setActiveSkillCategory("");
      return;
    }
    if (!activeSkillCategory || !groupedSkills.has(activeSkillCategory)) {
      setActiveSkillCategory(skillCategories[0]);
    }
  }, [activeSkillCategory, groupedSkills, skillCategories, skillMenuMode]);

  useEffect(() => {
    if (skillMenuMode !== "mention") return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        skillPanelRef.current?.contains(target) ||
        skillButtonRef.current?.contains(target) ||
        textareaRef.current?.contains(target)
      ) {
        return;
      }
      setSkillMenuMode(null);
      setMentionQuery("");
      setMentionRange(null);
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
    };
  }, [skillMenuMode]);



  const uploadItems: MenuProps["items"] = [
    ...(enableMultiModal
      ? [
          {
            key: "image",
            label: (
              <Tooltip title={<span className="text-black-normal">最大 5MB，最多 10 个文件 </span>} placement="right">
                <span className="w-full inline-block">上传图片</span>
              </Tooltip>
            ),
            icon: <FileImageOutlined />,
          },
        ]
      : []),
    {
      key: "text",
      label: (
        <Tooltip
          title={
            <div className="text-black-normal">
              上传文件时支持以下格式：txt、md、html、doc、docx、pdf、xls、xlsx、ppt、pptx、csv。单次最多上传 10 个文件。表格文件大小不超过 2MB。普通文档不超过 5MB。
            </div>
          }
          placement="right"
        >
          <span className="w-full inline-block">上传文本</span>
        </Tooltip>
      ),
      icon: <FileOutlined />,
    },
  ];

  const handleUploadClick = ({ key }: { key: string }) => {
    currentUploadType.current = key;
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
      // Set accept attribute based on type
      if (key === "image") {
        fileInputRef.current.accept = "image/*";
      } else {
        fileInputRef.current.accept =
          ".txt,.md,.html,.doc,.docx,.pdf,.xls,.xlsx,.ppt,.pptx,.csv";
      }
      fileInputRef.current.click();
    }
  };

  const uploadFile = async (file: File) => {
    if (attachments.length >= 10) {
      message.warning("最多支持上传 10 个文件");
      return;
    }

    const isTableFile = /\.(csv|xls|xlsx)$/i.test(file.name);
    const maxSize = isTableFile ? 2 * 1024 * 1024 : 5 * 1024 * 1024;

    if (file.size > maxSize) {
      message.error(`${isTableFile ? '表格' : '文件'}大小不能超过 ${isTableFile ? '2M' : '5M'}`);
      return;
    }

    try {
      setIsUploading(true);
      const res = await APIs.uploadAttachment(file);
      if (res.code === "SUCCESS" && res.data) {
        const uploaded = await APIs.getAttachment(res.data.attachmentId);
        const attachment = res.data as UploadedAttachment;
        // 为图片生成预览 URL
        if (attachment.type === "IMAGE") {
          attachment.url = `data:${uploaded.data.mimeType};base64,${uploaded.data.data}`;
        }
        setAttachments(prev => [...prev, attachment]);
      } else {
        message.error(res.message || "上传失败");
      }
    } catch (error: unknown) {
      console.error("Upload error:", error);
      const errMsg =
        error && typeof error === "object" && "response" in error
          ? (error as { response?: { data?: { message?: string } } }).response
              ?.data?.message
          : undefined;
      message.error(errMsg || "上传出错");
    } finally {
      setIsUploading(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      await uploadFile(file);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      await uploadFile(file);
    }
  };

  const removeAttachment = (id: string) => {
    setAttachments(prev => {
      const target = prev.find(a => a.attachmentId === id);
      if (target?.url && target.url.startsWith("blob:")) {
        URL.revokeObjectURL(target.url);
      }
      return prev.filter(a => a.attachmentId !== id);
    });
  };

  const handleSend = () => {
    if ((input.trim() || attachments.length > 0) && !isLoading) {
      onSendMessage(input.trim(), attachments, selectedSkills.map(skill => skill.productId));
      setInput("");
      setSelectedSkills([]);
      setSkillMenuMode(null);
      setMentionQuery("");
      setMentionRange(null);
      // 清除预览 URL
      attachments.forEach(file => {
        if (file.url && file.url.startsWith("blob:")) {
          URL.revokeObjectURL(file.url);
        }
      });
      setAttachments([]);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    const cursor = e.target.selectionStart ?? value.length;
    setInput(value);

    const textBeforeCursor = value.slice(0, cursor);
    const match = textBeforeCursor.match(/(?:^|\s)@([^\s@]*)$/);
    if (!match) {
      if (skillMenuMode === "mention") {
        setSkillMenuMode(null);
        setMentionQuery("");
        setMentionRange(null);
      }
      return;
    }

    const atIndex = textBeforeCursor.lastIndexOf("@");
    if (atIndex === -1) {
      if (skillMenuMode === "mention") {
        setSkillMenuMode(null);
      }
      return;
    }

    setSkillMenuMode("button");
    setMentionQuery(match[1] || "");
    setMentionRange({ start: atIndex, end: cursor });
  };

  const handleSelectSkill = (skill: SkillOption) => {
    const hasMention = !!mentionRange;
    const cursorPos = hasMention ? mentionRange.start : (textareaRef.current?.selectionStart ?? input.length);
    const nextInput = hasMention
      ? `${input.slice(0, mentionRange.start)}${input.slice(mentionRange.end)}`.replace(/\s{2,}/g, " ")
      : input;
    setInput(nextInput);
    setSelectedSkills(prev => prev.some(item => item.productId === skill.productId) ? prev : [...prev, skill]);
    setSkillMenuMode(null);
    setMentionQuery("");
    setMentionRange(null);

    requestAnimationFrame(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(cursorPos, cursorPos);
      }
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !isLoading) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSkillButtonClick = () => {
    setSkillMenuMode(prev => prev === "button" ? null : "button");
    setMentionQuery("");
    setMentionRange(null);
    if (skillCategories.length > 0) {
      setActiveSkillCategory(skillCategories[0]);
    }
    requestAnimationFrame(() => {
      textareaRef.current?.focus();
    });
  };

  return (
    <div
      className={`relative p-1.5 rounded-2xl flex flex-col justify-center transition-all duration-200 ${isDragging ? "bg-white border-2 border-dashed border-colorPrimary shadow-lg scale-[1.01]" : ""}`}
      style={{
        background: isDragging
          ? undefined
          : "linear-gradient(256deg, rgba(234, 228, 248, 1) 36%, rgba(215, 229, 243, 1) 100%)",
      }}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* 附件预览 */}
      <AttachmentPreview
        attachments={attachments}
        onRemove={removeAttachment}
        isUploading={isUploading}
        className="mb-1"
      />

      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        className="hidden"
      />
      {isMcpExecuting && (
        <div className="px-3 py-1 text-sm">MCP 工具执行中...</div>
      )}
      <div className="w-full h-full p-4 bg-white/80 backdrop-blur-sm rounded-2xl">
        <div className="relative">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            className="w-full resize-none focus:outline-none bg-transparent"
            placeholder="输入您的问题，输入 @ 选择技能..."
            rows={2}
          />
          {showMentionMenu && skillMenuMode === "mention" && (
            <div ref={skillPanelRef} className="absolute left-0 top-full mt-2 z-20 w-full max-w-md overflow-hidden rounded-xl border border-gray-200 bg-white shadow-[0_12px_24px_rgba(15,23,42,0.12)]">
              <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100">
                <span className="text-xs text-gray-500">选择技能</span>
                <span className="text-xs text-gray-400">↑ ↓ / Enter</span>
              </div>
              <div className="max-h-56 overflow-auto py-1">
                {displayedSkills.length > 0 ? displayedSkills.map((skill, index) => (
                  <div
                    key={skill.productId}
                    onMouseEnter={() => setActiveMentionIndex(index)}
                    onMouseDown={e => {
                      e.preventDefault();
                      handleSelectSkill(skill);
                    }}
                    className={`mx-1 rounded-md px-3 py-2 text-sm cursor-pointer ${index === activeMentionIndex ? "bg-colorPrimaryBgHover text-colorPrimary" : "text-gray-700 hover:bg-gray-50"}`}
                  >
                    @{skill.name}
                  </div>
                )) : (
                  <div className="px-3 py-2 text-sm text-gray-400">未找到可用技能</div>
                )}
              </div>
            </div>
          )}
          <SkillModal
            open={skillMenuMode === "button" || skillMenuMode === "mention"}
            onClose={() => setSkillMenuMode(null)}
            data={skillOptions}
            categories={skillCategories}
            added={selectedSkills}
            onAdd={(skill) => handleSelectSkill(skill)}
            onRemove={(skill) => setSelectedSkills(prev => prev.filter(item => item.productId !== skill.productId))}
          />
        </div>
        {selectedSkills.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {selectedSkills.map(skill => (
              <button
                key={skill.productId}
                type="button"
                onClick={() => setSelectedSkills(prev => prev.filter(item => item.productId !== skill.productId))}
                className="inline-flex items-center gap-1 rounded-full border border-colorPrimary/30 bg-colorPrimaryBgHover px-2.5 py-1 text-sm text-colorPrimary"
              >
                <span>{skill.name}</span>
                <CloseOutlined className="text-[10px]" />
              </button>
            ))}
          </div>
        )}
      </div>
      <div
        className="mt-3 flex justify-between w-full px-2"
        data-sign="tool-btns"
      >
        <div className="inline-flex gap-2">
          <Dropdown
            menu={{ items: uploadItems, onClick: handleUploadClick }}
            trigger={["click"]}
            placement="topLeft"
          >
            <div className="flex h-full gap-2 items-center justify-center px-2 rounded-lg cursor-pointer transition-all ease-linear duration-400 hover:bg-black/5">
              <PlusOutlined className="text-base text-subTitle" />
            </div>
          </Dropdown>
          <div ref={skillButtonRef}>
            <ToolButton
              onClick={handleSkillButtonClick}
              enabled={skillMenuMode === "button" || selectedSkills.length > 0}
            >
              <CodeOutlined className={`text-sm ${skillMenuMode === "button" || selectedSkills.length > 0 ? "text-colorPrimary" : "text-subTitle"}`} />
              <span className={`text-sm ${skillMenuMode === "button" || selectedSkills.length > 0 ? "text-colorPrimary" : "text-subTitle"}`}>技能</span>
            </ToolButton>
          </div>
          {showWebSearch && (
            <ToolButton
              onClick={() => onWebSearchEnable(!webSearchEnabled)}
              enabled={webSearchEnabled}
            >
              <Global
                className={`w-4 h-4 ${webSearchEnabled ? "fill-colorPrimary" : "fill-subTitle"}`}
              />
              <span className="text-sm text-subTitle">联网</span>
            </ToolButton>
          )}
          <ToolButton onClick={onMcpClick} enabled={mcpEnabled}>
            <Mcp
              className={`w-4 h-4 ${mcpEnabled ? "fill-colorPrimary" : "fill-subTitle"}`}
            />
            <span className="text-sm text-subTitle">
              MCP {addedMcps.length ? `(${addedMcps.length})` : ""}
            </span>
          </ToolButton>
        </div>
        <SendButton
          className={`w-9 h-9 ${
            input.trim() && !isLoading
              ? "bg-colorPrimary text-white hover:opacity-90"
              : isLoading
              ? "bg-colorPrimary text-white hover:opacity-90"
              : "bg-colorPrimarySecondary text-colorPrimary cursor-not-allowed"
          }`}
          isLoading={isLoading}
          onClick={handleSend}
          onStop={onStop}
        >
          <SendOutlined className={"text-sm text-white"} />
        </SendButton>
      </div>
    </div>
  );
}

function ToolButton({
  enabled,
  children,
  onClick,
}: {
  enabled: boolean;
  children: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className={`flex h-full gap-2 items-center justify-center px-2 rounded-lg cursor-pointer ${enabled ? "bg-colorPrimaryBgHover" : ""}  transition-all ease-linear duration-400`}
    >
      {children}
    </div>
  );
}
