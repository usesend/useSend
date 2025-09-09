import { ReactNodeViewRenderer } from "@tiptap/react";
import TipTapImage from "@tiptap/extension-image";
import { ResizableImageTemplate } from "../nodes/image-resize";
import { PluginKey, Plugin } from "@tiptap/pm/state";
import { toast } from "@usesend/ui/src/toaster";

const uploadKey = new PluginKey("upload-image");

export type UploadFn = (image: File) => Promise<string>;

interface ResizableImageExtensionOptions {
  uploadImage?: UploadFn;
}

export const ResizableImageExtension =
  TipTapImage.extend<ResizableImageExtensionOptions>({
    addAttributes() {
      return {
        ...this.parent?.(),
        width: { renderHTML: ({ width }) => ({ width }), default: "600" },
        height: { renderHTML: ({ height }) => ({ height }) },
        borderRadius: {
          default: "0",
        },
        borderWidth: {
          default: "0",
        },
        borderColor: {
          default: "rgb(0, 0, 0)",
        },
        alignment: {
          default: "center",
          renderHTML: ({ alignment }) => ({ "data-alignment": alignment }),
          parseHTML: (element) =>
            element.getAttribute("data-alignment") || "center",
        },
        externalLink: {
          default: null,
          renderHTML: ({ externalLink }) => {
            if (!externalLink) {
              return {};
            }
            return {
              "data-external-link": externalLink,
            };
          },
          parseHTML: (element) => {
            const externalLink = element.getAttribute("data-external-link");
            return externalLink ? { externalLink } : null;
          },
        },
        alt: {
          default: "image",
        },
        isUploading: {
          default: false,
        },
      };
    },
    addNodeView() {
      return ReactNodeViewRenderer(ResizableImageTemplate);
    },
    addProseMirrorPlugins() {
      return [
        new Plugin({
          key: uploadKey,
          props: {
            handleDOMEvents: {
              drop: (view, event) => {
                const hasFiles = event.dataTransfer?.files?.length;
                if (!hasFiles) return false;

                event.preventDefault();

                const image = Array.from(event.dataTransfer.files).find(
                  (file) => file.type.startsWith("image/")
                );

                if (!this.options.uploadImage) {
                  toast.error("Upload image is not supported");
                  return true;
                }

                if (!image) {
                  toast.error("Only image is supported");
                  return true;
                }

                event.preventDefault();

                const { schema } = view.state;

                if (!schema.nodes.image) return false;

                const coordinates = view.posAtCoords({
                  left: event.clientX,
                  top: event.clientY,
                });

                const placeholder = URL.createObjectURL(image);
                const node = schema.nodes.image.create({
                  src: placeholder,
                  isUploading: true,
                });
                const transaction = view.state.tr.insert(
                  coordinates?.pos || 0,
                  node
                );
                view.dispatch(transaction);

                this.options
                  .uploadImage?.(image)
                  .then((url) => {
                    const updateTransaction = view.state.tr.setNodeMarkup(
                      coordinates?.pos || 0,
                      null,
                      {
                        src: url,
                        isUploading: false,
                      }
                    );
                    view.dispatch(updateTransaction);
                  })
                  .catch((error) => {
                    // Remove the placeholder image node if there's an error
                    const removeTransaction = view.state.tr.delete(
                      coordinates?.pos || 0,
                      (coordinates?.pos || 0) + 1
                    );
                    view.dispatch(removeTransaction);
                    toast.error("Error uploading image:", error.message);
                    console.error("Error uploading image:", error);
                  });

                return true;
              },
            },
          },
        }),
      ];
    },
  });
