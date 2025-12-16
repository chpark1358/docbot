"use client";

import { useFormState, useFormStatus } from "react-dom";
import { useRef } from "react";
import { Upload, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { uploadDocument } from "../actions";

const initialState = { error: undefined as string | undefined, success: undefined as string | undefined };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {pending ? (
        <>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> 업로드 중...
        </>
      ) : (
        "업로드"
      )}
    </Button>
  );
}

export function UploadForm() {
  const [state, formAction] = useFormState(uploadDocument, initialState);
  const inputRef = useRef<HTMLInputElement | null>(null);

  return (
    <Card>
      <CardHeader>
        <CardTitle>문서 업로드</CardTitle>
        <CardDescription>pdf, docx, txt 형식을 올리면 자동으로 처리합니다.</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" action={formAction} encType="multipart/form-data">
          <label
            htmlFor="file"
            className="flex cursor-pointer items-center justify-between rounded-lg border border-dashed p-4 transition hover:border-primary"
          >
            <div className="flex items-center gap-3">
              <Upload className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="font-medium">파일 선택</p>
                <p className="text-sm text-muted-foreground">최대 15MB, pdf/docx/txt</p>
              </div>
            </div>
            <Button
              type="button"
              variant="secondary"
              onClick={(event) => {
                event.preventDefault();
                inputRef.current?.click();
              }}
            >
              찾아보기
            </Button>
          </label>
          <input
            ref={inputRef}
            id="file"
            name="file"
            type="file"
            accept=".pdf,.docx,.txt"
            className="hidden"
            required
            onChange={() => {}}
          />
          <SubmitButton />
          {state?.error ? (
            <p className="text-sm text-destructive">{state.error}</p>
          ) : null}
          {state?.success ? (
            <p className="text-sm text-emerald-600">{state.success}</p>
          ) : null}
        </form>
      </CardContent>
    </Card>
  );
}
