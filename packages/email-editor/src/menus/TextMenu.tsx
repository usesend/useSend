import { BubbleMenu, BubbleMenuProps, isTextSelection } from "@tiptap/react";
import {
  AlignCenterIcon,
  AlignLeftIcon,
  AlignRightIcon,
  BoldIcon,
  ChevronDown,
  CodeIcon,
  Heading1Icon,
  Heading2Icon,
  Heading3Icon,
  ItalicIcon,
  LinkIcon,
  ListIcon,
  ListOrderedIcon,
  LucideIcon,
  PilcrowIcon,
  StrikethroughIcon,
  TextIcon,
  TextQuoteIcon,
  UnderlineIcon,
} from "lucide-react";
import { TextMenuButton } from "./TextMenuButton";
import { Button } from "@usesend/ui/src/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@usesend/ui/src/popover";
import { Separator } from "@usesend/ui/src/separator";
import { useMemo, useState } from "react";
import { LinkEditorPanel } from "../components/panels/LinkEditorPanel";
// import { allowedLogoAlignment } from "../nodes/logo";

export interface TextMenuItem {
  name: string;
  isActive: () => boolean;
  command: () => void;
  shouldShow?: () => boolean;
  icon?: LucideIcon;
}

export type TextMenuProps = Omit<BubbleMenuProps, "children">;

export type ContentTypePickerOption = {
  label: string;
  id: string;
  type: "option";
  disabled: () => boolean | undefined;
  isActive: () => boolean | undefined;
  onClick: () => void;
  icon: LucideIcon;
};

const textColors = [
  {
    name: "default",
    value: "#000000",
  },
  {
    name: "red",
    value: "#dc2626",
  },
  {
    name: "green",
    value: "#16a34a",
  },
  {
    name: "blue",
    value: "#2563eb",
  },
  {
    name: "yellow",
    value: "#eab308",
  },
  {
    name: "purple",
    value: "#a855f7",
  },
  {
    name: "orange",
    value: "#f97316",
  },
  {
    name: "pink",
    value: "#db2777",
  },
  {
    name: "gray",
    value: "#6b7280",
  },
];

