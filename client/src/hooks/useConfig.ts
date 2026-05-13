import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";

interface AIConfig {
  id: string;
  provider: string;
  model: string;
  baseUrl?: string;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

interface CreateConfigInput {
  provider: string;
  model: string;
  apiKey: string;
  baseUrl?: string;
  isDefault?: boolean;
}

export const useAIConfigs = () => {
  return useQuery({
    queryKey: ["ai-configs"],
    queryFn: () => api.get<AIConfig[]>("/api/ai-config"),
  });
};

export const useDefaultConfig = () => {
  return useQuery({
    queryKey: ["ai-config-default"],
    queryFn: () => api.get<AIConfig>("/api/ai-config/default"),
    retry: false,
  });
};

export const useCreateConfig = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateConfigInput) => api.post<AIConfig>("/api/ai-config", input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ai-configs"] });
      queryClient.invalidateQueries({ queryKey: ["ai-config-default"] });
    },
  });
};

export const useDeleteConfig = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/ai-config/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ai-configs"] });
      queryClient.invalidateQueries({ queryKey: ["ai-config-default"] });
    },
  });
};

export const useTestConfig = () => {
  return useMutation({
    mutationFn: (id: string) => api.post<{ success: boolean; message: string }>(`/api/ai-config/${id}/test`),
  });
};
