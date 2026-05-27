import type React from "react";

export type WorkspaceTab =
  | "dashboard"
  | "outline"
  | "volumes"
  | "characters"
  | "worldviews"
  | "memory"
  | "consistency"
  | "style"
  | "knowledge"
  | "mainlines"
  | "hooks"
  | "write"
  | "analysis";

export interface NovelDetail {
  id: string;
  title: string;
  genre: string | null;
  inspiration: string | null;
  outline: string | null;
  coverImage: string | null;
  status: string;
  chapters: any[];
  characters: any[];
  worldId: string | null;
}

export interface TabGroup {
  label: string;
  tabs: {
    key: WorkspaceTab;
    label: string;
    icon: React.ReactNode;
  }[];
}