export function TextMenu(props: TextMenuProps) {
  const { editor } = props;

  const icons = [AlignLeftIcon, AlignCenterIcon, AlignRightIcon];
  const alignmentItems: TextMenuItem[] = ["left", "center", "right"].map(
    (alignment, index) => ({
      name: alignment,
      isActive: () => editor?.isActive({ textAlign: alignment })!,
      command: () => {
        if (props?.editor?.isActive({ textAlign: alignment })) {
          props?.editor?.chain()?.focus().unsetTextAlign().run();
        } else {
          props?.editor?.chain().focus().setTextAlign(alignment).run()!;
        }
      },
      icon: icons[index],
    })
  );

  const items: TextMenuItem[] = useMemo(
    () => [
      {
        name: "bold",
        isActive: () => editor?.isActive("bold")!,
        command: () => editor?.chain().focus().toggleBold().run()!,
        icon: BoldIcon,
      },
      {
        name: "italic",
        isActive: () => editor?.isActive("italic")!,
        command: () => editor?.chain().focus().toggleItalic().run()!,
        icon: ItalicIcon,
      },
      {
        name: "underline",
        isActive: () => editor?.isActive("underline")!,
        command: () => editor?.chain().focus().toggleUnderline().run()!,
        icon: UnderlineIcon,
      },
      {
        name: "strike",
        isActive: () => editor?.isActive("strike")!,
        command: () => editor?.chain().focus().toggleStrike().run()!,
        icon: StrikethroughIcon,
      },
      {
        name: "code",
        isActive: () => editor?.isActive("code")!,
        command: () => editor?.chain().focus().toggleCode().run()!,
        icon: CodeIcon,
      },
      ...alignmentItems,
    ],
    [editor]
  );

  const contentTypePickerOptions: ContentTypePickerOption[] = useMemo(
    () => [
      // {
      //   label: "Text",
      //   id: "text",
      //   type: "option",
      //   disabled: () => false,
      //   isActive: () => editor?.isActive("text")!,
      //   onClick: () => editor?.chain().focus().setNode("text")?.run()!,
      // },
      {
        icon: TextIcon,
        onClick: () =>
          editor
            ?.chain()
            .focus()
            .lift("taskItem")
            .liftListItem("listItem")
            .setParagraph()
            .run(),
        id: "text",
        disabled: () => !editor?.can().setParagraph(),
        isActive: () =>
          editor?.isActive("paragraph") &&
          !editor?.isActive("orderedList") &&
          !editor?.isActive("bulletList") &&
          !editor?.isActive("taskList"),
        label: "Text",
        type: "option",
      },
      {
        icon: Heading1Icon,
        onClick: () =>
          editor
            ?.chain()
            .focus()
            .lift("taskItem")
            .liftListItem("listItem")
            .setHeading({ level: 1 })
            .run(),
        id: "heading1",
        disabled: () => !editor?.can().setHeading({ level: 1 }),
        isActive: () => editor?.isActive("heading", { level: 1 }),
        label: "Heading 1",
        type: "option",
      },
      {
        icon: Heading2Icon,
        onClick: () =>
          editor
            ?.chain()
            ?.focus()
            ?.lift("taskItem")
            .liftListItem("listItem")
            .setHeading({ level: 2 })
            .run(),
        id: "heading2",
        disabled: () => !editor?.can().setHeading({ level: 2 }),
        isActive: () => editor?.isActive("heading", { level: 2 }),
        label: "Heading 2",
        type: "option",
      },
      {
        icon: Heading3Icon,
        onClick: () =>
          editor
            ?.chain()
            ?.focus()
            ?.lift("taskItem")
            .liftListItem("listItem")
            .setHeading({ level: 3 })
            .run(),
        id: "heading3",
        disabled: () => !editor?.can().setHeading({ level: 3 }),
        isActive: () => editor?.isActive("heading", { level: 3 }),
        label: "Heading 3",
        type: "option",
      },
      {
        icon: ListIcon,
        onClick: () => editor?.chain()?.focus()?.toggleBulletList()?.run(),
        id: "bulletList",
        disabled: () => !editor?.can()?.toggleBulletList(),
        isActive: () => editor?.isActive("bulletList"),
        label: "Bullet list",
        type: "option",
      },
      {
        icon: ListOrderedIcon,
        onClick: () => editor?.chain()?.focus()?.toggleOrderedList()?.run(),
        id: "orderedList",
        disabled: () => !editor?.can()?.toggleOrderedList(),
        isActive: () => editor?.isActive("orderedList"),
        label: "Numbered list",
        type: "option",
      },
    ],
    [editor, editor?.state]
  );

  const bubbleMenuProps: TextMenuProps = {
    ...props,
    shouldShow: ({ editor, state, from, to }) => {
      const { doc, selection } = state;
      const { empty } = selection;

      // Sometime check for `empty` is not enough.
      // Doubleclick an empty paragraph returns a node size of 2.
      // So we check also for an empty text size.
      const isEmptyTextBlock =
        !doc.textBetween(from, to).length && isTextSelection(state.selection);

      if (
        empty ||
        isEmptyTextBlock ||
        !editor.isEditable ||
        editor.isActive("image") ||
        editor.isActive("logo") ||
        editor.isActive("spacer") ||
        editor.isActive("variable") ||
        editor.isActive("link") ||
        editor.isActive({
          component: "button",
        })
      ) {
        return false;
      }

      return true;
    },
    tippyOptions: {
      maxWidth: "100%",
      moveTransition: "transform 0.15s ease-out",
    },
  };

  const selectedColor = editor?.getAttributes("textStyle")?.color;
  const activeItem = useMemo(
    () =>
      contentTypePickerOptions.find(
        (option) => option.type === "option" && option.isActive()
      ),
    [contentTypePickerOptions]
  );

  return (
    <BubbleMenu
      {...bubbleMenuProps}
      className="flex gap-1 rounded-md border border-gray-200 bg-white shadow-md items-center"
    >
      <ContentTypePicker options={contentTypePickerOptions} />
      <EditLinkPopover
        onSetLink={(url) => {
          editor
            ?.chain()
            .focus()
            .setLink({ href: url, target: "_blank" })
            .run();

          // editor?.commands.blur();
        }}
      />
      <Separator orientation="vertical" className="h-6 bg-slate-300" />
      {items.map((item, index) => (
        <TextMenuButton key={index} {...item} />
      ))}
      <Separator orientation="vertical" className="h-6 bg-slate-300" />
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            className="hover:bg-slate-100 hover:text-slate-900"
          >
            <span style={{ color: selectedColor }}>A</span>
            <ChevronDown className="h-4 w-4 ml-1.5 text-gray-800" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          side="bottom"
          align="start"
          className="bg-white text-slate-900 w-52 px-1 border border-gray-200"
          sideOffset={16}
        >
          {textColors.map((color) => (
            <button
              key={color.value}
              onClick={() => editor?.chain().setColor(color.value).run()}
              className={`flex gap-2 items-center p-1 px-2 w-full ${
                selectedColor === color.value ||
                (selectedColor === undefined && color.value === "#000000")
                  ? "bg-gray-200 rounded-md"
                  : ""
              }`}
            >
              <span style={{ color: color.value }}>A</span>
              <span className=" capitalize">{color.name}</span>
            </button>
          ))}
        </PopoverContent>
      </Popover>
    </BubbleMenu>
  );
}

type ContentTypePickerProps = {
  options: ContentTypePickerOption[];
};

function ContentTypePicker({ options }: ContentTypePickerProps) {
  const activeOption = useMemo(
    () => options.find((option) => option.isActive()),
    [options]
  );

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          className="hover:bg-slate-100  hover:text-slate-600 text-slate-600 px-2"
        >
          <span>{activeOption?.label || "Text"}</span>
          <ChevronDown className="h-4 w-4 ml-1.5 text-gray-800" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        side="bottom"
        align="start"
        className="bg-white border-gray-200 text-slate-900 w-52 px-1"
        sideOffset={16}
      >
        {options.map((option) => (
          <button
            key={option.id}
            onClick={() => {
              option.onClick();
            }}
            className={`flex gap-2 items-center p-1 px-2 w-full ${
              option.isActive() ? "bg-slate-100 rounded-md" : ""
            }`}
          >
            <option.icon className="h-3.5 w-3.5" />
            <span className=" capitalize">{option.label}</span>
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}

type EditLinkPopoverType = {
  onSetLink: (url: string) => void;
};

function EditLinkPopover({ onSetLink }: EditLinkPopoverType) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          className="hover:bg-slate-100 hover:text-slate-600 text-slate-600 px-2"
        >
          <span>Link</span>
          <LinkIcon className="h-3.5 w-3.5 ml-1.5 text-gray-800" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        side="bottom"
        align="start"
        className="bg-white text-slate-900 px-1 w-[17rem] py-1 border border-gray-200"
        sideOffset={16}
      >
        <LinkEditorPanel onSetLink={onSetLink} />
      </PopoverContent>
    </Popover>
  );
}
