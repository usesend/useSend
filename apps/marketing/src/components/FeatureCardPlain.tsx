"use client";

export function FeatureCardPlain({
  title,
  content,
}: {
  title?: string;
  content?: string;
}) {

  return (
    <div className="rounded-[18px] bg-primary/20 p-1">
      <div className="h-full rounded-[14px] bg-primary/20 p-0.5 shadow-sm">
        <div className="bg-background rounded-xl h-full flex flex-col">
          <div className="p-5 flex-1 flex flex-col">
            <h3 className="text-base sm:text-lg text-primary font-sans">
              {title || ""}
            </h3>
            {content ? (
              <p className="mt-2 text-sm leading-relaxed">{content}</p>
            ) : (
              <div className="mt-2 text-sm text-muted-foreground min-h-[1.5rem]"></div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
