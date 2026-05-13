import { useState, useCallback } from "react";
import { api } from "../lib/api";

// 通用加载状态管理
export function useLoading(initialState = false) {
  const [loading, setLoading] = useState(initialState);
  const [error, setError] = useState<string | null>(null);

  const startLoading = useCallback(() => {
    setLoading(true);
    setError(null);
  }, []);

  const stopLoading = useCallback(() => {
    setLoading(false);
  }, []);

  const setLoadingError = useCallback((message: string) => {
    setLoading(false);
    setError(message);
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    loading,
    error,
    startLoading,
    stopLoading,
    setLoadingError,
    clearError,
  };
}

// 通用列表管理
export function useList<T extends { id: string }>(endpoint: string) {
  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadItems = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api<T[]>(endpoint);
      setItems(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, [endpoint]);

  const addItem = useCallback(async (item: Partial<T>) => {
    try {
      const newItem = await api<T>(endpoint, {
        method: "POST",
        body: JSON.stringify(item),
      });
      setItems((prev) => [...prev, newItem]);
      return newItem;
    } catch (err) {
      throw err;
    }
  }, [endpoint]);

  const updateItem = useCallback(async (id: string, updates: Partial<T>) => {
    try {
      const updated = await api<T>(`${endpoint}/${id}`, {
        method: "PUT",
        body: JSON.stringify(updates),
      });
      setItems((prev) => prev.map((item) => item.id === id ? updated : item));
      return updated;
    } catch (err) {
      throw err;
    }
  }, [endpoint]);

  const deleteItem = useCallback(async (id: string) => {
    try {
      await api(`${endpoint}/${id}`, { method: "DELETE" });
      setItems((prev) => prev.filter((item) => item.id !== id));
    } catch (err) {
      throw err;
    }
  }, [endpoint]);

  return {
    items,
    loading,
    error,
    loadItems,
    addItem,
    updateItem,
    deleteItem,
  };
}

// 通知管理
export function useNotification() {
  const [notice, setNotice] = useState("");
  const [noticeType, setNoticeType] = useState<"info" | "success" | "error">("info");

  const showNotice = useCallback((message: string, type: "info" | "success" | "error" = "info") => {
    setNotice(message);
    setNoticeType(type);
    // 自动清除通知
    setTimeout(() => setNotice(""), 5000);
  }, []);

  const clearNotice = useCallback(() => {
    setNotice("");
  }, []);

  return {
    notice,
    noticeType,
    showNotice,
    clearNotice,
  };
}

// 表单管理
export function useForm<T extends Record<string, unknown>>(initialValues: T) {
  const [values, setValues] = useState<T>(initialValues);
  const [errors, setErrors] = useState<Partial<Record<keyof T, string>>>({});

  const setValue = useCallback(<K extends keyof T>(key: K, value: T[K]) => {
    setValues((prev) => ({ ...prev, [key]: value }));
    // 清除该字段的错误
    setErrors((prev) => {
      const newErrors = { ...prev };
      delete newErrors[key];
      return newErrors;
    });
  }, []);

  const setFieldError = useCallback(<K extends keyof T>(key: K, message: string) => {
    setErrors((prev) => ({ ...prev, [key]: message }));
  }, []);

  const resetForm = useCallback(() => {
    setValues(initialValues);
    setErrors({});
  }, [initialValues]);

  const validate = useCallback((validators: Partial<Record<keyof T, (value: T[keyof T]) => string | null>>) => {
    const newErrors: Partial<Record<keyof T, string>> = {};
    let isValid = true;

    for (const [key, validator] of Object.entries(validators)) {
      if (validator) {
        const error = validator(values[key as keyof T]);
        if (error) {
          newErrors[key as keyof T] = error;
          isValid = false;
        }
      }
    }

    setErrors(newErrors);
    return isValid;
  }, [values]);

  return {
    values,
    errors,
    setValue,
    setFieldError,
    resetForm,
    validate,
  };
}
