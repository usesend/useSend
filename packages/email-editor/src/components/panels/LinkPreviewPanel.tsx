import { Button } from "@usesend/ui/src/button";
import { Edit2Icon, EditIcon, Trash2Icon } from "lucide-react";

export type LinkPreviewPanelProps = {
  url: string;
  onEdit: () => void;
  onClear: () => void;
};

export const LinkPreviewPanel = ({
  onClear,
  onEdit,
  url,
}: LinkPreviewPanelProps) => {
  return (
    <div className="flex items-center gap-2 p-2">
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-sm underline w-[12rem] overflow-hidden text-ellipsis"
      >
        {url}
      </a>
      <Button onClick={onEdit} variant="silent" size="sm" className="p-1">
        <Edit2Icon className="h-4 w-4" />
      </Button>
      <Button onClick={onClear} variant="silent" size="sm" className="p-1">
        <Trash2Icon className="h-4 w-4 text-destructive" />
      </Button>
    </div>
  );
};
