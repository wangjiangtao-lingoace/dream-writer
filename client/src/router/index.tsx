import { lazy } from "react";
import type { RouteObject } from "react-router-dom";
import { Navigate, useRoutes } from "react-router-dom";
import AppLayout from "@/components/layout/AppLayout";
import Home from "@/pages/Home";
import NovelList from "@/pages/novels/NovelList";
import NovelCreate from "@/pages/novels/NovelCreate";
import NovelEdit from "@/pages/novels/NovelEdit";
import NovelChapterEdit from "@/pages/novels/NovelChapterEdit";
import CreativeHubPage from "@/pages/creativeHub/CreativeHubPage";
import ChatPage from "@/pages/chat/ChatPage";
import TaskCenterPage from "@/pages/tasks/TaskCenterPage";
import KnowledgePage from "@/pages/knowledge/KnowledgePage";
import SettingsPage from "@/pages/settings/SettingsPage";
import "../styles/layout.css";

const routes: RouteObject[] = [
  {
    path: "/",
    element: <AppLayout />,
    children: [
      { index: true, element: <Home /> },
      { path: "novels", element: <NovelList /> },
      { path: "novels/create", element: <NovelCreate /> },
      { path: "novels/:id/edit", element: <NovelEdit /> },
      { path: "novels/:id/chapters/:chapterId", element: <NovelChapterEdit /> },
      { path: "creative-hub", element: <CreativeHubPage /> },
      { path: "chat-legacy", element: <ChatPage /> },
      { path: "chat", element: <Navigate to="/creative-hub" replace /> },
      { path: "tasks", element: <TaskCenterPage /> },
      { path: "knowledge", element: <KnowledgePage /> },
      { path: "settings", element: <SettingsPage /> },
      { path: "*", element: <Navigate to="/" replace /> },
    ],
  },
];

export default function AppRouter() {
  return useRoutes(routes);
}
