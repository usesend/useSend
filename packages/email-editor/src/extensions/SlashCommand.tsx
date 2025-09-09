import { Editor, Extension, Range, ReactRenderer } from "@tiptap/react";
import Suggestion, { SuggestionOptions } from "@tiptap/suggestion";
import { cn } from "@usesend/ui/lib/utils";
import {
  CodeIcon,
  DivideIcon,
  EraserIcon,
  Heading1Icon,
  Heading2Icon,
  Heading3Icon,
  ImageIcon,
  ListIcon,
  ListOrderedIcon,
  RectangleEllipsisIcon,
  SquareSplitVerticalIcon,
  TextIcon,
  TextQuoteIcon,
  UserXIcon,
  VariableIcon,
} from "lucide-react";
import {
  ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import tippy, { GetReferenceClientRect } from "tippy.js";
import { UploadFn } from "./ImageExtension";

export interface CommandProps {
  editor: Editor;
  range: Range;
}

interface CommandItemProps {
  title: string;
  description: string;
  icon: ReactNode;
}

export type SlashCommandItem = {
  title: string;
  description: string;
  searchTerms: string[];
  icon: ReactNode;
  command: (options: CommandProps) => void;
};

export const SlashCommand = Extension.create({
  name: "slash-command",
  addOptions() {
    return {
      suggestion: {
        char: "/",
        command: ({
          editor,
          range,
          props,
        }: {
          editor: Editor;
          range: Range;
          props: any;
        }) => {
          props.command({ editor, range });
        },
      },
      uploadImage: undefined as UploadFn | undefined,
    };
  },
  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        ...this.options.suggestion,
      }),
    ];
  },
});

