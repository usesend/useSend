import { useTheme } from "@usesend/ui";
import Image from "next/image";

export const FullScreenLoading = () => {
  const { resolvedTheme } = useTheme();
  return (
    <div className="flex items-center justify-center min-h-screen">
      <Image
        src={"/logo-squircle.png"}
        alt="useSend"
        width={45}
        height={45}
        className="mx-auto"
      />
    </div>
  );
};
