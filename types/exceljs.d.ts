import "exceljs";

declare module "exceljs" {
  interface Table {
    table: {
      tableRef: string;
      autoFilterRef?: string;
    };
  }

  interface Worksheet {
    getTables(): Table[];
  }
}
