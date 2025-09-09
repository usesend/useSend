import { NodeViewProps } from "@tiptap/core";
import { CSSProperties, useRef, useState } from "react";
import { useEvent } from "../hooks/useEvent";
import { NodeViewWrapper } from "@tiptap/react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@usesend/ui/src/popover";
import {
  ExpandIcon,
  ScanIcon,
  LinkIcon,
  ImageIcon,
  TypeIcon,
} from "lucide-react";
import { Input } from "@usesend/ui/src/input";
import { BorderWidth } from "../components/ui/icons/BorderWidth";
import { ColorPickerPopup } from "../components/ui/ColorPicker";
import { AllowedAlignments } from "../types";
import { Button } from "@usesend/ui/src/button";
import { AlignmentIcon } from "../components/ui/icons/AlignmentIcon";
import {
  Tooltip,
  TooltipProvider,
  TooltipContent,
  TooltipTrigger,
} from "@usesend/ui/src/tooltip";
import { Separator } from "@usesend/ui/src/separator";
import Spinner from "@usesend/ui/src/spinner";
import { LinkEditorPanel } from "../components/panels/LinkEditorPanel";
import { TextEditorPanel } from "../components/panels/TextEditorPanel";

const alignments: Array<AllowedAlignments> = ["left", "center", "right"];

const MIN_WIDTH = 60;

