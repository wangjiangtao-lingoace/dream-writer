export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
  const json = (await response.json()) as ApiResponse<T>;
  if (!response.ok || !json.success) {
    throw new Error(json.error || "请求失败。");
  }
  return json.data as T;
}

// 便捷方法
api.get = <T>(url: string, init?: RequestInit): Promise<T> => {
  return api<T>(url, { ...init, method: "GET" });
};

api.post = <T>(url: string, data?: any, init?: RequestInit): Promise<T> => {
  return api<T>(url, {
    ...init,
    method: "POST",
    body: data ? JSON.stringify(data) : undefined,
  });
};

api.put = <T>(url: string, data?: any, init?: RequestInit): Promise<T> => {
  return api<T>(url, {
    ...init,
    method: "PUT",
    body: data ? JSON.stringify(data) : undefined,
  });
};

api.delete = <T>(url: string, init?: RequestInit): Promise<T> => {
  return api<T>(url, { ...init, method: "DELETE" });
};

api.patch = <T>(url: string, data?: any, init?: RequestInit): Promise<T> => {
  return api<T>(url, {
    ...init,
    method: "PATCH",
    body: data ? JSON.stringify(data) : undefined,
  });
};
