import { Button } from "@usesend/ui/src/button";
import { cn } from "@usesend/ui/lib/utils";

import { TextMenuItem } from "./TextMenu";

export function TextMenuButton(item: TextMenuItem) {
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={item.command}
      className={cn(
        "px-2.5 hover:bg-slate-100 hover:text-black",
        item.isActive() ? "bg-slate-300" : ""
      )}
      type="button"
    >
      {item.icon ? (
        <item.icon
          className={cn(
            "h-3.5 w-3.5",
            item.isActive() ? "text-black" : "text-slate-700"
          )}
        />
      ) : (
        <span className="text-sm font-medium text-slate-700">{item.name}</span>
      )}
    </Button>
  );
}
