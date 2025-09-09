"use client";

import { api } from "~/trpc/react";
import { Spinner } from "@usesend/ui/src/spinner";
import { Input } from "@usesend/ui/src/input";
import { Editor } from "@usesend/email-editor";
import { useState } from "react";
import { Template } from "@prisma/client";
import { toast } from "@usesend/ui/src/toaster";
import { useDebouncedCallback } from "use-debounce";
import { formatDistanceToNow } from "date-fns";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { use } from "react";
const IMAGE_SIZE_LIMIT = 10 * 1024 * 1024;

export default function EditTemplatePage({
  params,
}: {
  params: Promise<{ templateId: string }>;
}) {
  const { templateId } = use(params);

  const {
    data: template,
    isLoading,
    error,
  } = api.template.getTemplate.useQuery(
    { templateId: templateId },
    {
      enabled: !!templateId,
    },
  );

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-full">
        <Spinner className="w-6 h-6" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex justify-center items-center h-full">
        <p className="text-red-500">Failed to load template</p>
      </div>
    );
  }

  if (!template) {
    return <div>Template not found</div>;
  }

  return <TemplateEditor template={template} />;
}

function TemplateEditor({
  template,
}: {
  template: Template & { imageUploadSupported: boolean };
}) {
  const utils = api.useUtils();

  const [json, setJson] = useState<Record<string, any> | undefined>(
    template.content ? JSON.parse(template.content) : undefined,
  );
  const [isSaving, setIsSaving] = useState(false);
  const [name, setName] = useState(template.name);
  const [subject, setSubject] = useState(template.subject);

  const updateTemplateMutation = api.template.updateTemplate.useMutation({
    onSuccess: () => {
      utils.template.getTemplate.invalidate();
      setIsSaving(false);
    },
  });
  const getUploadUrl = api.template.generateImagePresignedUrl.useMutation();

  function updateEditorContent() {
    updateTemplateMutation.mutate({
      templateId: template.id,
      content: JSON.stringify(json),
    });
  }

  const deboucedUpdateTemplate = useDebouncedCallback(
    updateEditorContent,
    1000,
  );

  const handleFileChange = async (file: File) => {
    if (file.size > IMAGE_SIZE_LIMIT) {
      throw new Error(
        `File should be less than ${IMAGE_SIZE_LIMIT / 1024 / 1024}MB`,
      );
    }

    console.log("file type: ", file.type);

    const { uploadUrl, imageUrl } = await getUploadUrl.mutateAsync({
      name: file.name,
      type: file.type,
      templateId: template.id,
    });

    const response = await fetch(uploadUrl, {
      method: "PUT",
      body: file,
    });

    if (!response.ok) {
      throw new Error("Failed to upload file");
    }

    return imageUrl;
  };

  return (
    <div className="p-4 container mx-auto">
      <div className="mx-auto">
        <div className="mb-4 flex justify-between items-center w-[700px] mx-auto">
          <div className="flex items-center gap-3">
            <Link href="/templates">
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <Input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className=" border-0 focus:ring-0 focus:outline-none px-0.5 w-[300px]"
              onBlur={() => {
                if (name === template.name || !name) {
                  return;
                }
                updateTemplateMutation.mutate(
                  {
                    templateId: template.id,
                    name,
                  },
                  {
                    onError: (e) => {
                      toast.error(`${e.message}. Reverting changes.`);
                      setName(template.name);
                    },
                  },
                );
              }}
            />
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-sm text-gray-500">
              {isSaving ? (
                <div className="h-2 w-2 bg-yellow rounded-full" />
              ) : (
                <div className="h-2 w-2 bg-green rounded-full" />
              )}
              {formatDistanceToNow(template.updatedAt) === "less than a minute"
                ? "just now"
                : `${formatDistanceToNow(template.updatedAt)} ago`}
            </div>
          </div>
        </div>

        <div className="flex flex-col mt-4 mb-4 p-4 w-[700px] mx-auto z-50">
          <div className="flex items-center gap-4">
            <label className="block text-sm  w-[80px] text-muted-foreground">
              Subject
            </label>
            <input
              type="text"
              value={subject}
              onChange={(e) => {
                setSubject(e.target.value);
              }}
              onBlur={() => {
                if (subject === template.subject || !subject) {
                  return;
                }
                updateTemplateMutation.mutate(
                  {
                    templateId: template.id,
                    subject,
                  },
                  {
                    onError: (e) => {
                      toast.error(`${e.message}. Reverting changes.`);
                      setSubject(template.subject);
                    },
                  },
                );
              }}
              className="mt-1 py-1 text-sm block w-full outline-none border-b border-transparent  focus:border-border bg-transparent"
            />
          </div>
        </div>

        <div className=" rounded-lg bg-gray-50 w-[700px] mx-auto p-10">
          <div className="w-[600px] mx-auto">
            <Editor
              initialContent={json}
              onUpdate={(content) => {
                setJson(content.getJSON());
                setIsSaving(true);
                deboucedUpdateTemplate();
              }}
              variables={["email", "firstName", "lastName"]}
              uploadImage={
                template.imageUploadSupported ? handleFileChange : undefined
              }
            />
          </div>
        </div>
      </div>
    </div>
  );
}
