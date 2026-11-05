import { describe, expect, it } from "vitest";
import { paginateItems } from "../lib/record-pagination";

describe("paginação de registros", () => {
  it("divide resultados em páginas mantendo a ordem", () => {
    const result = paginateItems(Array.from({ length: 32 }, (_, index) => index + 1), 2, 15);
    expect(result.items).toEqual(Array.from({ length: 15 }, (_, index) => index + 16));
    expect(result).toMatchObject({ page: 2, pageSize: 15, total: 32, totalPages: 3 });
  });

  it("limita páginas fora do intervalo e tamanhos inválidos", () => {
    expect(paginateItems([1, 2, 3], 99, 0)).toMatchObject({ items: [1, 2, 3], page: 1, pageSize: 15, totalPages: 1 });
    expect(paginateItems([1, 2, 3], -4, 2)).toMatchObject({ items: [1, 2], page: 1, pageSize: 2, totalPages: 2 });
  });

  it("representa uma lista vazia com uma página sem itens", () => {
    expect(paginateItems([], 1)).toMatchObject({ items: [], page: 1, pageSize: 15, total: 0, totalPages: 1 });
  });
});
