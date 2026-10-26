"use client";

import { useCallback, useEffect, useState } from "react";
import type { WorkbookData } from "@/lib/workbook-types";

type WorkbookState = {
  data: WorkbookData | null;
  error: string | null;
  loading: boolean;
};

function apiMessage(value: unknown): string | null {
  if (typeof value !== "object" || value === null || !("error" in value)) {
    return null;
  }
  const error = value.error;
  return typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string"
    ? error.message
    : null;
}

export function useWorkbookData(enabled = true) {
  const [state, setState] = useState<WorkbookState>({
    data: null,
    error: null,
    loading: true,
  });

  const refresh = useCallback(async () => {
    setState((current) => ({ ...current, error: null, loading: true }));
    try {
      const response = await fetch("/api/records", { cache: "no-store" });
      const body: unknown = await response.json();
      if (!response.ok) {
        throw new Error(apiMessage(body) ?? "Não foi possível carregar a planilha.");
      }
      if (
        typeof body !== "object" ||
        body === null ||
        !("headers" in body) ||
        !Array.isArray(body.headers) ||
        !("records" in body) ||
        !Array.isArray(body.records) ||
        !("count" in body) ||
        typeof body.count !== "number"
      ) {
        throw new Error("A resposta da planilha está em formato inesperado.");
      }
      setState({ data: body as WorkbookData, error: null, loading: false });
    } catch (error) {
      setState({
        data: null,
        error:
          error instanceof Error
            ? error.message
            : "Não foi possível carregar a planilha.",
        loading: false,
      });
    }
  }, []);

  useEffect(() => {
    if (!enabled) {
      setState({ data: null, error: null, loading: false });
      return;
    }
    void refresh();
  }, [enabled, refresh]);

  return { ...state, refresh };
}
