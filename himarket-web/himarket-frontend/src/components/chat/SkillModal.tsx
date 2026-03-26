import { useMemo, useState } from "react";
import { Modal, Input, Button, Empty, type ModalProps } from "antd";
import { CloseOutlined, SearchOutlined } from "@ant-design/icons";
import { ProductIconRenderer } from "../icon/ProductIconRenderer";
import { getIconString } from "../../lib/iconUtils";

export type SkillOption = {
  productId: string;
  name: string;
  categoryNames: string[];
  description?: string;
  icon?: any;
};

interface SkillModalProps extends ModalProps {
  categories: string[];
  data: SkillOption[];
  added: SkillOption[];
  onAdd: (product: SkillOption) => void;
  onRemove: (product: SkillOption) => void;
  onClose: () => void;
}

function SkillCard({ data, isAdded, onAdd, onRemove }: { data: SkillOption, isAdded: boolean, onAdd: (s: SkillOption) => void, onRemove: (s: SkillOption) => void }) {
  return (
    <div
      className="
        bg-white/60 backdrop-blur-sm rounded-2xl p-5
        border border-[#e5e5e5]
        transition-all duration-300 ease-in-out
        hover:bg-white hover:shadow-md hover:scale-[1.02] hover:border-colorPrimary/30
        relative overflow-hidden group
        h-[200px] flex flex-col gap-4
      "
    >
      <div className="flex gap-3 items-start">
        <div className="w-14 h-14 shrink-0">
          <ProductIconRenderer className="w-full h-full object-cover" iconType={getIconString(data.icon)} />
        </div>
        <div className="flex flex-col justify-start h-full flex-1 min-w-0">
          <h3 className="font-medium text-base truncate leading-7">{data.name}</h3>
        </div>
      </div>
      <div className="flex-1 overflow-hidden">
        <p className="text-sm text-colorTextSecondaryCustom line-clamp-2">
          {data.description || '暂无描述'}
        </p>
      </div>
      <div className="flex gap-2">
        <Button
          type={isAdded ? "default" : "primary"}
          block
          onClick={(e) => {
            e.stopPropagation();
            isAdded ? onRemove(data) : onAdd(data);
          }}
        >
          {isAdded ? '取消选择' : '选择'}
        </Button>
      </div>
    </div>
  );
}

function SkillModal(props: SkillModalProps) {
  const {
    data, categories, added,
    onAdd, onRemove, onClose,
    ...modalProps
  } = props;
  const [searchText, setSearchText] = useState("");
  const [active, setActive] = useState("all");

  const addedIds = useMemo(() => {
    return added.map(v => v.productId);
  }, [added]);

  const filteredData = useMemo(() => {
    let list = data;
    if (active !== "all") {
      list = data.filter(item => item.categoryNames.includes(active));
    }

    if (searchText.trim()) {
      list = list.filter(item => item.name.toLowerCase().includes(searchText.trim().toLowerCase()));
    }
    return list;
  }, [data, active, added, searchText]);

  return (
    <Modal
      width={window.innerWidth * 0.9}
      height={window.innerHeight * 0.8}
      closable={false}
      footer={null}
      onCancel={onClose}
      keyboard={true}
      {...modalProps}
    >
      <div className="flex p-2 gap-2 h-[70vh]">
        <div className="flex-1 flex flex-col overflow-y-auto" data-sign-name="sidebar">
          <div className="flex px-1 flex-col gap-2">
            <button
              className={`
                flex items-center rounded-lg 
                transition-all duration-200 ease-in-out
                hover:bg-colorPrimaryBgHover hover:shadow-md 
                hover:scale-[1.02] active:scale-95 text-nowrap 
                overflow-hidden w-full px-5 py-2 justify-between outline-none focus:outline-none focus-visible:outline-none ring-0 focus:ring-0
                ${active === "all" ? "bg-colorPrimaryBgHover shadow-md scale-[1.02]" : "bg-white"}
              `}
              onClick={() => setActive("all")}
            >
              全部
            </button>
            {
              categories.map((item) => (
                <button
                  key={item}
                  className={`
                    flex items-center rounded-lg 
                    transition-all duration-200 ease-in-out
                    hover:bg-colorPrimaryBgHover hover:shadow-md 
                    hover:scale-[1.02] active:scale-95 text-nowrap 
                    overflow-hidden w-full px-5 py-2 justify-between outline-none focus:outline-none focus-visible:outline-none ring-0 focus:ring-0
                    ${active === item ? "bg-colorPrimaryBgHover shadow-md scale-[1.02]" : "bg-white"}
                  `}
                  onClick={() => setActive(item)}
                >
                  {item}
                </button>
              ))
            }
          </div>
        </div>

        <div className="flex-[5] flex flex-col gap-4 overflow-hidden" data-sign-name="skill-list">
          <div className="flex flex-col gap-2">
            <div className="flex w-full gap-4 justify-between">
              <Input
                placeholder="搜索技能..."
                prefix={<SearchOutlined />}
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                allowClear
                size="large"
              />
              <div onClick={onClose} className="flex h-full items-center justify-center cursor-pointer">
                <CloseOutlined />
              </div>
            </div>
          </div>
          {
            filteredData.length === 0 ? (
              <Empty />
            ) : (
              <div className="grid grid-cols-3 gap-4 content-start overflow-y-auto p-1 flex-1">
                {
                  filteredData.map((item) => (
                    <SkillCard
                      key={item.productId}
                      data={item}
                      isAdded={addedIds.includes(item.productId)}
                      onAdd={onAdd}
                      onRemove={onRemove}
                    />
                  ))
                }
              </div>
            )
          }
        </div>
      </div>
    </Modal>
  );
}

export default SkillModal;
