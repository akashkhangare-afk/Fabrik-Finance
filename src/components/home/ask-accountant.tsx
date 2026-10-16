"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MessageSquare } from "lucide-react";
import { askAccountant } from "@/app/actions/app";
import { Button, Textarea } from "@/components/ui/primitives";
import { Modal, useToast } from "@/components/ui/client";

export function AskAccountantButton() {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <MessageSquare className="size-4" /> Message your team
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Message your Fabrik team"
        description="Your question goes to your dedicated accountant through Finance Inbox — no email chains."
        footer={
          <>
            <Button onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              variant="primary"
              disabled={!text.trim() || pending}
              onClick={() =>
                start(async () => {
                  const r = await askAccountant(text);
                  toast(r.ok ? { tone: "success", title: r.message ?? "Sent" } : { tone: "error", title: r.error });
                  if (r.ok) {
                    setOpen(false);
                    setText("");
                    router.refresh();
                  }
                })
              }
            >
              {pending ? "Sending…" : "Send"}
            </Button>
          </>
        }
      >
        <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={5} maxLength={2000} placeholder="e.g. Should the new grain cart be depreciated over 7 years?" data-autofocus />
      </Modal>
    </>
  );
}
