import { Button } from "@usesend/ui/src/button";
import { CheckIcon } from "lucide-react";
import { useState, useCallback, useMemo } from "react";

export type LinkEditorPanelProps = {
  initialUrl?: string;
  onSetLink: (url: string) => void;
};

export const useLinkEditorState = ({
  initialUrl,
  onSetLink,
}: LinkEditorPanelProps) => {
  const [url, setUrl] = useState(initialUrl || "");

  const onChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    setUrl(event.target.value);
  }, []);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      onSetLink(url);
    },
    [url, onSetLink]
  );

  return {
    url,
    setUrl,
    onChange,
    handleSubmit,
  };
};

export const LinkEditorPanel = ({
  onSetLink,
  initialUrl,
}: LinkEditorPanelProps) => {
  const state = useLinkEditorState({
    onSetLink,
    initialUrl,
  });

  return (
    <div className="">
      <form
        onSubmit={state.handleSubmit}
        className="flex items-center gap-2 justify-between"
      >
        <label className="flex items-center gap-2 p-2 rounded-lg  cursor-text">
          <input
            className="flex-1 bg-transparent outline-none min-w-[12rem] text-black text-sm"
            placeholder="Enter valid url"
            value={state.url}
            onChange={state.onChange}
          />
        </label>
        <Button variant="silent" size="sm" className="px-1">
          <CheckIcon className="h-4 w-4 disabled:opacity-50" />
        </Button>
      </form>
    </div>
  );
};
