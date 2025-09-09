"use client";

import {
  BubbleMenu,
  EditorContent,
  EditorProvider,
  FloatingMenu,
  useEditor,
} from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import React, { useRef } from "react";
import { TextMenu } from "./menus/TextMenu";
import { cn } from "@usesend/ui/lib/utils";

import { extensions } from "./extensions";
import LinkMenu from "./menus/LinkMenu";
import { Content, Editor as TipTapEditor } from "@tiptap/core";
import { UploadFn } from "./extensions/ImageExtension";

const content = `<h2>Hello World!</h2>

<h3>useSend is the best open source resend alternative.</h3>

<p>Use markdown (<code># </code>, <code>## </code>, <code>### </code>, <code>\`\`</code>, <code>* *</code>, <code>** **</code>) to write your email. </p>
<p>You can <b>Bold</b> text.
You can <i>Italic</i> text.
You can <u>Underline</u> text.
You can <del>Delete</del> text.
You can <code>Code</code> text.
you can change <span style="color: #dc2626;"> color</span> of text. Add <a href="https://usesend.com" target="_blank">link</a> to text
</p>
<br>
You can create ordered list
<ol>
  <li>Ordered list item</li>
  <li>Ordered list item</li>
  <li>Ordered list item</li>
</ol>

<br>
You can create unordered list
<ul>
  <li>Unordered list item</li>
  <li>Unordered list item</li>
  <li>Unordered list item</li>
</ul>

<p></p>
<p>Add code by typing \`\`\` and enter</p>
<pre>
<code>
const usesend = new UseSend("us_12345");

// const usesend = new UseSend("us_12345", "https://app.usesend.com");

usesend.emails.send({
  to: "john@doe.com",
  from: "john@doe.com",
  subject: "Hello World!",
  html: "<p>Hello World!</p>",
  text: "Hello World!",
});
</code>
</pre>
`;

export type EditorProps = {
  onUpdate?: (content: TipTapEditor) => void;
  initialContent?: Content;
  variables?: Array<string>;
  uploadImage?: UploadFn;
};

export const Editor: React.FC<EditorProps> = ({
  onUpdate,
  initialContent,
  variables,
  uploadImage,
}) => {
  const menuContainerRef = useRef(null);

  const editor = useEditor({
    editorProps: {
      attributes: {
        class: cn("unsend-prose w-full"),
      },
      handleDOMEvents: {
        keydown: (_view, event) => {
          // prevent default event listeners from firing when slash command is active
          if (["ArrowUp", "ArrowDown", "Enter"].includes(event.key)) {
            const slashCommand = document.querySelector("#slash-command");
            if (slashCommand) {
              return true;
            }
          }
        },
      },
    },
    extensions: extensions({ variables, uploadImage }),
    onUpdate: ({ editor }) => {
      onUpdate?.(editor);
    },
    content: initialContent,
  });

  return (
    <div
      className="bg-white rounded-md text-black p-8 unsend-editor light"
      ref={menuContainerRef}
    >
      <EditorContent editor={editor} className="min-h-[50vh]" />
      {editor ? <TextMenu editor={editor} /> : null}
      {editor ? <LinkMenu editor={editor} appendTo={menuContainerRef} /> : null}
    </div>
  );
};
