import type { RouteObject } from "react-router-dom";
import { useRoutes } from "react-router-dom";
import AppLayout from "@/components/layout/AppLayout";
import BookShelf from "@/pages/BookShelf";
import CreateWork from "@/pages/CreateWork";
import NovelForm from "@/pages/NovelForm";
import NovelWorkspace from "@/pages/NovelWorkspace";
import PipelinePage from "@/pages/PipelinePage";
import GeneralKnowledge from "@/pages/GeneralKnowledge";
import AnalyzeCreate from "@/pages/AnalyzeCreate";

const routes: RouteObject[] = [
  {
    path: "/",
    element: <AppLayout />,
    children: [
      { index: true, element: <BookShelf /> },
      { path: "create", element: <CreateWork /> },
      { path: "create/new", element: <NovelForm /> },
      { path: "create/analyze", element: <AnalyzeCreate /> },
      { path: "novel/:id", element: <NovelWorkspace /> },
      { path: "novel/:id/:tab", element: <NovelWorkspace /> },
      { path: "novel/:id/pipeline", element: <PipelinePage /> },
      { path: "knowledge", element: <GeneralKnowledge /> },
    ],
  },
];

export default function AppRouter() {
  return useRoutes(routes);
}
