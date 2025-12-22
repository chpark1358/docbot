"use client";

import { LogOut } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { logout } from "../actions";

type Props = {
  email: string;
};

const initials = (email: string) => {
  const trimmed = email.trim();
  if (!trimmed) return "U";
  const first = trimmed[0];
  return (first ? first.toUpperCase() : "U").slice(0, 2);
};

export function UserMenu({ email }: Props) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex items-center gap-2 rounded-full border bg-background/60 px-2 py-1 text-sm shadow-sm outline-none transition hover:bg-background">
        <Avatar className="h-7 w-7">
          <AvatarFallback className="bg-muted text-xs">{initials(email)}</AvatarFallback>
        </Avatar>
        <span className="hidden max-w-[200px] truncate text-sm font-medium sm:inline">{email}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="truncate">{email}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <form action={logout} className="w-full">
            <button type="submit" className="flex w-full items-center gap-2">
              <LogOut className="h-4 w-4" />
              로그아웃
            </button>
          </form>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
