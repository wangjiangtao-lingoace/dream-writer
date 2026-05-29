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

export type WorkspaceGroupId = "writing" | "dashboard" | "planning" | "assets" | "quality";

export interface WorkspaceGroupDef {
  id: WorkspaceGroupId;
  label: string;
  icon: React.ReactNode;
  tabs: {
    key: WorkspaceTab;
    label: string;
    icon: React.ReactNode;
  }[];
}

export interface ChapterWithVolume {
  id: string;
  order: number;
  title: string;
  wordCount: number;
  status: string;
  source: string;
  volumeTitle?: string;
  emotion?: string;
  conflict?: string;
}

export interface WorkspaceData {
  novel: { title: string; targetWordCount: number };
  chapters: ChapterWithVolume[];
  characters: Array<{ id: string; name: string; role: string; identity?: string; arcSummary?: string }>;
  foreshadows: Array<{ id: string; title: string; description?: string; status: string; plantChapter?: number; payoffChapter?: number }>;
  storyState: {
    currentEmotion: string;
    emotionIntensity: number;
    currentPhase: string;
    protagonistGoal?: string;
    tensionAccumulation: number;
  } | null;
  signals: { mood: string; rhythm: string; climax: boolean };
  writingStats: { todayWordCount: number; targetWordCount: number; totalWordCount: number; streakDays: number; estimatedTime: string };
}

export interface RadarScores {
  pleasureDensity: number;
  emotionWave: number;
  infoRelease: number;
}

export interface AIReview {
  score: number;
  suggestions: string[];
}
