import { NodeViewProps, NodeViewWrapper, ReactRenderer } from "@tiptap/react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@usesend/ui/src/popover";
import { cn } from "@usesend/ui/lib/utils";
import { Input } from "@usesend/ui/src/input";
import { Button } from "@usesend/ui/src/button";
import { forwardRef, useEffect, useImperativeHandle, useState } from "react";
import { SuggestionOptions } from "@tiptap/suggestion";
import tippy, { GetReferenceClientRect } from "tippy.js";
import { CheckIcon, TriangleAlert } from "lucide-react";

export interface VariableOptions {
  name: string;
  fallback: string;
}

export const VariableList = forwardRef((props: any, ref) => {
  const [selectedIndex, setSelectedIndex] = useState(0);

  const selectItem = (index: number) => {
    const item = props.items[index];

    console.log("item: ", item);

    if (item) {
      props.command({ id: item, name: item, fallback: "" });
    }
  };

  useEffect(() => setSelectedIndex(0), [props.items]);

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }: { event: KeyboardEvent }) => {
      if (event.key === "ArrowUp") {
        setSelectedIndex(
          (selectedIndex + props.items.length - 1) % props.items.length
        );
        return true;
      }

      if (event.key === "ArrowDown") {
        setSelectedIndex((selectedIndex + 1) % props.items.length);
        return true;
      }

      if (event.key === "Enter") {
        selectItem(selectedIndex);
        return true;
      }

      return false;
    },
  }));

  return (
    <div className="z-50 h-auto min-w-[128px] rounded-md border border-gray-200 bg-white p-1 shadow-md transition-all">
      {props?.items?.length ? (
        props?.items?.map((item: string, index: number) => (
          <button
            key={index}
            onClick={() => selectItem(index)}
            className={cn(
              "flex w-full space-x-2 rounded-md px-2 py-1 text-left text-sm text-gray-900 hover:bg-gray-100",
              index === selectedIndex ? "bg-gray-200" : "bg-white"
            )}
          >
            {item}
          </button>
        ))
      ) : (
        <button className="flex w-full space-x-2 rounded-md bg-white px-2 py-1 text-left text-sm text-gray-900 hover:bg-gray-100">
          No result
        </button>
      )}
    </div>
  );
});

VariableList.displayName = "VariableList";

export function getVariableSuggestions(
  variables: Array<string> = []
): Omit<SuggestionOptions, "editor"> {
  return {
    items: ({ query }) => {
      return variables
        .concat(query.length > 0 ? [query] : [])
        .filter((item) => item.toLowerCase().startsWith(query.toLowerCase()))
        .slice(0, 5);
    },

    render: () => {
      let component: ReactRenderer<any>;
      let popup: InstanceType<any> | null = null;

      return {
        onStart: (props) => {
          component = new ReactRenderer(VariableList, {
            props,
            editor: props.editor,
          });

          if (!props.clientRect) {
            return;
          }

          popup = tippy("body", {
            getReferenceClientRect: props.clientRect as GetReferenceClientRect,
            appendTo: () => document.body,
            content: component.element,
            showOnCreate: true,
            interactive: true,
            trigger: "manual",
            placement: "bottom-start",
          });
        },

        onUpdate(props) {
          component.updateProps(props);

          if (!props.clientRect) {
            return;
          }

          popup?.[0]?.setProps({
            getReferenceClientRect: props.clientRect as GetReferenceClientRect,
          });
        },

        onKeyDown(props) {
          if (props.event.key === "Escape") {
            popup?.[0].hide();

            return true;
          }

          return component.ref?.onKeyDown(props);
        },

        onExit() {
          if (!popup || !popup?.[0] || !component) {
            return;
          }

          popup?.[0].destroy();
          component.destroy();
        },
      };
    },
  };
}

export function VariableComponent(props: NodeViewProps) {
  const { name, fallback } = props.node.attrs as VariableOptions;
  const [fallbackValue, setFallbackValue] = useState(fallback);
  const { getPos, editor } = props;

  console.log(props.selected);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    props.updateAttributes({
      fallback: fallbackValue,
    });
  };

  return (
    <NodeViewWrapper
      className={`react-component inline-block ${
        props.selected && "ProseMirror-selectednode"
      }`}
      draggable="false"
      data-drag-handle=""
    >
      <Popover open={props.selected}>
        <PopoverTrigger asChild>
          <button
            className={cn(
              "inline-flex items-center justify-center rounded-md text-sm gap-1 ring-offset-white transition-colors",
              "px-2 border border-gray-300 shadow-sm  cursor-pointer text-foreground/80"
            )}
            onClick={(e) => {
              e.preventDefault();
              const pos = getPos();
              editor.commands.setNodeSelection(pos);
            }}
          >
            <span className="">{`{{${name}}}`}</span>
            {!fallback ? (
              <TriangleAlert className="w-3 h-3 text-orange-400" />
            ) : null}
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          side="top"
          className="space-y-2 light border-gray-200"
          sideOffset={10}
          onOpenAutoFocus={(e) => e.preventDefault()}
          onCloseAutoFocus={(e) => e.preventDefault()}
        >
          <form onSubmit={handleSubmit} className="flex gap-2 items-center">
            <Input
              placeholder="Fallback value"
              value={fallbackValue}
              onChange={(e) => {
                setFallbackValue(e.target.value);
              }}
              autoFocus
            />
            <Button variant="silent" size="sm" className="px-1" type="submit">
              <CheckIcon className="h-4 w-4" />
            </Button>
          </form>
          <div className="text-sm text-muted-foreground">
            Fallback value will be used if the variable value is empty.
          </div>
        </PopoverContent>
      </Popover>
    </NodeViewWrapper>
  );
}