const DEFAULT_SLASH_COMMANDS = (uploadImage?: UploadFn): SlashCommandItem[] => [
  {
    title: "Text",
    description: "Just start typing with plain text.",
    searchTerms: ["p", "paragraph"],
    icon: <TextIcon className="h-4 w-4" />,
    command: ({ editor, range }) => {
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .toggleNode("paragraph", "paragraph")
        .run();
    },
  },
  {
    title: "Heading 1",
    description: "Big section heading.",
    searchTerms: ["title", "big", "large"],
    icon: <Heading1Icon className="h-4 w-4" />,
    command: ({ editor, range }: CommandProps) => {
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .setNode("heading", { level: 1 })
        .run();
    },
  },
  {
    title: "Heading 2",
    description: "Medium section heading.",
    searchTerms: ["subtitle", "medium"],
    icon: <Heading2Icon className="h-4 w-4" />,
    command: ({ editor, range }: CommandProps) => {
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .setNode("heading", { level: 2 })
        .run();
    },
  },
  {
    title: "Heading 3",
    description: "Small section heading.",
    searchTerms: ["subtitle", "small"],
    icon: <Heading3Icon className="h-4 w-4" />,
    command: ({ editor, range }: CommandProps) => {
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .setNode("heading", { level: 3 })
        .run();
    },
  },
  {
    title: "Bullet List",
    description: "Create a simple bullet list.",
    searchTerms: ["unordered", "point"],
    icon: <ListIcon className="h-4 w-4" />,
    command: ({ editor, range }: CommandProps) => {
      editor.chain().focus().deleteRange(range).toggleBulletList().run();
    },
  },
  {
    title: "Numbered List",
    description: "Create a list with numbering.",
    searchTerms: ["ordered"],
    icon: <ListOrderedIcon className="h-4 w-4" />,
    command: ({ editor, range }: CommandProps) => {
      editor.chain().focus().deleteRange(range).toggleOrderedList().run();
    },
  },
  {
    title: "Image",
    description: "Full width image",
    searchTerms: ["image"],
    icon: <ImageIcon className="h-4 w-4" />,
    command: ({ editor, range }: CommandProps) => {
      if (uploadImage) {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = "image/*";
        input.onchange = async () => {
          const file = input.files?.[0];
          if (file && uploadImage) {
            editor.chain().focus().deleteRange(range).run();
            const placeholder = URL.createObjectURL(file);
            editor
              .chain()
              .focus()
              .setImage({ src: placeholder })
              .updateAttributes("image", { isUploading: true })
              .run();
            try {
              console.log("before upload");
              const url = await uploadImage(file);
              editor
                .chain()
                .focus()
                .updateAttributes("image", { src: url, isUploading: false })
                .run();
            } catch (e) {
              editor.chain().focus().deleteNode("image").run();
              console.error("Failed to upload image:", e);
            }
          }
        };
        input.click();
      } else {
        const imageUrl = prompt("Image URL: ") || "";

        if (!imageUrl) {
          return;
        }

        editor.chain().focus().deleteRange(range).run();
        editor.chain().focus().setImage({ src: imageUrl }).run();
      }
    },
  },
  {
    title: "Hard Break",
    description: "Add a break between lines.",
    searchTerms: ["break", "line"],
    icon: <DivideIcon className="h-4 w-4" />,
    command: ({ editor, range }: CommandProps) => {
      editor.chain().focus().deleteRange(range).setHardBreak().run();
    },
  },
  {
    title: "Blockquote",
    description: "Add blockquote.",
    searchTerms: ["quote", "blockquote"],
    icon: <TextQuoteIcon className="h-4 w-4" />,
    command: ({ editor, range }: CommandProps) => {
      editor.chain().focus().deleteRange(range).toggleBlockquote().run();
    },
  },
  {
    title: "Button",
    description: "Add code.",
    searchTerms: ["button"],
    icon: <RectangleEllipsisIcon className="h-4 w-4" />,
    command: ({ editor, range }: CommandProps) => {
      editor.chain().focus().deleteRange(range).setButton().run();
    },
  },
  {
    title: "Code Block",
    description: "Add code.",
    searchTerms: ["code"],
    icon: <CodeIcon className="h-4 w-4" />,
    command: ({ editor, range }: CommandProps) => {
      editor.chain().focus().deleteRange(range).toggleCodeBlock().run();
    },
  },
  {
    title: "Horizontal Rule",
    description: "Add a horizontal rule.",
    searchTerms: ["horizontal", "rule"],
    icon: <SquareSplitVerticalIcon className="h-4 w-4" />,
    command: ({ editor, range }: CommandProps) => {
      editor.chain().focus().deleteRange(range).setHorizontalRule().run();
    },
  },
  {
    title: "Clear Line",
    description: "Clear the current line.",
    searchTerms: ["clear", "line"],
    icon: <EraserIcon className="h-4 w-4" />,
    command: ({ editor, range }: CommandProps) => {
      editor.chain().focus().selectParentNode().deleteSelection().run();
    },
  },
  {
    title: "Variable",
    description: "Add a variable.",
    searchTerms: ["variable"],
    icon: <VariableIcon className="h-4 w-4" />,
    command: ({ editor, range }: CommandProps) => {
      editor.chain().focus().deleteRange(range).insertContent("{{").run();
    },
  },
  {
    title: "Unsubscribe Footer",
    description: "Add an unsubscribe link.",
    searchTerms: ["unsubscribe"],
    icon: <UserXIcon className="h-4 w-4" />,
    command: ({ editor, range }: CommandProps) => {
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .setHorizontalRule()
        .insertContent(
          `<unsub data-unsend-component='unsubscribe-footer'><p>You are receiving this email because you opted in via our site.<br/><br/><a href="{{usesend_unsubscribe_url}}">Unsubscribe from the list</a></p><br><br><p>Company name,<br/>00 street name<br/>City, State 000000</p></unsub>`
        )
        .run();
    },
  },
];

export const updateScrollView = (container: HTMLElement, item: HTMLElement) => {
  const containerHeight = container.offsetHeight;
  const itemHeight = item ? item.offsetHeight : 0;

  const top = item.offsetTop;
  const bottom = top + itemHeight;

  if (top < container.scrollTop) {
    container.scrollTop -= container.scrollTop - top + 5;
  } else if (bottom > containerHeight + container.scrollTop) {
    container.scrollTop += bottom - containerHeight - container.scrollTop + 5;
  }
};

