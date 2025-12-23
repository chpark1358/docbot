"use client";

import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";

type Props = {
  threadId: string;
};

export function ChatDeleteButton({ threadId }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const handleDelete = () => {
    const ok = window.confirm("이 대화를 삭제하시겠습니까?");
    if (!ok) return;
    startTransition(async () => {
      const res = await fetch(`/api/chat/threads/${threadId}`, { method: "DELETE" });
      if (!res.ok) {
        alert("삭제에 실패했습니다.");
        return;
      }
      router.push("/app");
      router.refresh();
    });
  };

  return (
    <Button
      variant="ghost"
      size="sm"
      className="gap-2 text-destructive hover:text-destructive"
      onClick={handleDelete}
      disabled={isPending}
    >
      <Trash2 className="h-4 w-4" /> 삭제
    </Button>
  );
}