export function ResizableImageTemplate(props: NodeViewProps) {
  const { node, updateAttributes, selected } = props;

  const imgRef = useRef<HTMLImageElement>(null);

  const [resizingStyle, setResizingStyle] = useState<
    Pick<CSSProperties, "width" | "height"> | undefined
  >();

  let {
    alignment = "center",
    width,
    height,
    borderRadius,
    borderWidth,
    borderColor,
    src,
  } = node.attrs || {};

  const [widthState, setWidthState] = useState<string>(width.toString());
  const [openLink, setOpenLink] = useState(false);
  const [openImgSrc, setOpenImgSrc] = useState(false);
  const [openAltText, setOpenAltText] = useState(false);

  const handleMouseDown = useEvent(
    (event: React.MouseEvent<HTMLDivElement>) => {
      const imageParent = document.querySelector(
        ".ProseMirror-selectednode"
      ) as HTMLDivElement;

      if (!imgRef.current || !imageParent || !selected) {
        return;
      }

      const imageParentWidth = imageParent.offsetWidth;

      event.preventDefault();
      const direction = event.currentTarget.dataset.direction || "--";
      const initialXPosition = event.clientX;
      const currentWidth = imgRef.current.width;
      const currentHeight = imgRef.current.height;
      let newWidth = currentWidth;
      let newHeight = currentHeight;
      const transform = direction === "left" ? -1 : 1;

      const removeListeners = () => {
        window.removeEventListener("mousemove", mouseMoveHandler);
        window.removeEventListener("mouseup", removeListeners);
        updateAttributes({ width: newWidth, height: newHeight });
        setResizingStyle(undefined);
      };

      const mouseMoveHandler = (event: MouseEvent) => {
        newWidth = Math.max(
          currentWidth + transform * (event.clientX - initialXPosition),
          MIN_WIDTH
        );

        if (newWidth > imageParentWidth) {
          newWidth = imageParentWidth;
        }

        newHeight = (newWidth / currentWidth) * currentHeight;

        setResizingStyle({ width: newWidth, height: newHeight });
        setWidthState(newWidth.toString());
        // If mouse is up, remove event listeners
        if (!event.buttons) {
          return removeListeners();
        }
      };

      window.addEventListener("mousemove", mouseMoveHandler);
      window.addEventListener("mouseup", removeListeners);
    }
  );

  const updateWidth = (_newWidth: string) => {
    setWidthState(_newWidth.toString());
    if (!imgRef.current) {
      return;
    }

    const imageParent = document.querySelector(
      ".ProseMirror-selectednode"
    ) as HTMLDivElement;

    const imageParentWidth = imageParent.offsetWidth;

    const currentWidth = imgRef.current.width;
    const currentHeight = imgRef.current.height;

    let newWidth = Number(_newWidth);

    newWidth = newWidth > 59 ? newWidth : 60;

    if (newWidth > imageParentWidth) {
      newWidth = imageParentWidth;
    }

    const newHeight = (newWidth / currentWidth) * currentHeight;

    setResizingStyle({
      width: newWidth > 59 ? newWidth : 60,
      height: newHeight,
    });
  };

  function dragButton(direction: "left" | "right") {
    return (
      <div
        role="button"
        tabIndex={0}
        onMouseDown={handleMouseDown}
        data-direction={direction}
        className=" bg-white bg-opacity-40 border rounded-3xl"
        style={{
          position: "absolute",
          height: "60px",
          width: "7px",
          [direction]: 5,
          top: "50%",
          transform: "translateY(-50%)",
          cursor: "ew-resize",
        }}
      />
    );
  }

  const {
    externalLink,
    alt,
    borderRadius: _br,
    borderColor: _bc,
    isUploading,
    ...attrs
  } = node.attrs || {};

  return (
    <NodeViewWrapper
      as="div"
      draggable
      data-drag-handle
      style={{
        width,
        height,
        borderRadius: Number(borderRadius),
        borderWidth: Number(borderWidth),
        borderColor,
        ...resizingStyle,
        overflow: "hidden",
        position: "relative",
        // Weird! Basically tiptap/prose wraps this in a span and the line height causes an annoying buffer.
        lineHeight: "0px",
        display: "block",
        ...({
          center: { marginLeft: "auto", marginRight: "auto" },
          left: { marginRight: "auto" },
          right: { marginLeft: "auto" },
        }[alignment as string] || {}),
      }}
    >
      <Popover open={props.selected && !isUploading}>
        <PopoverTrigger>
          {isUploading ? (
            <div className="relative w-full h-full">
              <img
                {...attrs}
                className="flex items-center justify-center opacity-70"
              />
              <div className="absolute inset-0 flex items-center justify-center">
                <Spinner className="w-8 h-8 text-foreground" />
              </div>
            </div>
          ) : (
            <img
              {...attrs}
              ref={imgRef}
              style={{
                ...resizingStyle,
                cursor: "default",
                marginBottom: 0,
              }}
            />
          )}

          {selected && !isUploading && (
            <>
              {dragButton("left")}
              {dragButton("right")}
            </>
          )}
        </PopoverTrigger>
        <PopoverContent
          align="start"
          side="top"
          className="light border-gray-200 px-2 py-2 w-[32rem]"
          sideOffset={10}
          onOpenAutoFocus={(e) => e.preventDefault()}
          onCloseAutoFocus={(e) => e.preventDefault()}
        >
          <TooltipProvider>
            <div className="flex items-center gap-1">
              <Tooltip>
                <TooltipTrigger>
                  <div className="flex items-center border border-transparent focus-within:border-border gap-2 px-1 py-0.5 rounded-md">
                    <ExpandIcon className="text-slate-700 h-4 w-4" />
                    <Input
                      value={widthState}
                      onChange={(e) => updateWidth(e.target.value)}
                      className="border-0 focus-visible:ring-0 h-6 p-0 w-8"
                    />
                  </div>
                </TooltipTrigger>
                <TooltipContent>Width</TooltipContent>
              </Tooltip>
              <Separator orientation="vertical" className="h-6 my-auto" />
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
                  <TooltipContent>Align {alignment}</TooltipContent>
                </Tooltip>
              ))}
              <Separator orientation="vertical" className="h-6 my-auto" />

              <Tooltip>
                <TooltipTrigger>
                  <div className="flex items-center border border-transparent focus-within:border-border gap-2 px-1 py-0.5 rounded-md">
                    <ScanIcon className="text-slate-700 h-4 w-4" />
                    <Input
                      value={borderRadius}
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
                  <div className="flex items-center border border-transparent focus-within:border-border gap-2 px-1 py-0.5 rounded-md">
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
                      <div
                        className="h-4 w-4 rounded border"
                        style={{
                          backgroundColor: borderColor,
                        }}
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
              <Separator orientation="vertical" className="h-6 my-auto" />
              <Popover open={openImgSrc} onOpenChange={setOpenImgSrc}>
                <PopoverTrigger asChild>
                  <Button
                    variant="ghost"
                    className="px-2"
                    size="sm"
                    type="button"
                    onClick={() => setOpenImgSrc(true)}
                  >
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <ImageIcon className="h-4 w-4 " />
                      </TooltipTrigger>
                      <TooltipContent>Image source</TooltipContent>
                    </Tooltip>
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="light border-gray-200 px-4 py-2">
                  <LinkEditorPanel
                    initialUrl={src}
                    onSetLink={(u) => {
                      props.updateAttributes({
                        src: u,
                      });
                      setOpenImgSrc(false);
                    }}
                  />
                </PopoverContent>
              </Popover>
              <Popover open={openAltText} onOpenChange={setOpenAltText}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <PopoverTrigger asChild>
                      <Button
                        variant="ghost"
                        className="px-2"
                        size="sm"
                        type="button"
                        onClick={() => setOpenAltText(true)}
                      >
                        <TypeIcon className="h-4 w-4 " />
                      </Button>
                    </PopoverTrigger>
                  </TooltipTrigger>
                  <TooltipContent>Alt text</TooltipContent>
                </Tooltip>
                <PopoverContent className="light border-gray-200 px-4 py-2">
                  <TextEditorPanel
                    initialText={alt}
                    onSetInitialText={(t) => {
                      props.updateAttributes({
                        alt: t,
                      });
                      setOpenAltText(false);
                    }}
                  />
                </PopoverContent>
              </Popover>
              <Popover open={openLink} onOpenChange={setOpenLink}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <PopoverTrigger asChild>
                      <Button
                        variant="ghost"
                        className="px-2"
                        size="sm"
                        type="button"
                        onClick={() => setOpenLink(true)}
                      >
                        <LinkIcon className="h-4 w-4 " />
                      </Button>
                    </PopoverTrigger>
                  </TooltipTrigger>

                  <TooltipContent>Link</TooltipContent>
                </Tooltip>
                <PopoverContent className="light border-gray-200 px-4 py-2">
                  <LinkEditorPanel
                    initialUrl={externalLink}
                    onSetLink={(u) => {
                      props.updateAttributes({
                        externalLink: u,
                      });
                      setOpenLink(false);
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