const CommandList = ({
  items,
  command,
  editor,
}: {
  items: CommandItemProps[];
  command: (item: CommandItemProps) => void;
  editor: Editor;
  range: any;
}) => {
  const [selectedIndex, setSelectedIndex] = useState(0);

  const selectItem = useCallback(
    (index: number) => {
      const item = items[index];
      if (item) {
        command(item);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [command, editor, items]
  );

  useEffect(() => {
    const navigationKeys = ["ArrowUp", "ArrowDown", "Enter"];
    const onKeyDown = (e: KeyboardEvent) => {
      if (navigationKeys.includes(e.key)) {
        e.preventDefault();
        if (e.key === "ArrowUp") {
          setSelectedIndex((selectedIndex + items.length - 1) % items.length);
          return true;
        }
        if (e.key === "ArrowDown") {
          setSelectedIndex((selectedIndex + 1) % items.length);
          return true;
        }
        if (e.key === "Enter") {
          selectItem(selectedIndex);
          return true;
        }
        return false;
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [items, selectedIndex, setSelectedIndex, selectItem]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [items]);

  const commandListContainer = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const container = commandListContainer?.current;

    const item = container?.children[selectedIndex] as HTMLElement;

    if (item && container) updateScrollView(container, item);
  }, [selectedIndex]);

  return items.length > 0 ? (
    <div className="z-50 w-52 rounded-md border border-gray-200 bg-white shadow-md transition-all">
      <div
        id="slash-command"
        ref={commandListContainer}
        className="no-scrollbar h-auto max-h-[330px] overflow-y-auto scroll-smooth px-1 py-2"
      >
        {items.map((item: CommandItemProps, index: number) => {
          return (
            <button
              className={cn(
                "flex w-full items-center space-x-2 rounded-md px-2 py-1 text-left text-sm text-gray-900 hover:bg-gray-100 hover:text-gray-900",
                index === selectedIndex
                  ? "bg-gray-100 text-gray-900"
                  : "bg-transparent"
              )}
              key={index}
              onClick={() => selectItem(index)}
              type="button"
            >
              <div className="flex h-6 w-6 shrink-0 items-center justify-center">
                {item.icon}
              </div>
              <div>
                <p className="font-medium">{item.title}</p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  ) : null;
};

export function getSlashCommandSuggestions(
  commands: SlashCommandItem[] = [],
  uploadImage?: UploadFn
): Omit<SuggestionOptions, "editor"> {
  return {
    items: ({ query }) => {
      return [...DEFAULT_SLASH_COMMANDS(uploadImage), ...commands].filter(
        (item) => {
          if (typeof query === "string" && query.length > 0) {
            const search = query.toLowerCase();
            return (
              item.title.toLowerCase().includes(search) ||
              item.description.toLowerCase().includes(search) ||
              (item.searchTerms &&
                item.searchTerms.some((term: string) => term.includes(search)))
            );
          }
          return true;
        }
      );
    },
    render: () => {
      let component: ReactRenderer<any>;
      let popup: InstanceType<any> | null = null;

      return {
        onStart: (props) => {
          component = new ReactRenderer(CommandList, {
            props,
            editor: props.editor,
          });

          popup = tippy("body", {
            getReferenceClientRect: props.clientRect as GetReferenceClientRect,
            appendTo: () => document.body,
            content: component.element,
            showOnCreate: true,
            interactive: true,
            trigger: "manual",
          });
        },
        onUpdate: (props) => {
          component?.updateProps(props);

          popup &&
            popup[0].setProps({
              getReferenceClientRect: props.clientRect,
            });
        },
        onKeyDown: (props) => {
          if (props.event.key === "Escape") {
            popup?.[0].hide();

            return true;
          }

          return component?.ref?.onKeyDown(props);
        },
        onExit: () => {
          if (!popup || !popup?.[0] || !component) {
            return;
          }

          popup?.[0].destroy();
          component?.destroy();
        },
      };
    },
  };
}
