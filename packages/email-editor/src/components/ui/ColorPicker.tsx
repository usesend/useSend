"use client";

import { Button } from "@usesend/ui/src/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@usesend/ui/src/popover";
import { ReactNode, useState } from "react";
import { HexAlphaColorPicker, HexColorInput } from "react-colorful";

type ColorPickerProps = {
  color: string;
  onChange?: (color: string) => void;
};

export function ColorPicker(props: ColorPickerProps) {
  const { color: initialColor, onChange } = props;

  const [color, setColor] = useState(initialColor);

  const handleColorChange = (color: string) => {
    setColor(color);
    onChange?.(color);
  };

  return (
    <div className="min-w-[260px] rounded-xl shadow border border-gray-200 bg-white p-4">
      <HexAlphaColorPicker
        color={color}
        onChange={handleColorChange}
        className="flex !w-full flex-col gap-4"
      />
      <HexColorInput
        alpha={true}
        color={color}
        onChange={handleColorChange}
        className="mt-4 bg-transparent text-black w-full min-w-0 rounded-lg border px-2 py-1.5 text-sm uppercase focus-visible:border-gray-400 focus-visible:outline-none"
        prefixed
      />
    </div>
  );
}

export function ColorPickerPopup(
  props: ColorPickerProps & { trigger: ReactNode }
) {
  const { color, onChange } = props;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" className="" size="sm" type="button">
          {props.trigger}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-full rounded-none border-0 !bg-transparent !p-0 shadow-none drop-shadow-md">
        <ColorPicker
          color={color}
          onChange={(newColor) => {
            // HACK: This is a workaround for a bug in tiptap
            // https://github.com/ueberdosis/tiptap/issues/3580
            //
            //     ERROR: flushSync was called from inside a lifecycle
            //
            // To fix this, we need to make sure that the onChange
            // callback is run after the current execution context.
            queueMicrotask(() => {
              onChange?.(newColor);
            });
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
