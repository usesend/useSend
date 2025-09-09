import { NodeViewProps, NodeViewWrapper } from "@tiptap/react";
import {
  AlignCenterIcon,
  AlignLeftIcon,
  AlignRightIcon,
  BoxSelectIcon,
  LinkIcon,
  ScanIcon,
} from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@usesend/ui/src/popover";
import { cn } from "@usesend/ui/lib/utils";
import { Input } from "@usesend/ui/src/input";
import { Button } from "@usesend/ui/src/button";
import { AllowedAlignments, ButtonOptions } from "../types";
import { Separator } from "@usesend/ui/src/separator";
import { BorderWidth } from "../components/ui/icons/BorderWidth";
import { ColorPickerPopup } from "../components/ui/ColorPicker";
import { LinkEditorPanel } from "../components/panels/LinkEditorPanel";
import { useState } from "react";
import {
  Tooltip,
  TooltipProvider,
  TooltipContent,
  TooltipTrigger,
} from "@usesend/ui/src/tooltip";

const alignments: Array<AllowedAlignments> = ["left", "center", "right"];

export function ButtonComponent(props: NodeViewProps) {
  const {
    url,
    text,
    alignment,
    borderRadius: _radius,
    buttonColor,
    textColor,
    borderColor,
    borderWidth,
  } = props.node.attrs as ButtonOptions;
  const { getPos, editor } = props;

  const [editUrlOpen, setEditUrlOpen] = useState(false);

  console.log(props);

  return (
    <NodeViewWrapper
      className={`react-component ${
        props.selected && "ProseMirror-selectednode"
      }`}
      draggable="true"
      data-drag-handle=""
      style={{
        textAlign: alignment,
      }}
    >
      <Popover open={props.selected}>
        <PopoverTrigger asChild>
          <div>
            <div
              className={cn(
                "cursor-pointer",
                "inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-white transition-colors disabled:pointer-events-none disabled:opacity-50",
                "h-10 px-4 py-2",
                "px-[32px] py-[20px] font-semibold no-underline"
              )}
              tabIndex={-1}
              style={{
                backgroundColor: buttonColor,
                color: textColor,
                borderWidth: Number(borderWidth),
                borderStyle: "solid",
                borderColor: borderColor,
                borderRadius: Number(_radius),
              }}
              onClick={(e) => {
                e.preventDefault();
                const pos = getPos();
                editor.commands.setNodeSelection(pos);
              }}
            >
              <div className="relative flex max-w-full items-center">
                {props.selected}
                <div className="inset-0 flex items-center overflow-hidden ">
                  <span
                    className={cn(
                      " cursor-text",
                      props.selected ? "text-transparent" : ""
                    )}
                  >
                    {text === "" ? "Button text" : text}
                  </span>
                </div>
                {props.selected ? (
                  <form
                    className="absolute inset-x-[-4px] inset-y-0 flex items-center justify-center"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const endPos = props.getPos() + props.node.nodeSize;

                      editor.commands.focus("start");

                      editor
                        .chain()
                        .insertContentAt(endPos, { type: "paragraph" })
                        .focus(endPos)
                        .run();
                    }}
                  >
                    <input
                      type="text"
                      value={text}
                      onChange={(e) => {
                        props.updateAttributes({
                          text: e.target.value,
                        });
                      }}
                      onBlur={() => {
                        editor.commands.setNodeSelection(getPos());
                      }}
                      autoFocus
                      className="w-full bg-transparent text-center outline-none"
                    />
                  </form>
                ) : null}
              </div>
            </div>
          </div>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          side="top"
          className="space-y-2 w-[28rem] light border-gray-200 py-1 px-1"
          sideOffset={10}
          onOpenAutoFocus={(e) => e.preventDefault()}
          onCloseAutoFocus={(e) => e.preventDefault()}
        >
          {/* <div className="flex gap-2">
            <Input
              placeholder="Button text"
              value={text}
              onChange={(e) => {
                props.updateAttributes({
                  text: e.target.value,
                });
              }}
              className="light"
            />
            <Input
              placeholder="Add link here"
              value={url}
              onChange={(e) => {
                props.updateAttributes({
                  url: e.target.value,
                });
              }}
            />
          </div> */}

          <TooltipProvider>
            <div className="flex gap-1 items-center">
              <div>
                <div className="flex">
                  {alignments.map((alignment) => (
                    <Tooltip key={alignment}>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          key={alignment}
                          className=""
                          size="sm"
                          type="button"
                          onClick={() => {
                            props.updateAttributes({
                              alignment,
                            });
                          }}
                        >
                          <AlignmentIcon alignment={alignment} />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Align {alignment}</p>
                      </TooltipContent>
                    </Tooltip>
                  ))}
                </div>
              </div>
              <Separator orientation="vertical" className=" h-6 my-auto" />
              <div>
                <div className="flex">
                  <Tooltip>
                    <TooltipTrigger>
                      <ColorPickerPopup
                        trigger={
                          <div
                            className="h-4 w-4 rounded border"
                            style={{
                              backgroundColor: buttonColor,
                            }}
                          />
                        }
                        color={buttonColor}
                        onChange={(color) => {
                          props.updateAttributes({
                            buttonColor: color,
                          });
                        }}
                      />
                    </TooltipTrigger>
                    <TooltipContent>Background color</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger>
                      <ColorPickerPopup
                        trigger={
                          <div className="flex flex-col items-center justify-center gap-[1px]">
                            <span className="font-bolder font-mono text-xs text-slate-700">
                              A
                            </span>
                            <div
                              className="h-[2px] w-3"
                              style={{ backgroundColor: textColor }}
                            />
                          </div>
                        }
                        color={textColor}
                        onChange={(color) => {
                          props.updateAttributes({
                            textColor: color,
                          });
                        }}
                      />
                    </TooltipTrigger>
                    <TooltipContent>Text color</TooltipContent>
                  </Tooltip>
                </div>
              </div>
              <Separator orientation="vertical" className=" h-6 my-auto" />
              <div>
                <div className="flex gap-1">
                  <Tooltip>
                    <TooltipTrigger>
                      <div className="flex items-center border border-transparent hover:border-border focus-within:border-border gap-1 px-1 py-0.5 rounded-md">
                        <ScanIcon className="text-slate-700 h-4 w-4" />
                        <Input
                          value={_radius}
                          onChange={(e) =>
                            props.updateAttributes({
                              borderRadius: e.target.value,
                            })
                          }
                          className="border-0 focus-visible:ring-0 h-6 p-0 w-5"
                        />
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>Border radius</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger>
                      <div className="flex items-center border border-transparent hover:border-border focus-within:border-border gap-1 px-1 py-0.5 rounded-md">
                        <BorderWidth className="text-slate-700 h-4 w-4" />
                        <Input
                          value={borderWidth}
                          onChange={(e) =>
                            props.updateAttributes({
                              borderWidth: e.target.value,
                            })
                          }
                          className="border-0 focus-visible:ring-0 h-6 p-0 w-5"
                        />
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>Border width</TooltipContent>
                  </Tooltip>

                  <Tooltip>
                    <TooltipTrigger>
                      <ColorPickerPopup
                        trigger={
                          <BoxSelectIcon
                            className="h-4 w-4"
                            style={{ color: borderColor }}
                          />
                        }
                        color={borderColor}
                        onChange={(color) => {
                          props.updateAttributes({
                            borderColor: color,
                          });
                        }}
                      />
                    </TooltipTrigger>
                    <TooltipContent>Border color</TooltipContent>
                  </Tooltip>
                </div>
              </div>
              <Separator orientation="vertical" className=" h-6 my-auto" />
              <Popover open={editUrlOpen} onOpenChange={setEditUrlOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="ghost"
                    className="px-2"
                    size="sm"
                    type="button"
                  >
                    Link
                    <LinkIcon className="h-4 w-4 ml-2" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="light border-gray-200 px-4 py-2">
                  <LinkEditorPanel
                    initialUrl={url}
                    onSetLink={(u) => {
                      props.updateAttributes({
                        url: u,
                      });
                      setEditUrlOpen(false);
                    }}
                  />
                </PopoverContent>
              </Popover>
            </div>
          </TooltipProvider>
        </PopoverContent>
      </Popover>
    </NodeViewWrapper>
  );
}

const AlignmentIcon = ({ alignment }: { alignment: AllowedAlignments }) => {
  if (alignment === "left") {
    return <AlignLeftIcon className="h-4 w-4" />;
  } else if (alignment === "center") {
    return <AlignCenterIcon className="h-4 w-4" />;
  } else if (alignment === "right") {
    return <AlignRightIcon className="h-4 w-4" />;
  }
  return null;
};
